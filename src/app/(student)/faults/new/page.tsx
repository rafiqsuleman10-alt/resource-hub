import type { Metadata } from "next";
import Link from "next/link";
import { getCampus, getStudent } from "@/lib/student";
import { getOpenLoan } from "../../loans/getLoan";
import FaultForm from "./FaultForm";

export const metadata: Metadata = { title: "Report a fault" };

// Report a fault on a loan (/faults/new?loan=...) or on a locker (/faults/new).
export default async function NewFaultPage(props: PageProps<"/faults/new">) {
  const { loan: loanId } = await props.searchParams;
  const [{ profile }, { nodes }] = await Promise.all([getStudent(), getCampus()]);
  const loan = typeof loanId === "string" ? await getOpenLoan(loanId) : null;

  return (
    <div className="max-w-xl">
      <Link href={loan ? "/loans" : "/faults"} className="mb-1.5 inline-block py-1 font-bold text-teal">
        Back
      </Link>
      <h1 className="mb-1 text-[1.35em] font-bold">Report a fault</h1>
      <p className="mb-3 text-[0.9em] text-ink-2">
        {loan
          ? `About: ${loan.items.item_types.name} (tag ${loan.items.tag})`
          : "Tell us about a problem with a locker. For something you've borrowed, use Report a fault on My loans."}
      </p>
      <FaultForm
        userId={profile.id}
        loan={loan ? { id: loan.id } : null}
        nodes={nodes.map((n) => ({ id: n.id, label: `${n.name}, ${n.place}` }))}
      />
    </div>
  );
}
