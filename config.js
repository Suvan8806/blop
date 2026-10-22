/* Optional login and sync (Supabase). Leave both empty to keep blop fully local; see README "Login and sync".
   The anon key is public by design: row-level security in supabase/schema.sql keeps each user's row private.
   Never put the service-role key here. */
window.BLOP_CONFIG = { supabaseUrl: "", supabaseAnonKey: "" };
