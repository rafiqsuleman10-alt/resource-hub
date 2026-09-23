import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { dayKey, fmtDuration, fmtWhen, saDayStart } from "@/lib/format";
import { suggestMoves } from "@/lib/rebalance";
import { getStaff } from "@/lib/staff";
import { MoveButton, NodeSwitch, ResetDemo } from "./Controls";
import LoansChart, { type Day } from "./LoansChart";

export const metadata: Metadata = { title: "Dashboard" };

type Item = { item_type_id: string; current_node_id: string | null; status: string };
type Node = { id: string; name: string; place: string; battery_backup_ok: boolean; online: boolean };
type OpenLoan = {
  id: string;
  due_at: string;
  profiles: { display_name: string };
  items: { tag: string; item_types: { name: string } };
};

const weekdayFmt = new Intl.DateTimeFormat("en-ZA", { timeZone: "Africa/Johannesburg", weekday: "short" });
const dateFmt = new Intl.DateTimeFormat("en-ZA", { timeZone: "Africa/Johannesburg", day: "numeric" });
const longFmt = new Intl.DateTimeFormat("en-ZA", { timeZone: "Africa/Johannesburg", weekday: "short", day: "numeric", month: "short" });

// Everything the dashboard shows, loaded in one go. Technicians can read
// every table (see the security rules), so these are plain queries.
async function loadDashboard() {
  const { supabase } = await getStaff();
  const now = new Date();
  await supabase.rpc("release_expired_holds");

  const [items, types, nodes, openLoans, attempts, recentLoans, faults, services] = await Promise.all([
    supabase.from("items").select("item_type_id, current_node_id, status"),
    supabase.from("item_types").select("id, name").order("name"),
    supabase.from("locker_nodes").select("id, name, place, battery_backup_ok, online").order("position"),
    supabase
      .from("loans")
      .select("id, due_at, profiles!loans_student_id_fkey(display_name), items!loans_item_id_fkey(tag, item_types(name))")
      .is("returned_at", null)
      .order("due_at"),
    supabase.from("reservation_attempts").select("succeeded").gte("created_at", saDayStart(0, now).toISOString()),
    supabase.from("loans").select("issued_at").gte("issued_at", saDayStart(13, now).toISOString()),
    supabase.from("fault_reports").select("id", { count: "exact", head: true }).neq("status", "closed"),
    supabase
      .from("maintenance_records")
      .select("id", { count: "exact", head: true })
      .eq("trigger", "usage_threshold")
      .is("closed_at", null),
  ]);
  for (const r of [items, types, nodes, openLoans, attempts, recentLoans, faults, services]) if (r.error) throw r.error;

  // Loans per day for the last 14 days, today last.
  const perDay = new Map<string, number>();
  for (const l of recentLoans.data ?? []) perDay.set(dayKey(l.issued_at), (perDay.get(dayKey(l.issued_at)) ?? 0) + 1);
  const days: Day[] = Array.from({ length: 14 }, (_, i) => {
    const d = new Date(saDayStart(13 - i, now).getTime() + 12 * 3_600_000); // midday, safely inside the day
    return { key: dayKey(d), weekday: weekdayFmt.format(d), date: dateFmt.format(d), long: longFmt.format(d), count: perDay.get(dayKey(d)) ?? 0 };
  });

  return {
    now,
    items: (items.data ?? []) as Item[],
    types: types.data ?? [],
    nodes: (nodes.data ?? []) as Node[],
    openLoans: (openLoans.data ?? []) as unknown as OpenLoan[],
    attempts: attempts.data ?? [],
    days,
    openFaults: faults.count ?? 0,
    servicesDue: services.count ?? 0,
  };
}

export default async function DashboardPage(props: PageProps<"/dashboard">) {
  const { profile } = await getStaff();
  if (profile.role !== "technician") redirect("/maintenance");
  const sp = await props.searchParams;
  const d = await loadDashboard();

  // ---- Figures ----
  const count = (status: string) => d.items.filter((i) => i.status === status).length;
  const inUse = d.items.filter((i) => i.status !== "retired").length;
  const onLoan = count("on_loan");
  const overdue = d.openLoans.filter((l) => new Date(l.due_at) < d.now);
  const tries = d.attempts.length;
  const ok = d.attempts.filter((a) => a.succeeded).length;
  const pct = (n: number, of: number) => `${Math.round((n / of) * 100)}%`;

  // ---- Stock by locker and item type (free units) ----
  const free: Record<string, Record<string, number>> = {};
  const onLoanByType: Record<string, number> = {};
  const serviceByType: Record<string, number> = {};
  for (const i of d.items) {
    if (i.status === "available" && i.current_node_id) {
      free[i.item_type_id] ??= {};
      free[i.item_type_id][i.current_node_id] = (free[i.item_type_id][i.current_node_id] ?? 0) + 1;
    }
    if (i.status === "on_loan") onLoanByType[i.item_type_id] = (onLoanByType[i.item_type_id] ?? 0) + 1;
    if (i.status === "in_service") serviceByType[i.item_type_id] = (serviceByType[i.item_type_id] ?? 0) + 1;
  }
  const moves = suggestMoves(d.types, free, d.nodes.filter((n) => n.online).map((n) => n.id));
  const nodeName = (id: string) => d.nodes.find((n) => n.id === id)?.name ?? id;

  return (
    <>
      <h1 className="mb-3 text-[1.5em] font-bold">Dashboard</h1>
      <div aria-live="polite">
        {sp.reset && (
          <p role="status" className="note note-ok mb-4">
            <b>Demo data reset.</b> Everything is back to how it started.
          </p>
        )}
        {typeof sp.moved === "string" && (
          <p role="status" className="note note-ok mb-4">
            <b>Moved {sp.moved}.</b> {String(sp.item)} from {nodeName(String(sp.from))} to {nodeName(String(sp.to))}.
          </p>
        )}
      </div>

      {/* Key figures */}
      <dl className="mb-8 grid grid-cols-2 gap-3 sm:grid-cols-4 xl:grid-cols-7">
        <Stat label="On loan" value={onLoan} />
        <Stat label="Available" value={count("available")} />
        <Stat label="Reserved" value={count("reserved")} />
        <Stat label="Overdue" value={overdue.length} warn={overdue.length > 0} />
        <Stat label="In service" value={count("in_service")} />
        <Stat
          label="Fill rate today"
          value={tries ? pct(ok, tries) : "–"}
          hint={tries ? `${ok} of ${tries} reservations met` : "No reservations yet today"}
        />
        <Stat label="Utilisation" value={inUse ? pct(onLoan, inUse) : "–"} hint={`${onLoan} of ${inUse} units on loan`} />
      </dl>

      <div className="grid gap-8 lg:grid-cols-[3fr_2fr]">
        <div className="grid min-w-0 content-start gap-8">
          <section aria-labelledby="chart-heading" className="card">
            <h2 id="chart-heading" className="mb-0.5 text-[1.15em] font-bold">
              Loans per day
            </h2>
            <p className="mb-7 text-[0.85em] text-ink-2">Last 14 days, today on the right.</p>
            <LoansChart days={d.days} />
          </section>

          <section aria-labelledby="stock-heading">
            <h2 id="stock-heading" className="mb-1 text-[1.15em] font-bold">
              Free units by locker
            </h2>
            <p className="mb-2 text-[0.85em] text-ink-2">Ready to borrow now. A red 0 means that locker has none.</p>
            <div className="overflow-x-auto rounded-2xl border-[1.5px] border-line bg-surface">
              <table className="w-full text-[0.9em]">
                <thead>
                  <tr className="border-b border-line text-left">
                    <th scope="col" className="px-3 py-2 font-bold">
                      Item
                    </th>
                    {d.nodes.map((n) => (
                      <th key={n.id} scope="col" className="px-3 py-2 text-right font-bold whitespace-nowrap">
                        {n.name}
                      </th>
                    ))}
                    <th scope="col" className="px-3 py-2 text-right font-bold whitespace-nowrap">
                      On loan
                    </th>
                    <th scope="col" className="px-3 py-2 text-right font-bold whitespace-nowrap">
                      In service
                    </th>
                  </tr>
                </thead>
                <tbody className="tabular-nums">
                  {d.types.map((t) => (
                    <tr key={t.id} className="border-b border-line last:border-0">
                      <th scope="row" className="px-3 py-1.5 text-left font-normal">
                        {t.name}
                      </th>
                      {d.nodes.map((n) => {
                        const v = free[t.id]?.[n.id] ?? 0;
                        return (
                          <td key={n.id} className={`px-3 py-1.5 text-right ${v === 0 ? "font-bold text-coral" : ""}`}>
                            {v}
                          </td>
                        );
                      })}
                      <td className="px-3 py-1.5 text-right text-ink-2">{onLoanByType[t.id] ?? 0}</td>
                      <td className="px-3 py-1.5 text-right text-ink-2">{serviceByType[t.id] ?? 0}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>
        </div>

        <div className="grid min-w-0 content-start gap-8">
          <section aria-labelledby="moves-heading">
            <h2 id="moves-heading" className="mb-1 text-[1.15em] font-bold">
              Rebalancing suggestions
            </h2>
            <p className="mb-2 text-[0.85em] text-ink-2">
              Where a locker has none of an item, take some from the locker with the most. Mark each move once
              you&apos;ve carried the items over.
            </p>
            {moves.length === 0 ? (
              <p className="text-ink-2">Every locker has at least one of everything that&apos;s free. Nothing to move.</p>
            ) : (
              <ul className="grid gap-2">
                {moves.map((m) => (
                  <li key={`${m.typeId}-${m.to}`} className="card flex flex-wrap items-center justify-between gap-2 p-3">
                    <span>
                      Move <b>{m.count}</b> {m.typeName.toLowerCase()} from <b>{nodeName(m.from)}</b> to{" "}
                      <b>{nodeName(m.to)}</b>
                    </span>
                    <MoveButton type={m.typeId} name={m.typeName} from={m.from} to={m.to} count={m.count} />
                  </li>
                ))}
              </ul>
            )}
          </section>

          <section aria-labelledby="overdue-heading">
            <h2 id="overdue-heading" className="mb-2 text-[1.15em] font-bold">
              Overdue loans
            </h2>
            {overdue.length === 0 ? (
              <p className="text-ink-2">Nothing is overdue.</p>
            ) : (
              <ul className="grid gap-2">
                {overdue.map((l) => (
                  <li key={l.id} className="card border-coral-soft p-3">
                    <b>
                      {l.items.item_types.name} {l.items.tag}
                    </b>
                    <span className="block text-[0.9em] text-ink-2">
                      {l.profiles.display_name} · was due {fmtWhen(l.due_at, d.now)}
                    </span>
                    <span className="block text-[0.9em] font-bold text-coral">
                      {fmtDuration(d.now.getTime() - Date.parse(l.due_at))} late
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </section>

          <section aria-labelledby="maint-heading">
            <h2 id="maint-heading" className="mb-2 text-[1.15em] font-bold">
              Faults and maintenance
            </h2>
            <p className="mb-2">
              <b>{d.openFaults}</b> open work order{d.openFaults === 1 ? "" : "s"} · <b>{d.servicesDue}</b> routine
              service{d.servicesDue === 1 ? "" : "s"} due
            </p>
            <Link href="/maintenance" className="font-bold text-teal underline">
              Go to work orders
            </Link>
          </section>

          <section aria-labelledby="lockers-heading">
            <h2 id="lockers-heading" className="mb-1 text-[1.15em] font-bold">
              Lockers
            </h2>
            <p className="mb-2 text-[0.85em] text-ink-2">
              Switch these off to see the warnings students and the locker screens show.
            </p>
            <ul className="grid gap-2">
              {d.nodes.map((n) => (
                <li key={n.id} className="card p-3">
                  <b>{n.name}</b> <span className="text-[0.9em] text-ink-2">{n.place}</span>
                  <NodeSwitch node={n.id} field="online" value={n.online} label="Online" />
                  <NodeSwitch node={n.id} field="battery_backup_ok" value={n.battery_backup_ok} label="Battery backup ready" />
                </li>
              ))}
            </ul>
          </section>

          <section aria-labelledby="reset-heading">
            <h2 id="reset-heading" className="mb-1 text-[1.15em] font-bold">
              Demo data
            </h2>
            <p className="mb-2 text-[0.85em] text-ink-2">Start the demo again from the sample data.</p>
            <ResetDemo />
          </section>
        </div>
      </div>
    </>
  );
}

function Stat({ label, value, hint, warn }: { label: string; value: number | string; hint?: string; warn?: boolean }) {
  return (
    <div className={`card p-3 ${warn ? "border-coral-soft bg-coral-soft" : ""}`}>
      <dt className="text-[0.85em] text-ink-2">{label}</dt>
      <dd className={`text-[1.7em] leading-tight font-bold ${warn ? "text-coral" : ""}`}>{value}</dd>
      {hint && <dd className="text-[0.78em] text-ink-2">{hint}</dd>}
    </div>
  );
}
