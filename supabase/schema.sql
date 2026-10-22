-- blop sync: one row of saved progress per user. Run once in Supabase -> SQL Editor.
-- Row-level security means the public anon key in config.js can only reach the signed-in user's own row.

create table if not exists public.progress (
  user_id    uuid primary key references auth.users on delete cascade,
  data       jsonb not null,
  updated_at timestamptz not null default now(),
  constraint progress_data_size check (pg_column_size(data) < 2000000) -- about 2 MB, far above real use
);

alter table public.progress enable row level security;

-- Signed-in users may read, create and update only their own row. There is no delete policy:
-- the row goes away when the account is deleted (on delete cascade).
drop policy if exists "progress: read own row" on public.progress;
create policy "progress: read own row" on public.progress
  for select to authenticated using ((select auth.uid()) = user_id);

drop policy if exists "progress: insert own row" on public.progress;
create policy "progress: insert own row" on public.progress
  for insert to authenticated with check ((select auth.uid()) = user_id);

drop policy if exists "progress: update own row" on public.progress;
create policy "progress: update own row" on public.progress
  for update to authenticated using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);

-- The Data API needs table privileges as well as policies. Signed-out visitors get nothing.
revoke all on public.progress from anon;
grant select, insert, update on public.progress to authenticated;

-- ============================================================================================================
-- Mock interview grading: daily usage per user (feature 7). Run this section once, after the part above.
-- /api/grade calls increment_grade_usage with the service-role key before every grade and refuses once the
-- count passes 20 for the current UTC day. RLS is on with NO policies, so the anon key and signed-in users
-- can't read or write this table at all; only the service role (which bypasses RLS) touches it.
-- ============================================================================================================

create table if not exists public.grade_usage (
  user_id uuid not null references auth.users on delete cascade,
  day     date not null,
  count   int  not null default 0 check (count >= 0),
  primary key (user_id, day)
);

alter table public.grade_usage enable row level security;
revoke all on public.grade_usage from anon, authenticated;

-- Adds one grade for today (UTC) and returns the new count, atomically: concurrent requests can't both
-- read the same count. security definer + an empty search_path; only the service role may call it.
create or replace function public.increment_grade_usage(uid uuid)
returns int
language sql
security definer
set search_path = ''
as $$
  insert into public.grade_usage as g (user_id, day, count)
  values (uid, (now() at time zone 'utc')::date, 1)
  on conflict (user_id, day) do update set count = g.count + 1
  returning g.count;
$$;

revoke all on function public.increment_grade_usage(uuid) from public, anon, authenticated;
grant execute on function public.increment_grade_usage(uuid) to service_role;

-- Gives one grade back (never below 0) when the grader failed to deliver one. Same privileges as above.
create or replace function public.refund_grade_usage(uid uuid)
returns void
language sql
security definer
set search_path = ''
as $$
  update public.grade_usage set count = greatest(count - 1, 0)
  where user_id = uid and day = (now() at time zone 'utc')::date;
$$;

revoke all on function public.refund_grade_usage(uuid) from public, anon, authenticated;
grant execute on function public.refund_grade_usage(uuid) to service_role;
