"use client";

import Link from "next/link";
import { useState } from "react";
import CampusStrip from "@/components/CampusStrip";
import NodeOption from "@/components/NodeOption";
import { shortPlace, type NodeInfo } from "@/lib/catalogue";

// Choose a locker, then open its screen (in real life: walk there).
export default function ReturnPick({
  tag,
  nodes,
  you,
}: {
  tag: string;
  nodes: (NodeInfo & { minutes: number })[]; // nearest first
  you: number;
}) {
  const [node, setNode] = useState(nodes.find((n) => n.online)?.id ?? null);

  return (
    <div className="md:max-w-xl">
      <fieldset>
        <legend className="mt-3 mb-2 font-bold">Return to</legend>
        <CampusStrip
          you={you}
          nodes={nodes.map((n) => ({ id: n.id, position: n.position, minutes: n.minutes, hasStock: n.online, selected: n.id === node }))}
        />
        <div className="my-2.5 grid gap-2">
          {nodes.map((n) => (
            <NodeOption
              key={n.id}
              name="node"
              value={n.id}
              checked={node === n.id}
              disabled={!n.online}
              onChange={setNode}
              title={shortPlace(n.place)}
              detail={n.online ? "Takes returns" : "Offline right now"}
              minutes={n.minutes}
              warning={n.battery_backup_ok ? undefined : "Battery backup not ready. The door may not open in a power cut."}
            />
          ))}
        </div>
      </fieldset>
      <p className="mb-1 text-[0.86em] text-ink-2">
        At the locker, choose Return an item and hold the item&apos;s tag ({tag}) to the reader.
      </p>
      {node ? (
        <Link href={`/kiosk/${node}?mode=return&tag=${encodeURIComponent(tag)}`} className="btn btn-primary mt-2">
          I&apos;m at this locker
        </Link>
      ) : (
        <p className="note note-bad">Every locker is offline right now. Please try again later.</p>
      )}
      <p className="mt-2 text-[0.8em] text-ink-3">Demo: this opens the locker&apos;s touchscreen in this browser.</p>
    </div>
  );
}
