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

/** "Mark as moved" on a rebalancing suggestion. */
export async function moveStock(_prev: StaffState, formData: FormData): Promise<StaffState> {
  const { data, error } = await rpc("move_stock", {
    p_item_type_id: String(formData.get("type") ?? ""),
    p_from: String(formData.get("from") ?? ""),
    p_to: String(formData.get("to") ?? ""),
    p_count: Number(formData.get("count")),
  });
  if (error) return { error: friendly(error) };
  const params = new URLSearchParams({
    moved: String(data),
    item: String(formData.get("name") ?? ""),
    from: String(formData.get("from") ?? ""),
    to: String(formData.get("to") ?? ""),
  });
  redirect(`/dashboard?${params}`);
}

/** Put all the demo data back to how it started (technicians only; the database checks). */
export async function resetDemo(): Promise<StaffState> {
  const { error } = await rpc("reset_demo_data", {});
  if (error) return { error: error.message.includes("Only a technician") ? error.message : friendly(error) };
  redirect("/dashboard?reset=1");
}

/** Switch a locker's battery backup or online status (for demonstrating the warnings). */
export async function setNodeStatus(_prev: StaffState, formData: FormData): Promise<StaffState> {
  const field = formData.get("field");
  if (field !== "battery_backup_ok" && field !== "online") return { error: "Unknown setting." };
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("locker_nodes")
    .update({ [field]: formData.get("value") === "true" })
    .eq("id", String(formData.get("node") ?? ""))
    .select("id");
  if (error || !data?.length) return { error: "Only technicians can change a locker's status." };
  redirect("/dashboard");
}
