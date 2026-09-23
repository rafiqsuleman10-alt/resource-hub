import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { connection } from "next/server";
import { createAnonClient } from "@/lib/supabase/anon";
import Kiosk, { type KioskNode } from "./Kiosk";

async function getNode(nodeId: string) {
  const { data, error } = await createAnonClient().rpc("kiosk_node", { p_node: nodeId.toUpperCase() });
  if (error) throw error;
  return data as KioskNode | null;
}

export async function generateMetadata(props: PageProps<"/kiosk/[nodeId]">): Promise<Metadata> {
  const node = await getNode((await props.params).nodeId);
  return { title: node ? `${node.name} locker screen` : "Locker not found" };
}

// The touchscreen on a locker, simulated. No login: anyone at the locker
// can use it, as with the real thing.
export default async function KioskPage(props: PageProps<"/kiosk/[nodeId]">) {
  await connection(); // live battery and stock status, never pre-built
  const [{ nodeId }, { mode, tag }] = await Promise.all([props.params, props.searchParams]);
  const node = await getNode(nodeId);
  if (!node) notFound();
  const { data: cards } = await createAnonClient().rpc("kiosk_demo_cards");

  return (
    <Kiosk
      node={node}
      cards={(cards ?? []) as { card_uid: string; label: string }[]}
      startMode={mode === "collect" || mode === "return" ? mode : null}
      startTag={typeof tag === "string" ? tag : ""}
    />
  );
}
