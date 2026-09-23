import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { getActiveHold, getCampus, getFreeUnits } from "@/lib/student";
import ChangeForm from "./ChangeForm";

export const metadata: Metadata = { title: "Change locker" };

export default async function ChangeLockerPage() {
  const hold = await getActiveHold();
  if (!hold) redirect("/reservation");
  const [{ nodes, walk, you }, free] = await Promise.all([getCampus(), getFreeUnits(hold.type_id)]);
  const stock = free[hold.type_id] ?? {};

  return (
    <>
      <Link href="/reservation" className="mb-1.5 inline-block py-1 font-bold text-teal">
        Back to my reservation
      </Link>
      <h1 className="mb-1 text-[1.35em] font-bold">Change locker</h1>
      <p className="mb-2 text-[0.86em] text-ink-2">
        Collect your {hold.type_name.toLowerCase()} from a different locker. Your PIN and time left stay the same.
      </p>
      <ChangeForm
        holdId={hold.id}
        current={hold.node_id}
        nodes={nodes.map((n) => ({ ...n, free: stock[n.id] ?? 0, minutes: walk[n.id] ?? 0 }))}
        you={you}
      />
    </>
  );
}
