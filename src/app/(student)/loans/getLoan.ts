import { getStudent } from "@/lib/student";

export type OpenLoan = {
  id: string;
  issued_at: string;
  due_at: string;
  extended: boolean;
  items: { tag: string; item_types: { name: string } };
};

/** One of the student's loans that is still out, or null. */
export async function getOpenLoan(loanId: string): Promise<OpenLoan | null> {
  const { supabase } = await getStudent();
  // Not a valid id? Then it isn't one of theirs.
  if (!/^[0-9a-f-]{36}$/i.test(loanId)) return null;
  const { data, error } = await supabase
    .from("loans")
    .select("id, issued_at, due_at, extended, items(tag, item_types(name))")
    .eq("id", loanId)
    .is("returned_at", null)
    .maybeSingle();
  if (error) throw error;
  return data as unknown as OpenLoan | null;
}
