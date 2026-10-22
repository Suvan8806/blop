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
