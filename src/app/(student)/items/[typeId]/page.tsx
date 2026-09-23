import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { loanLabel } from "@/lib/format";
import { getActiveHold, getCampus, getFreeUnits, getLoanDue, getStudent } from "@/lib/student";
import ReserveForm from "./ReserveForm";

async function getType(typeId: string) {
  const { supabase } = await getStudent();
  const { data, error } = await supabase
    .from("item_types")
    .select("id, name, category, loan_hours_options")
    .eq("id", typeId)
    .maybeSingle();
  if (error) throw error;
  return data as { id: string; name: string; category: string; loan_hours_options: number[] } | null;
}

export async function generateMetadata(props: PageProps<"/items/[typeId]">): Promise<Metadata> {
  const type = await getType((await props.params).typeId);
  return { title: type?.name ?? "Not found" };
}

export default async function ItemPage(props: PageProps<"/items/[typeId]">) {
  const { typeId } = await props.params;
  const type = await getType(typeId);
  if (!type) notFound();

  const [{ nodes, walk, you }, free, hold, periods] = await Promise.all([
    getCampus(),
    getFreeUnits(type.id),
    getActiveHold(),
    Promise.all(
      type.loan_hours_options.map(async (hours) => ({
        hours,
        label: loanLabel(hours, type.loan_hours_options),
        ...(await getLoanDue(hours)),
      })),
    ),
  ]);
  const stock = free[type.id] ?? {};

  return (
    <>
      <Link href="/browse" className="mb-1.5 inline-block py-1 font-bold text-teal">
        Back to equipment
      </Link>
      <h1 className="mb-1 text-[1.35em] font-bold">{type.name}</h1>
      <p className="mb-2 text-[0.86em] text-ink-2">Return it to any locker. You&apos;ll get a reminder before it&apos;s due.</p>
      <ReserveForm
        type={{ id: type.id, name: type.name }}
        nodes={nodes.map((n) => ({ ...n, free: stock[n.id] ?? 0, minutes: walk[n.id] ?? 0 }))}
        you={you}
        periods={periods}
        hold={hold && { name: hold.type_name }}
      />
    </>
  );
}
