import type { Metadata } from "next";
import Link from "next/link";
import { connection } from "next/server";
import { createAnonClient } from "@/lib/supabase/anon";

export const metadata: Metadata = { title: "Locker screens" };

type Node = { id: string; name: string; place: string; battery_backup_ok: boolean; online: boolean };

// Pick which locker this tablet is pretending to be.
export default async function KioskIndex() {
  await connection(); // live battery and stock status, never pre-built
  const { data, error } = await createAnonClient().rpc("kiosk_nodes");
  if (error) throw error;
  const nodes = (data ?? []) as Node[];

  return (
    <main id="main" className="min-h-dvh bg-kiosk px-5 py-8 text-[#EAF0F4] md:px-10">
      <div className="mx-auto max-w-3xl">
        <h1 className="mb-1 text-[1.6em] font-bold text-white">Locker screens</h1>
        <p className="mb-5 text-[#9FB0BF]">
          Each locker has a touchscreen. In this demo, open one on a tablet or laptop next to you.
        </p>
        <ul className="grid gap-3 md:grid-cols-3">
          {nodes.map((n) => (
            <li key={n.id}>
              <Link
                href={`/kiosk/${n.id}`}
                className="block rounded-2xl border-[1.5px] border-[#3E5366] bg-kiosk-2 p-4 hover:border-[#7FE3C2]"
              >
                <b className="block text-[1.2em] text-white">{n.name}</b>
                <span className="block text-[#C9D6E1]">{n.place}</span>
                <span className={`mt-2 block text-[0.85em] ${n.battery_backup_ok ? "text-[#9FE3C9]" : "text-[#FFC98A]"}`}>
                  {!n.online ? "Offline" : n.battery_backup_ok ? "Battery backup ready" : "Battery backup not ready"}
                </span>
              </Link>
            </li>
          ))}
        </ul>
        <p className="mt-6">
          <Link href="/" className="text-[#9FE3C9] underline">
            Back to the student app
          </Link>
        </p>
      </div>
    </main>
  );
}
