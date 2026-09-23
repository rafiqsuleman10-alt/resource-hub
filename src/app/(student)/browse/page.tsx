import type { Metadata } from "next";
import { shortPlace } from "@/lib/catalogue";
import { getCampus, getFreeUnits, getStudent } from "@/lib/student";
import HoldBanner from "../HoldBanner";
import BrowseList, { type BrowseRow } from "./BrowseList";

export const metadata: Metadata = { title: "Browse equipment" };

export default async function BrowsePage(props: PageProps<"/browse">) {
  const { cancelled } = await props.searchParams;
  const { supabase } = await getStudent();
  const [{ nodes, walk }, free, types] = await Promise.all([
    getCampus(),
    getFreeUnits(),
    supabase.from("item_types").select("id, name, category").order("name"),
  ]);
  if (types.error) throw types.error;

  const rows: BrowseRow[] = (types.data ?? []).map((t) => {
    const stock = free[t.id] ?? {};
    // nodes are already nearest first
    const nearest = nodes.find((n) => n.online && (stock[n.id] ?? 0) > 0);
    return {
      id: t.id,
      name: t.name,
      category: t.category,
      free: Object.values(stock).reduce((a, b) => a + b, 0),
      nearest: nearest ? `Nearest: ${shortPlace(nearest.place)}, ${walk[nearest.id]} min walk` : null,
    };
  });

  return (
    <>
      <h1 className="sr-only">Browse equipment</h1>
      {cancelled && (
        <p role="status" className="note note-ok mb-4">
          Reservation cancelled. The item is back on the shelf for someone else.
        </p>
      )}
      <HoldBanner />
      <BrowseList rows={rows} />
    </>
  );
}
