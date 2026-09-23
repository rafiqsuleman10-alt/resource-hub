import { redirect } from "next/navigation";
import { connection } from "next/server";
import SignOutButton from "@/components/SignOutButton";
import { isSupabaseConfigured } from "@/lib/supabase/env";
import { createClient } from "@/lib/supabase/server";

// Home: sends each person to their own screens.
const HOME = { student: "/browse", technician: "/dashboard", maintenance: "/maintenance" } as const;

export default async function Home() {
  await connection(); // depends on who is logged in, so never pre-build it
  if (!isSupabaseConfigured) redirect("/login");

  const supabase = await createClient();
  const { data: claims } = await supabase.auth.getClaims();
  if (!claims?.claims) redirect("/login");

  const { data: profile, error } = await supabase
    .from("profiles")
    .select("role")
    .eq("id", claims.claims.sub)
    .maybeSingle();
  if (profile) redirect(HOME[profile.role as keyof typeof HOME]);

  // Logged in, but no profile (e.g. the seed script hasn't been run).
  return (
    <>
      <header className="bg-slate text-white">
        <div className="mx-auto flex max-w-4xl items-center justify-between gap-4 px-5 py-5">
          <p className="text-[1.35em] font-bold tracking-tight">Resource Hub</p>
          <SignOutButton />
        </div>
      </header>
      <main className="mx-auto max-w-4xl px-4 py-6 md:px-5">
        <h1 className="sr-only">Resource Hub</h1>
        <p className="note note-bad" role="alert">
          {error
            ? "We couldn't load your profile. Try refreshing the page."
            : "Your account has no profile yet. Ask the technician to run the seed script (npm run seed)."}
        </p>
      </main>
    </>
  );
}
