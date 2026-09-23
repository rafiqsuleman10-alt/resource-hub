"use server";

import type { PostgrestError } from "@supabase/supabase-js";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";

// Buttons on the maintenance screen. The database functions check the role.

export type StaffState = { error?: string };

function friendly(error: PostgrestError) {
  return error.code === "P0001" ? error.message : "Something went wrong on our side. Try again in a moment.";
}

async function rpc(fn: string, args: Record<string, unknown>) {
  const supabase = await createClient();
  return supabase.rpc(fn, args);
}

const note = (formData: FormData) => String(formData.get("note") ?? "").trim() || null;

export async function startWork(_prev: StaffState, formData: FormData): Promise<StaffState> {
  const kind = formData.get("kind");
  const id = String(formData.get("id") ?? "");
  const { error } =
    kind === "service" ? await rpc("start_service", { p_record_id: id }) : await rpc("start_work_order", { p_fault_id: id });
  if (error) return { error: friendly(error) };
  redirect("/maintenance");
}

export async function closeWork(_prev: StaffState, formData: FormData): Promise<StaffState> {
  const kind = formData.get("kind");
  const id = String(formData.get("id") ?? "");
  const label = String(formData.get("label") ?? "");
  const { data, error } =
    kind === "service"
      ? await rpc("close_service", { p_record_id: id, p_note: note(formData) })
      : await rpc("close_work_order", { p_fault_id: id, p_note: note(formData) });
  if (error) return { error: friendly(error) };
  const compartment = (data as { compartment: number | null }).compartment;
  const params = new URLSearchParams({ closed: label, to: compartment === null ? "" : String(compartment) });
  redirect(`/maintenance?${params}`);
}
