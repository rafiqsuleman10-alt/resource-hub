"use client";

import { useActionState, useState } from "react";
import CampusStrip from "@/components/CampusStrip";
import NodeOption from "@/components/NodeOption";
import { shortPlace } from "@/lib/catalogue";
import { changeLocker, type ActionState } from "../../actions";
import type { NodeChoice } from "../../items/[typeId]/ReserveForm";

export default function ChangeForm({
  holdId,
  current,
  nodes,
  you,
}: {
  holdId: string;
  current: string;
  nodes: NodeChoice[]; // nearest first
  you: number;
}) {
  const [state, formAction, pending] = useActionState<ActionState, FormData>(changeLocker, {});
  // Start on the nearest other locker that has one free.
  const [node, setNode] = useState(nodes.find((n) => n.id !== current && n.online && n.free > 0)?.id ?? current);
  const noneElsewhere = !nodes.some((n) => n.id !== current && n.online && n.free > 0);

  return (
    <form action={formAction} className="md:max-w-xl">
      <input type="hidden" name="id" value={holdId} />
      <fieldset>
        <legend className="mt-3 mb-2 font-bold">Collect from</legend>
        <CampusStrip
          you={you}
          nodes={nodes.map((n) => ({
            id: n.id,
            position: n.position,
            minutes: n.minutes,
            hasStock: n.id === current || n.free > 0,
            selected: n.id === node,
          }))}
        />
        <div className="my-2.5 grid gap-2">
          {nodes.map((n) => (
            <NodeOption
              key={n.id}
              name="node"
              value={n.id}
              checked={node === n.id}
              disabled={n.id !== current && (!n.online || n.free === 0)}
              onChange={setNode}
              title={shortPlace(n.place)}
              detail={
                n.id === current
                  ? "Held for you here now"
                  : !n.online
                    ? "Offline right now"
                    : n.free
                      ? `${n.free} available`
                      : "None here right now"
              }
              minutes={n.minutes}
              warning={n.battery_backup_ok ? undefined : "Battery backup not ready. The door may not open in a power cut."}
            />
          ))}
        </div>
      </fieldset>

      {noneElsewhere && (
        <p className="note note-warn">
          <b>No other locker has one free.</b> Your hold stays where it is.
        </p>
      )}
      <button type="submit" className="btn btn-primary mt-3" disabled={node === current || pending}>
        {pending ? "Moving…" : "Move my hold here"}
      </button>
      <div aria-live="polite">
        {state.error && (
          <p role="alert" className="note note-bad mt-3">
            {state.error}
          </p>
        )}
      </div>
    </form>
  );
}
