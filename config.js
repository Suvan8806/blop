/* Optional login and sync (Supabase). Leave both empty to keep blop fully local; see README "Login and sync".
   The anon key is public by design: row-level security in supabase/schema.sql keeps each user's row private.
   Never put the service-role key here. */
window.BLOP_CONFIG = { supabaseUrl: "", supabaseAnonKey: "",
  /* Web Push (VAPID) public key for the daily reminder. Public by design; the private key is only the
     VAPID_PRIVATE_KEY env var on Vercel. */
  vapidPublicKey: "BL5d6rkLPwBpWv4oyrKMlTsiBQIchKeJNqLninNkrDod7boiA57mPnr_7ix9bPmCjcoykkzwCPlo3OU7WZj--Ds" };
