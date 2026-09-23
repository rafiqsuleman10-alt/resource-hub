"use server";

import type { PostgrestError } from "@supabase/supabase-js";
import { refresh } from "next/cache";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";

// Server actions for the student pages. The database functions they call
// check who is asking and apply the rules (see
// supabase/migrations/20260923000003_reservations.sql), so these stay thin.

export type ActionState = { error?: string };

// Messages raised by our database functions (code P0001) are written for
// students. Anything else is unexpected, so show something general.
function friendly(error: PostgrestError) {
  return error.code === "P0001" ? error.message : "Something went wrong on our side. Try again in a moment.";
}

async function loggedIn() {
  const supabase = await createClient();
  const { data } = await supabase.auth.getClaims();
  if (!data?.claims) redirect("/login");
  return { supabase, userId: data.claims.sub };
}

/** Remember which part of campus the student is near. */
export async function setNearZone(zoneId: string) {
  const { supabase, userId } = await loggedIn();
  await supabase.from("profiles").update({ near_zone_id: zoneId }).eq("id", userId);
  refresh();
}

export async function reserve(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const { supabase } = await loggedIn();
  const { data, error } = await supabase.rpc("reserve_item", {
    p_item_type_id: String(formData.get("type") ?? ""),
    p_node_id: String(formData.get("node") ?? ""),
    p_loan_hours: Number(formData.get("hours")),
  });
  if (error) return { error: friendly(error) };
  const result = data as { ok: boolean; message?: string };
  if (!result.ok) return { error: result.message };
  redirect("/reservation?new=1");
}

export async function cancelReservation(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const { supabase } = await loggedIn();
  const { error } = await supabase.rpc("cancel_reservation", { p_reservation_id: String(formData.get("id") ?? "") });
  if (error) return { error: friendly(error) };
  redirect("/browse?cancelled=1");
}

export async function changeLocker(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const { supabase } = await loggedIn();
  const { error } = await supabase.rpc("change_reservation_node", {
    p_reservation_id: String(formData.get("id") ?? ""),
    p_node_id: String(formData.get("node") ?? ""),
  });
  if (error) return { error: friendly(error) };
  redirect("/reservation?moved=1");
}

export async function extendLoan(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const { supabase } = await loggedIn();
  const id = String(formData.get("id") ?? "");
  const { error } = await supabase.rpc("extend_loan", { p_loan_id: id });
  if (error) return { error: friendly(error) };
  redirect(`/loans?extended=${encodeURIComponent(id)}`);
}

/** Send a fault report. The photo (if any) was already uploaded by the browser. */
export async function reportFault(formData: FormData): Promise<ActionState> {
  const { supabase } = await loggedIn();
  const text = (k: string) => {
    const v = String(formData.get(k) ?? "").trim();
    return v === "" ? null : v;
  };
  const { data, error } = await supabase.rpc("report_fault", {
    p_reason: text("reason"),
    p_note: text("note"),
    p_loan_id: text("loan"),
    p_node_id: text("node"),
    p_photo_path: text("photo"),
  });
  if (error) return { error: friendly(error) };
  redirect(`/faults?sent=${encodeURIComponent(String(data))}`);
}
