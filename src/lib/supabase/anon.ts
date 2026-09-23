import { createClient } from "@supabase/supabase-js";
import { supabaseAnonKey, supabaseUrl } from "./env";

// Supabase client with no login, for the locker kiosk. It deliberately
// ignores any student who happens to be logged in on the same browser, so
// the kiosk only ever does what the kiosk_* database functions allow.
export function createAnonClient() {
  return createClient(supabaseUrl, supabaseAnonKey, {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
  });
}
