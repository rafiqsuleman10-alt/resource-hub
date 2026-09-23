import type { Metadata } from "next";
import Link from "next/link";
import { dayKey, fmtTime, fmtWhen } from "@/lib/format";
import { getStudent } from "@/lib/student";
import HoldBanner from "../HoldBanner";

export const metadata: Metadata = { title: "My loans" };

type LoanRow = { id: string; issued_at: string; due_at: string; items: { tag: string; item_types: { name: string } } };

export default async function LoansPage() {
  const { supabase } = await getStudent();
  const { data, error } = await supabase
    .from("loans")
    .select("id, issued_at, due_at, items(tag, item_types(name))")
    .is("returned_at", null)
    .order("due_at");
  if (error) throw error;
  const loans = (data ?? []) as unknown as LoanRow[];
  const now = new Date();

  return (
    <>
      <h1 className="mb-3 text-[1.35em] font-bold">My loans</h1>
      <HoldBanner />
      {loans.length === 0 ? (
        <>
          <p className="mb-3 text-ink-2">You have nothing on loan. Browse equipment to borrow something.</p>
          <Link href="/browse" className="btn btn-primary md:max-w-xs">
            Browse equipment
          </Link>
        </>
      ) : (
        <ul className="grid gap-3 md:grid-cols-2">
          {loans.map((l) => {
            const due = new Date(l.due_at);
            const overdue = due < now;
            const today = dayKey(due) === dayKey(now);
            const used = Math.min(1, Math.max(0, (now.getTime() - Date.parse(l.issued_at)) / (due.getTime() - Date.parse(l.issued_at))));
            return (
              <li key={l.id} className="rounded-2xl border-[1.5px] border-line bg-surface p-3.5">
                <div className="flex justify-between gap-2.5">
                  <div>
                    <b>{l.items.item_types.name}</b>
                    <div className="text-[0.86em] text-ink-2">Tag {l.items.tag}</div>
                  </div>
                  <div
                    className={`text-right text-[0.86em] ${overdue ? "font-bold text-coral" : today ? "font-bold text-amber" : "text-ink-2"}`}
                  >
                    {overdue ? `Overdue since ${fmtWhen(due, now)}` : today ? `Due today ${fmtTime(due)}` : `Due ${fmtWhen(due, now)}`}
                  </div>
                </div>
                <div
                  role="img"
                  aria-label={`${Math.round(used * 100)} per cent of loan period used`}
                  className="mt-2.5 h-1.5 overflow-hidden rounded-sm bg-surface-2"
                >
                  <i
                    className={`block h-full ${overdue ? "bg-coral" : used > 0.75 ? "bg-amber" : "bg-teal"}`}
                    style={{ width: `${used * 100}%` }}
                  />
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </>
  );
}
