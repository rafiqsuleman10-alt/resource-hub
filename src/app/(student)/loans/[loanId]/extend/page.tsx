import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { fmtWhen } from "@/lib/format";
import { getStudent } from "@/lib/student";
import { getOpenLoan } from "../../getLoan";
import ExtendButton from "./ExtendButton";

export const metadata: Metadata = { title: "Extend a loan" };

type Check = {
  allowed: boolean;
  reason?: "already_extended" | "overdue" | "waiting";
  due_at: string;
  new_due_at: string;
  holiday: string | null;
};

export default async function ExtendPage(props: PageProps<"/loans/[loanId]/extend">) {
  const { loanId } = await props.params;
  const loan = await getOpenLoan(loanId);
  if (!loan) notFound();
  const { supabase } = await getStudent();
  const { data, error } = await supabase.rpc("extension_check", { p_loan_id: loan.id });
  if (error) throw error;
  const check = data as Check;
  const name = loan.items.item_types.name.toLowerCase();

  return (
    <div className="md:max-w-xl">
      <Link href="/loans" className="mb-1.5 inline-block py-1 font-bold text-teal">
        Back to my loans
      </Link>
      <h1 className="mb-2 text-[1.35em] font-bold">Extend {name}</h1>
      <p className="mb-3">Currently due {fmtWhen(check.due_at)}.</p>

      {check.allowed ? (
        <>
          <p className="note note-ok mb-3">Nobody is waiting for this item, so you can extend once by one day.</p>
          <p className="mb-3">
            New due date: <b>{fmtWhen(check.new_due_at)}</b>
          </p>
          {check.holiday && (
            <p className="note note-warn mb-3">
              <b>Due date moved.</b> One day later is {check.holiday}, when no technicians are on campus, so it&apos;s
              due the next working morning instead.
            </p>
          )}
          <ExtendButton id={loan.id} />
        </>
      ) : (
        <>
          <p className="note note-warn mb-3">
            {check.reason === "already_extended" && (
              <>
                <b>Already extended.</b> A loan can be extended once. Please return it by the due time.
              </>
            )}
            {check.reason === "overdue" && (
              <>
                <b>This loan is overdue,</b> so it can&apos;t be extended. Please return it to any locker as soon as you
                can.
              </>
            )}
            {check.reason === "waiting" && (
              <>
                <b>Someone is waiting for this item,</b> so it can&apos;t be extended. Please return it by the due
                time.
              </>
            )}
          </p>
          <Link href={`/loans/${loan.id}/return`} className="btn btn-primary">
            Return it
          </Link>
        </>
      )}
    </div>
  );
}
