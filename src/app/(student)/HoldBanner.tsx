import Link from "next/link";
import { shortPlace } from "@/lib/catalogue";
import { fmtTime } from "@/lib/format";
import { getActiveHold, getCampus } from "@/lib/student";

// Reminds the student of an item they have on hold, on every screen but the
// reservation itself.
export default async function HoldBanner() {
  const [hold, { nodes }] = await Promise.all([getActiveHold(), getCampus()]);
  if (!hold) return null;
  const node = nodes.find((n) => n.id === hold.node_id);

  return (
    <p className="note note-warn mb-4 flex flex-wrap items-center justify-between gap-x-4 gap-y-1">
      <span>
        <b>On hold:</b> {hold.type_name} at {node ? shortPlace(node.place) : hold.node_id} until{" "}
        {fmtTime(hold.hold_until)}.
      </span>
      <Link href="/reservation" className="font-bold text-teal underline">
        See your reservation
      </Link>
    </p>
  );
}
