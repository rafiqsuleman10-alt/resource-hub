// Rebalancing suggestions for the technician dashboard.
//
// The rule (from the spec): for each item type, move units from the locker
// with the most free units to any locker that has none. We share the free
// units out evenly between the donor and the empty lockers, and the donor
// always keeps at least one.

export type Suggestion = { typeId: string; typeName: string; from: string; to: string; count: number };

export function suggestMoves(
  types: { id: string; name: string }[],
  free: Record<string, Record<string, number>>, // free[typeId][nodeId]
  nodeIds: string[], // online lockers only
): Suggestion[] {
  const out: Suggestion[] = [];
  for (const t of types) {
    const counts = nodeIds.map((n) => ({ node: n, free: free[t.id]?.[n] ?? 0 }));
    const empty = counts.filter((c) => c.free === 0);
    const donor = [...counts].sort((a, b) => b.free - a.free)[0];
    if (!donor || empty.length === 0 || donor.free < 2) continue;
    const share = Math.max(1, Math.floor(donor.free / (empty.length + 1)));
    let left = donor.free;
    for (const e of empty) {
      const count = Math.min(share, left - 1);
      if (count < 1) break;
      out.push({ typeId: t.id, typeName: t.name, from: donor.node, to: e.node, count });
      left -= count;
    }
  }
  return out;
}
