import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { connection } from "next/server";
import { isSupabaseConfigured } from "@/lib/supabase/env";
import { createClient } from "@/lib/supabase/server";
import LoginForm from "./LoginForm";

export const metadata: Metadata = { title: "Log in" };

export default async function LoginPage() {
  await connection(); // depends on who is logged in, so never pre-build it
  // Already logged in? Go straight to the app.
  if (isSupabaseConfigured) {
    const supabase = await createClient();
    const { data } = await supabase.auth.getClaims();
    if (data?.claims) redirect("/");
  }

  return (
    <>
      <header className="bg-slate text-white">
        <div className="mx-auto max-w-4xl px-5 py-6 md:py-10">
          <h1 className="text-[1.6em] font-bold tracking-tight">Resource Hub</h1>
          <p className="mt-1 max-w-xl text-[#C9D3DC]">
            Borrow shared equipment from smart lockers across Steve Biko Campus. Reserve it, collect it with your
            student card, and return it to any locker.
          </p>
        </div>
      </header>
      <main className="mx-auto max-w-4xl px-4 py-6 md:px-5 md:py-10">
        <LoginForm configured={isSupabaseConfigured} />
      </main>
    </>
  );
}
