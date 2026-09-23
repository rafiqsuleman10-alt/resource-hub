import type { Metadata } from "next";
import { REASON_LABEL, type FaultReason, type FaultStatus } from "@/lib/faults";
import { fmtWhen } from "@/lib/format";
import { getStaff } from "@/lib/staff";
import WorkActions from "./WorkActions";

export const metadata: Metadata = { title: "Work orders" };

type Fault = {
  id: string;
  work_order_ref: string;
  reason: FaultReason;
  note: string | null;
  photo_path: string | null;
  status: FaultStatus;
  created_at: string;
  items: { tag: string; status: string; current_node_id: string | null; item_types: { name: string } } | null;
  compartments: { number: number } | null;
  locker_nodes: { name: string };
};

type Service = {
  id: string;
  notes: string | null;
  opened_at: string;
  started_at: string | null;
  items: { tag: string; loan_count: number; current_node_id: string | null; item_types: { name: string } };
};

type Closed = {
  id: string;
  trigger: "usage_threshold" | "fault_report";
  closed_at: string;
  notes: string | null;
  items: { tag: string; item_types: { name: string } };
};

export default async function MaintenancePage(props: PageProps<"/maintenance">) {
  const { closed, to } = await props.searchParams;
  const { supabase } = await getStaff();
  const weekAgo = daysAgo(7);

  const [faultsRes, servicesRes, closedRes] = await Promise.all([
    supabase
      .from("fault_reports")
      .select(
        "id, work_order_ref, reason, note, photo_path, status, created_at, items!fault_reports_item_id_fkey(tag, status, current_node_id, item_types(name)), compartments(number), locker_nodes(name)",
      )
      .neq("status", "closed")
      .order("created_at"),
    supabase
      .from("maintenance_records")
      .select("id, notes, opened_at, started_at, items!maintenance_records_item_id_fkey(tag, loan_count, current_node_id, item_types(name))")
      .eq("trigger", "usage_threshold")
      .is("closed_at", null)
      .order("opened_at"),
    supabase
      .from("maintenance_records")
      .select("id, trigger, closed_at, notes, items!maintenance_records_item_id_fkey(tag, item_types(name))")
      .gte("closed_at", weekAgo)
      .order("closed_at", { ascending: false })
      .limit(20),
  ]);
  for (const r of [faultsRes, servicesRes, closedRes]) if (r.error) throw r.error;
  const faults = (faultsRes.data ?? []) as unknown as Fault[];
  const services = (servicesRes.data ?? []) as unknown as Service[];
  const recent = (closedRes.data ?? []) as unknown as Closed[];

  // Short-lived links to the private photos.
  const paths = faults.flatMap((f) => (f.photo_path ? [f.photo_path] : []));
  const photoUrl: Record<string, string> = {};
  if (paths.length) {
    const { data } = await supabase.storage.from("fault-photos").createSignedUrls(paths, 3600);
    for (const s of data ?? []) if (s.path && s.signedUrl) photoUrl[s.path] = s.signedUrl;
  }

  const inProgress = faults.filter((f) => f.status === "in_progress").length + services.filter((s) => s.started_at).length;

  return (
    <>
      <h1 className="mb-3 text-[1.5em] font-bold">Work orders and maintenance</h1>
      {typeof closed === "string" && (
        <p role="status" className="note note-ok mb-4">
          <b>Closed {closed}.</b>{" "}
          {to ? `The item is back in stock at Node S, compartment ${to}.` : "No item needed to go back into stock."}
        </p>
      )}

      <dl className="mb-6 grid grid-cols-3 gap-3 md:max-w-xl">
        <Stat label="Open work orders" value={faults.length} />
        <Stat label="Services due" value={services.length} />
        <Stat label="In progress" value={inProgress} />
      </dl>

      <div className="grid gap-8 lg:grid-cols-[3fr_2fr]">
        <section aria-labelledby="wo-heading">
          <h2 id="wo-heading" className="mb-3 text-[1.2em] font-bold">
            Work orders from fault reports
          </h2>
          {faults.length === 0 ? (
            <p className="text-ink-2">No open work orders. Nice.</p>
          ) : (
            <ul className="grid gap-3">
              {faults.map((f) => (
                <li key={f.id} className="card">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <b>
                      {f.work_order_ref} · {REASON_LABEL[f.reason]}
                    </b>
                    <Badge started={f.status === "in_progress"} />
                  </div>
                  <p className="mt-1 text-[0.9em] text-ink-2">
                    {f.items ? `${f.items.item_types.name}, tag ${f.items.tag}. ` : ""}
                    {f.locker_nodes.name}
                    {f.compartments ? `, compartment ${f.compartments.number}` : ""}. Reported {fmtWhen(f.created_at)}.
                  </p>
                  {f.items?.status === "on_loan" && (
                    <p className="mt-1 text-[0.9em] font-bold text-amber">
                      Still on loan. It comes to maintenance when it&apos;s returned.
                    </p>
                  )}
                  {f.note && <p className="mt-1.5">&ldquo;{f.note}&rdquo;</p>}
                  {f.photo_path &&
                    (photoUrl[f.photo_path] ? (
                      <a href={photoUrl[f.photo_path]} target="_blank" rel="noreferrer" className="mt-1.5 inline-block font-bold text-teal underline">
                        View photo<span className="sr-only"> for {f.work_order_ref}</span> (opens in a new tab)
                      </a>
                    ) : (
                      <p className="mt-1.5 text-[0.85em] text-ink-3">Photo couldn&apos;t be loaded.</p>
                    ))}
                  <WorkActions kind="fault" id={f.id} label={f.work_order_ref} started={f.status === "in_progress"} />
                </li>
              ))}
            </ul>
          )}
        </section>

        <div className="grid content-start gap-8">
          <section aria-labelledby="svc-heading">
            <h2 id="svc-heading" className="mb-1 text-[1.2em] font-bold">
              Routine services due
            </h2>
            <p className="mb-3 text-[0.85em] text-ink-2">
              Items that reached their service count. Closing a service restarts the count.
            </p>
            {services.length === 0 ? (
              <p className="text-ink-2">Nothing is due for a service.</p>
            ) : (
              <ul className="grid gap-3">
                {services.map((s) => (
                  <li key={s.id} className="card">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <b>
                        {s.items.item_types.name} {s.items.tag}
                      </b>
                      <Badge started={!!s.started_at} />
                    </div>
                    <p className="mt-1 text-[0.9em] text-ink-2">
                      {s.notes ?? `${s.items.loan_count} loans since its last service.`} Due since {fmtWhen(s.opened_at)}.
                    </p>
                    <WorkActions
                      kind="service"
                      id={s.id}
                      label={`the service on ${s.items.item_types.name.toLowerCase()} ${s.items.tag}`}
                      started={!!s.started_at}
                    />
                  </li>
                ))}
              </ul>
            )}
          </section>

          <section aria-labelledby="done-heading">
            <h2 id="done-heading" className="mb-3 text-[1.2em] font-bold">
              Closed in the last 7 days
            </h2>
            {recent.length === 0 ? (
              <p className="text-ink-2">Nothing closed yet this week.</p>
            ) : (
              <ul className="divide-y divide-line text-[0.9em]">
                {recent.map((r) => (
                  <li key={r.id} className="py-2">
                    <b>
                      {r.items.item_types.name} {r.items.tag}
                    </b>{" "}
                    <span className="text-ink-2">
                      · {r.trigger === "usage_threshold" ? "routine service" : "fault repair"} · {fmtWhen(r.closed_at)}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </section>
        </div>
      </div>
    </>
  );
}

function daysAgo(days: number) {
  return new Date(Date.now() - days * 86_400_000).toISOString();
}

function Stat({ label, value }: { label: string; value: number }) {
  return (
    <div className="card p-3">
      <dt className="text-[0.8em] text-ink-2">{label}</dt>
      <dd className="text-[1.6em] font-bold">{value}</dd>
    </div>
  );
}

function Badge({ started }: { started: boolean }) {
  return (
    <span
      className={`rounded-full px-2.5 py-0.5 text-[0.8em] font-bold ${
        started ? "bg-teal-soft text-teal" : "bg-amber-soft text-amber"
      }`}
    >
      {started ? "In progress" : "Open"}
    </span>
  );
}
