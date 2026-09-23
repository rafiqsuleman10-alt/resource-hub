import { createBrowserClient } from "@supabase/ssr";
import { supabaseAnonKey, supabaseUrl } from "./env";

// Supabase client for code that runs in the browser (e.g. live countdowns).
export function createClient() {
  return createBrowserClient(supabaseUrl, supabaseAnonKey);
}
