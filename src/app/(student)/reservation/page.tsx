import type { Metadata } from "next";
import Link from "next/link";
import { shortPlace } from "@/lib/catalogue";
import { fmtTime, fmtWhen } from "@/lib/format";
import { getActiveHold, getCampus, getLoanDue, getStudent } from "@/lib/student";
import CancelHold from "./CancelHold";
import Countdown from "./Countdown";

export const metadata: Metadata = { title: "Ready to collect" };

export default async function ReservationPage(props: PageProps<"/reservation">) {
  const { new: isNew, moved } = await props.searchParams;
  const [hold, { nodes, walk }] = await Promise.all([getActiveHold(), getCampus()]);

  if (!hold) return <NoHold />;

  const node = nodes.find((n) => n.id === hold.node_id);
  const due = await getLoanDue(hold.loan_hours);

  return (
    <>
      <h1 className="mb-3 text-[1.35em] font-bold">Ready to collect</h1>
      {(isNew || moved) && (
        <p role="status" className="note note-ok mb-3">
          {isNew
            ? "Reserved. It's held for you for 30 minutes."
            : `Moved. Your ${hold.type_name.toLowerCase()} is now held at ${node ? shortPlace(node.place) : hold.node_id}.`}
        </p>
      )}

      <div className="grid gap-x-10 md:grid-cols-2">
        <section aria-label="Your hold" className="rounded-[18px] bg-amber-soft p-[18px]">
          <p className="text-[0.86em]">Held for you for</p>
          <Countdown until={hold.hold_until} serverNow={new Date().toISOString()} />
          <p className="mt-1.5 text-[0.86em] text-ink-2">
            {hold.type_name} at {node?.place ?? hold.node_id}. Held until {fmtTime(hold.hold_until)}.
          </p>
          <dl className="mt-3.5 grid grid-cols-2 gap-2.5">
            <Fact label="Compartment" value={hold.compartment ?? "–"} />
            <Fact label="Backup PIN" value={<span className="tracking-[0.3em]">{hold.pin}</span>} />
            <Fact label="Walk from here" value={`${walk[hold.node_id] ?? "?"} min`} />
            <Fact label="Due back" value={fmtWhen(due.dueAt)} />
          </dl>
          {node && !node.battery_backup_ok && (
            <p className="note note-warn mt-3">
              <b>Battery backup not ready at {node.name}.</b> If the power goes off, the door may not open. Choose
              another locker if you can.
            </p>
          )}
        </section>

        <div>
          <p className="mt-3 text-[0.9em] text-ink-2 md:mt-0">
            At the locker, tap your student card on the reader. If your card doesn&apos;t work, enter the backup PIN.
            The loan starts when you collect, so the due time is worked out then.
          </p>
          {due.holiday && (
            <p className="note note-warn mt-3">
              <b>Due date moved.</b> This loan would end on {due.holiday}, when no technicians are on campus, so
              it&apos;s due the next working morning instead.
            </p>
          )}
          <Link href={`/kiosk/${hold.node_id}?mode=collect`} className="btn btn-primary mt-3">
            I&apos;m at the locker
          </Link>
          <p className="mt-1 text-[0.8em] text-ink-3">Demo: this opens the locker&apos;s touchscreen in this browser.</p>
          <Link href="/reservation/change" className="btn btn-secondary mt-3">
            Change locker
          </Link>
          <CancelHold id={hold.id} />
        </div>
      </div>
    </>
  );
}

function Fact({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="rounded-xl bg-surface px-3 py-2.5">
      <dt className="text-[0.78em] text-ink-3">{label}</dt>
      <dd className="text-[1.15em] font-bold">{value}</dd>
    </div>
  );
}

// The student's most recent hold, if it ran out in the last two hours.
async function getRecentlyExpired() {
  const { supabase } = await getStudent();
  const { data: last, error } = await supabase
    .from("reservations")
    .select("status, hold_until, items(item_types(name))")
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) throw error;
  const row = last as unknown as { status: string; hold_until: string; items: { item_types: { name: string } } } | null;
  const twoHoursAgo = Date.now() - 2 * 60 * 60 * 1000;
  return row?.status === "expired" && Date.parse(row.hold_until) > twoHoursAgo
    ? { name: row.items.item_types.name, endedAt: row.hold_until }
    : null;
}

// No active hold: explain what happened to the last one, if it just ran out.
async function NoHold() {
  const expired = await getRecentlyExpired();

  return (
    <>
      <h1 className="mb-3 text-[1.35em] font-bold">Ready to collect</h1>
      {expired && (
        <p role="status" className="note note-warn mb-3">
          <b>Your hold ended.</b> The 30 minutes for your {expired.name.toLowerCase()} ran out at{" "}
          {fmtTime(expired.endedAt)}, so it went back on the shelf. You can reserve it again if one is free.
        </p>
      )}
      <p className="mb-3 text-ink-2">You have nothing on hold. Browse equipment to reserve something.</p>
      <Link href="/browse" className="btn btn-primary md:max-w-xs">
        Browse equipment
      </Link>
    </>
  );
}
