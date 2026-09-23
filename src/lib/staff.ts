// The logged-in technician or maintenance officer. Anyone else goes home.
import { cache } from "react";
import { redirect } from "next/navigation";
import type { Role } from "./demo";
import { createClient } from "./supabase/server";

export const getStaff = cache(async () => {
  const supabase = await createClient();
  const { data: claims } = await supabase.auth.getClaims();
  if (!claims?.claims) redirect("/login");
  const { data: profile, error } = await supabase
    .from("profiles")
    .select("id, display_name, role")
    .eq("id", claims.claims.sub)
    .maybeSingle();
  if (error) throw error;
  if (!profile || (profile.role !== "technician" && profile.role !== "maintenance")) redirect("/");
  return { supabase, profile: profile as { id: string; display_name: string; role: Role } };
});
