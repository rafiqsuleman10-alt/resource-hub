"use client";

import { useState, useTransition } from "react";
import type { Zone } from "@/lib/student";
import { setNearZone } from "./actions";

// "You're near" in the header. Saved to the student's profile, so walking
// times use it on every page and next time they log in.
export default function NearPicker({ zones, value }: { zones: Zone[]; value: string }) {
  const [current, setCurrent] = useState(value);
  const [pending, startTransition] = useTransition();

  return (
    <label className="mt-2 flex items-center gap-2 text-[0.9em] text-[#C9D3DC]">
      You&apos;re near
      <select
        value={current}
        aria-busy={pending}
        onChange={(e) => {
          const zone = e.target.value;
          setCurrent(zone);
          startTransition(() => setNearZone(zone));
        }}
        className="rounded-lg border border-white/25 bg-white/10 px-2 py-1 text-white [&>option]:text-black"
      >
        {zones.map((z) => (
          <option key={z.id} value={z.id}>
            {z.name}
          </option>
        ))}
      </select>
    </label>
  );
}
