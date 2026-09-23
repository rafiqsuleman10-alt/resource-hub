"use server";

import { redirect } from "next/navigation";
import { isSupabaseConfigured } from "@/lib/supabase/env";
import { createClient } from "@/lib/supabase/server";

export type LoginState = { error?: string; email?: string };

// Runs on the server when the login form (or a demo button) is submitted.
export async function signIn(_prev: LoginState, formData: FormData): Promise<LoginState> {
  const email = String(formData.get("email") ?? "").trim().toLowerCase();
  const password = String(formData.get("password") ?? "");

  if (!isSupabaseConfigured) {
    return { email, error: "The database isn't connected yet, so nobody can log in. See the README to connect Supabase." };
  }
  if (!email || !password) {
    return { email, error: "Enter your email and password." };
  }

  const supabase = await createClient();
  const { error } = await supabase.auth.signInWithPassword({ email, password });

  if (error) {
    const wrongDetails = error.code === "invalid_credentials" || error.status === 400;
    return {
      email,
      error: wrongDetails
        ? "That email and password don't match. Check them and try again, or use a demo account below."
        : "We couldn't reach the login service. Try again in a moment.",
    };
  }

  redirect("/");
}

export async function signOut() {
  if (isSupabaseConfigured) {
    const supabase = await createClient();
    await supabase.auth.signOut();
  }
  redirect("/login");
}
