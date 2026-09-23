import type { Metadata } from "next";
import Link from "next/link";
import { REASON_LABEL, STUDENT_STATUS, type FaultReason, type FaultStatus } from "@/lib/faults";
import { fmtWhen } from "@/lib/format";
import { getStudent } from "@/lib/student";

export const metadata: Metadata = { title: "My fault reports" };

type Report = {
  id: string;
  work_order_ref: string;
  reason: FaultReason;
  note: string | null;
  photo_path: string | null;
  status: FaultStatus;
  created_at: string;
  items: { tag: string; item_types: { name: string } } | null;
  locker_nodes: { name: string };
};

export default async function FaultsPage(props: PageProps<"/faults">) {
  const { sent } = await props.searchParams;
  const { supabase } = await getStudent();
  const { data, error } = await supabase
    .from("fault_reports")
    .select("id, work_order_ref, reason, note, photo_path, status, created_at, items!fault_reports_item_id_fkey(tag, item_types(name)), locker_nodes(name)")
    .order("created_at", { ascending: false });
  if (error) throw error;
  const reports = (data ?? []) as unknown as Report[];

  return (
    <div className="max-w-3xl">
      <Link href="/loans" className="mb-1.5 inline-block py-1 font-bold text-teal">
        Back to my loans
      </Link>
      <h1 className="mb-3 text-[1.35em] font-bold">My fault reports</h1>
      {sent && (
        <p role="status" className="note note-ok mb-4">
          <b>Fault reported.</b> Reference {sent}. A technician has been notified. You won&apos;t be charged for a fault
          you report.
        </p>
      )}
      {reports.length === 0 ? (
        <p className="mb-3 text-ink-2">You haven&apos;t reported any faults.</p>
      ) : (
        <ul className="mb-4 grid gap-3">
          {reports.map((r) => (
            <li key={r.id} className="rounded-2xl border-[1.5px] border-line bg-surface p-3.5">
              <div className="flex flex-wrap justify-between gap-2">
                <b>{REASON_LABEL[r.reason]}</b>
                <span
                  className={`rounded-full px-2.5 py-0.5 text-[0.8em] font-bold ${
                    r.status === "closed" ? "bg-teal-soft text-teal" : "bg-amber-soft text-amber"
                  }`}
                >
                  {STUDENT_STATUS[r.status]}
                </span>
              </div>
              <p className="text-[0.9em] text-ink-2">
                {r.items ? `${r.items.item_types.name}, tag ${r.items.tag}` : `Locker: ${r.locker_nodes.name}`} · {r.work_order_ref}{" "}
                · {fmtWhen(r.created_at)}
              </p>
              {r.note && <p className="mt-1 text-[0.9em]">&ldquo;{r.note}&rdquo;</p>}
              {r.photo_path && <p className="mt-1 text-[0.85em] text-ink-3">Photo attached</p>}
            </li>
          ))}
        </ul>
      )}
      <Link href="/faults/new" className="btn btn-secondary md:max-w-xs">
        Report a problem with a locker
      </Link>
    </div>
  );
}
