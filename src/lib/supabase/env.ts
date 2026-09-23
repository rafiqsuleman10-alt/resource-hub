// The two public Supabase settings. They come from .env.local (on your
// computer) or from the Vercel project settings (when deployed).

// Supabase shows several URLs; only the bare project URL works here. If the
// REST address (".../rest/v1/") was pasted instead, trim it back.
export function toProjectUrl(url: string | undefined): string {
  return (url ?? "").trim().replace(/\/+$/, "").replace(/\/(rest|auth)\/v1$/, "");
}

export const supabaseUrl = toProjectUrl(process.env.NEXT_PUBLIC_SUPABASE_URL);
export const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? "";

export const isSupabaseConfigured = Boolean(supabaseUrl && supabaseAnonKey);
