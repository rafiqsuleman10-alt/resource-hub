"use server";

import { createAnonClient } from "@/lib/supabase/anon";

// Server actions for the kiosk. Each calls one kiosk_* database function,
// which checks the card, PIN, tag or reservation itself.

export type KioskResult<T> = { ok: true; data: T } | { ok: false; error: string };

async function call<T>(fn: string, args: Record<string, unknown> = {}): Promise<KioskResult<T>> {
  const { data, error } = await createAnonClient().rpc(fn, args);
  if (error) {
    // Our own messages (code P0001) are written for the person at the locker.
    return { ok: false, error: error.code === "P0001" ? error.message : "The locker couldn't reach the server. Try again." };
  }
  const result = data as T & { error?: string };
  if (result && typeof result === "object" && "error" in result && result.error) return { ok: false, error: result.error };
  return { ok: true, data: result };
}

export type Collection = { reservation_id: string; student: string; compartment: number; item_name: string; tag: string };
export type ReturnStart = { loan_id: string; item_name: string; tag: string; compartment_id: string; compartment: number };

export async function startCollect(node: string, card: string | null, pin: string | null) {
  return call<Collection>("kiosk_start_collect", { p_node: node, p_card: card, p_pin: pin });
}
export async function confirmCollect(reservationId: string) {
  return call<{ due_at: string; holiday: string | null }>("kiosk_confirm_collect", { p_reservation_id: reservationId });
}
export async function collectProblem(reservationId: string, reason: "door_did_not_open" | "wrong_item") {
  return call<{ work_order: string; moved: boolean; compartment?: number }>("kiosk_collect_problem", {
    p_reservation_id: reservationId,
    p_reason: reason,
  });
}
export async function tagsOnLoan() {
  return call<{ tag: string; item_name: string }[]>("kiosk_tags_on_loan");
}
export async function startReturn(node: string, tag: string) {
  return call<ReturnStart>("kiosk_start_return", { p_node: node, p_tag: tag });
}
export async function returnProblem(loanId: string, compartmentId: string) {
  return call<{ work_order: string; moved: boolean; compartment_id?: string; compartment?: number }>(
    "kiosk_return_problem",
    { p_loan_id: loanId, p_compartment_id: compartmentId },
  );
}
export async function confirmReturn(loanId: string, compartmentId: string) {
  return call<{ overdue: boolean; service_due: boolean; fault_open?: boolean }>("kiosk_confirm_return", { p_loan_id: loanId, p_compartment_id: compartmentId });
}
export async function returnCondition(loanId: string, condition: "good" | "minor" | "damaged") {
  return call<{ work_order: string | null }>("kiosk_return_condition", { p_loan_id: loanId, p_condition: condition });
}
