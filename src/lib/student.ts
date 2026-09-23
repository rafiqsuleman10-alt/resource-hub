// Shared data for the student pages. Each helper runs at most once per page
// load (React's cache), however many components ask for it.
import { cache } from "react";
import { redirect } from "next/navigation";
import type { NodeInfo } from "./catalogue";
import { createClient } from "./supabase/server";

/** The logged-in student. Anyone else is sent to the home page. */
export const getStudent = cache(async () => {
  const supabase = await createClient();
  const { data: claims } = await supabase.auth.getClaims();
  if (!claims?.claims) redirect("/login");

  const { data: profile, error } = await supabase
    .from("profiles")
    .select("id, display_name, role, near_zone_id")
    .eq("id", claims.claims.sub)
    .maybeSingle();
  if (error) throw error;
  if (!profile || profile.role !== "student") redirect("/");

  return { supabase, profile, zoneId: (profile.near_zone_id as string | null) ?? "S" };
});

export type Zone = { id: string; name: string; position: number };

/** Zones, locker nodes and walking minutes from where the student says they are. */
export const getCampus = cache(async () => {
  const { supabase, zoneId } = await getStudent();
  const [zones, nodes, walks] = await Promise.all([
    supabase.from("zones").select("id, name, position").order("position"),
    supabase.from("locker_nodes").select("id, name, place, position, battery_backup_ok, online").order("position"),
    supabase.from("walk_times").select("node_id, minutes").eq("zone_id", zoneId),
  ]);
  for (const r of [zones, nodes, walks]) if (r.error) throw r.error;

  const walk: Record<string, number> = {};
  for (const w of walks.data ?? []) walk[w.node_id] = w.minutes;
  const zoneList = (zones.data ?? []).map((z) => ({ ...z, position: Number(z.position) })) as Zone[];
  const nodeList = (nodes.data ?? []).map((n) => ({ ...n, position: Number(n.position) })) as NodeInfo[];

  return {
    zones: zoneList,
    // Nearest first.
    nodes: nodeList.sort((a, b) => (walk[a.id] ?? 99) - (walk[b.id] ?? 99)),
    walk,
    you: zoneList.find((z) => z.id === zoneId)?.position ?? 0,
  };
});

/** Ends any holds whose 30 minutes are up, so stock counts are right. */
export const releaseExpiredHolds = cache(async () => {
  const { supabase } = await getStudent();
  const { error } = await supabase.rpc("release_expired_holds");
  if (error) throw error;
});

export type Hold = {
  id: string;
  pin: string;
  hold_until: string;
  loan_hours: number;
  node_id: string;
  compartment: number | null;
  tag: string;
  type_id: string;
  type_name: string;
  loan_hours_options: number[];
};

/** The student's active hold, if they have one. */
export const getActiveHold = cache(async (): Promise<Hold | null> => {
  const { supabase } = await getStudent();
  await releaseExpiredHolds();
  const { data, error } = await supabase
    .from("reservations")
    .select(
      "id, pin, hold_until, loan_hours, node_id, compartments(number), items(tag, item_types(id, name, loan_hours_options))",
    )
    .eq("status", "active")
    .maybeSingle();
  if (error) throw error;
  if (!data) return null;

  // Supabase returns the joined rows as nested objects.
  const row = data as unknown as {
    id: string;
    pin: string;
    hold_until: string;
    loan_hours: number;
    node_id: string;
    compartments: { number: number } | null;
    items: { tag: string; item_types: { id: string; name: string; loan_hours_options: number[] } };
  };
  return {
    id: row.id,
    pin: row.pin,
    hold_until: row.hold_until,
    loan_hours: row.loan_hours,
    node_id: row.node_id,
    compartment: row.compartments?.number ?? null,
    tag: row.items.tag,
    type_id: row.items.item_types.id,
    type_name: row.items.item_types.name,
    loan_hours_options: row.items.item_types.loan_hours_options,
  };
});

/** Free units of each item type at each node: freeUnits[typeId][nodeId]. */
export async function getFreeUnits(typeId?: string) {
  const { supabase } = await getStudent();
  await releaseExpiredHolds();
  let query = supabase.from("items").select("item_type_id, current_node_id").eq("status", "available");
  if (typeId) query = query.eq("item_type_id", typeId);
  const { data, error } = await query;
  if (error) throw error;

  const free: Record<string, Record<string, number>> = {};
  for (const it of data ?? []) {
    if (!it.current_node_id) continue;
    free[it.item_type_id] ??= {};
    free[it.item_type_id][it.current_node_id] = (free[it.item_type_id][it.current_node_id] ?? 0) + 1;
  }
  return free;
}

/** When a loan starting now would be due, and the holiday it was moved off (if any). */
export async function getLoanDue(hours: number) {
  const { supabase } = await getStudent();
  const { data, error } = await supabase
    .rpc("loan_due", { p_start: new Date().toISOString(), p_hours: hours })
    .single();
  if (error) throw error;
  const row = data as { due_at: string; holiday: string | null };
  return { dueAt: row.due_at, holiday: row.holiday };
}
