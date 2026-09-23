import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { getCampus } from "@/lib/student";
import { getOpenLoan } from "../../getLoan";
import ReturnPick from "./ReturnPick";

export const metadata: Metadata = { title: "Return an item" };

export default async function ReturnPage(props: PageProps<"/loans/[loanId]/return">) {
  const { loanId } = await props.params;
  const [loan, { nodes, walk, you }] = await Promise.all([getOpenLoan(loanId), getCampus()]);
  if (!loan) notFound();

  return (
    <>
      <Link href="/loans" className="mb-1.5 inline-block py-1 font-bold text-teal">
        Back to my loans
      </Link>
      <h1 className="mb-1 text-[1.35em] font-bold">Return {loan.items.item_types.name.toLowerCase()}</h1>
      <p className="mb-2 text-[0.86em] text-ink-2">Any locker takes returns. The nearest is listed first.</p>
      <ReturnPick tag={loan.items.tag} nodes={nodes.map((n) => ({ ...n, minutes: walk[n.id] ?? 0 }))} you={you} />
    </>
  );
}
