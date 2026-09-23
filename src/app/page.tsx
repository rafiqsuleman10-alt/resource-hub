import { redirect } from "next/navigation";
import { connection } from "next/server";
import { ROLE_LABEL, type Role } from "@/lib/demo";
import { isSupabaseConfigured } from "@/lib/supabase/env";
import { createClient } from "@/lib/supabase/server";
import { signOut } from "./login/actions";

// Home page. Students go straight to Browse; staff see who is logged in
// until their dashboards arrive in later phases.
const COMING_NEXT: Record<Role, string[]> = {
  student: [],
  technician: ["Dashboard with stock at every locker", "Overdue loans and open faults", "Reset demo data"],
  maintenance: ["Open work orders", "Items due for a service"],
};

export default async function Home() {
  await connection(); // depends on who is logged in, so never pre-build it
  if (!isSupabaseConfigured) redirect("/login");

  const supabase = await createClient();
  const { data: claims } = await supabase.auth.getClaims();
  if (!claims?.claims) redirect("/login");

  const { data: profile, error } = await supabase
    .from("profiles")
    .select("display_name, role, faculty, year_of_study")
    .eq("id", claims.claims.sub)
    .maybeSingle();
  if (profile?.role === "student") redirect("/browse");

  return (
    <>
      <header className="bg-slate text-white">
        <div className="mx-auto flex max-w-4xl items-center justify-between gap-4 px-5 py-5">
          <h1 className="text-[1.35em] font-bold tracking-tight">Resource Hub</h1>
          <form action={signOut}>
            <button
              type="submit"
              className="rounded-lg border border-white/30 px-3 py-1.5 text-[0.9em] hover:bg-white/10"
            >
              Log out
            </button>
          </form>
        </div>
      </header>

      <main className="mx-auto grid max-w-4xl gap-4 px-4 py-6 md:px-5">
        {profile ? (
          <section className="card">
            <h2 className="text-[1.2em] font-bold">Hi, {profile.display_name}</h2>
            <p className="text-ink-2">
              You&apos;re logged in as a <b className="text-ink">{ROLE_LABEL[profile.role as Role]}</b>
              {profile.faculty && ` · ${profile.faculty}, year ${profile.year_of_study}`}.
            </p>
            <h3 className="mt-4 mb-1 font-bold">Coming in the next phases</h3>
            <ul className="list-disc pl-5 text-ink-2">
              {COMING_NEXT[profile.role as Role].map((line) => (
                <li key={line}>{line}</li>
              ))}
            </ul>
          </section>
        ) : (
          <p className="note note-bad" role="alert">
            {error
              ? "We couldn't load your profile. Try refreshing the page."
              : "Your account has no profile yet. Ask the technician to run the seed script (npm run seed)."}
          </p>
        )}
      </main>
    </>
  );
}
