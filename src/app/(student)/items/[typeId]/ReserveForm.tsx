"use client";

import Link from "next/link";
import { useActionState, useState } from "react";
import CampusStrip from "@/components/CampusStrip";
import NodeOption from "@/components/NodeOption";
import { shortPlace, type NodeInfo } from "@/lib/catalogue";
import { fmtWhen } from "@/lib/format";
import { reserve, type ActionState } from "../../actions";

export type NodeChoice = NodeInfo & { free: number; minutes: number };
type Period = { hours: number; label: string; dueAt: string; holiday: string | null };

export default function ReserveForm({
  type,
  nodes,
  you,
  periods,
  hold,
}: {
  type: { id: string; name: string };
  nodes: NodeChoice[]; // nearest first
  you: number;
  periods: Period[];
  hold: { name: string } | null;
}) {
  const [state, formAction, pending] = useActionState<ActionState, FormData>(reserve, {});
  const usable = nodes.filter((n) => n.online && n.free > 0);
  const [node, setNode] = useState<string | null>(usable[0]?.id ?? null);
  const [hours, setHours] = useState(periods[0]?.hours);
  const period = periods.find((p) => p.hours === hours) ?? periods[0];

  return (
    <form action={formAction} className="grid gap-x-10 md:grid-cols-2">
      <input type="hidden" name="type" value={type.id} />
      <input type="hidden" name="hours" value={hours} />

      <fieldset>
        <legend className="mt-3 mb-2 font-bold">Collect from</legend>
        <CampusStrip
          you={you}
          nodes={nodes.map((n) => ({
            id: n.id,
            position: n.position,
            minutes: n.minutes,
            hasStock: n.free > 0,
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
              disabled={!n.online || n.free === 0}
              onChange={setNode}
              title={shortPlace(n.place)}
              detail={!n.online ? "Offline right now" : n.free ? `${n.free} available` : "None here right now"}
              minutes={n.minutes}
              warning={n.battery_backup_ok ? undefined : "Battery backup not ready. The door may not open in a power cut."}
            />
          ))}
        </div>
      </fieldset>

      <div>
        <fieldset>
          <legend className="mt-3 mb-2 font-bold">Borrow for</legend>
          <div className="flex overflow-hidden rounded-xl border-[1.5px] border-line">
            {periods.map((p) => (
              <label
                key={p.hours}
                className="flex-1 cursor-pointer border-line bg-surface px-1.5 py-2.5 text-center text-[0.9em] not-first:border-l-[1.5px] has-[:checked]:bg-ink has-[:checked]:font-bold has-[:checked]:text-surface has-[:focus-visible]:outline-3 has-[:focus-visible]:-outline-offset-3 has-[:focus-visible]:outline-(--focus)"
              >
                <input
                  type="radio"
                  name="period"
                  className="sr-only"
                  checked={hours === p.hours}
                  onChange={() => setHours(p.hours)}
                />
                {p.label}
              </label>
            ))}
          </div>
        </fieldset>
        {period && (
          <>
            <p className="mt-2 text-[0.86em] text-ink-2">Due back {fmtWhen(period.dueAt)}</p>
            {period.holiday && (
              <p className="note note-warn mt-3">
                <b>Due date moved.</b> This loan would end on {period.holiday}, when no technicians are on campus, so
                it&apos;s due the next working morning instead.
              </p>
            )}
          </>
        )}

        {hold ? (
          <p className="note note-warn mt-3">
            <b>You already have {hold.name.toLowerCase()} on hold.</b> Collect it or cancel it before reserving
            something else.{" "}
            <Link href="/reservation" className="font-bold text-teal underline">
              See your reservation
            </Link>
          </p>
        ) : null}

        <button type="submit" className="btn btn-primary mt-3" disabled={!node || !!hold || pending}>
          {pending ? "Reserving…" : `Reserve ${type.name.toLowerCase()}`}
        </button>
        <div aria-live="polite">
          {!node && (
            <p className="mt-1.5 text-[0.85em] text-coral">
              Every locker is out of this item. Check back later or choose a similar item.
            </p>
          )}
          {state.error && (
            <p role="alert" className="note note-bad mt-3">
              {state.error}
            </p>
          )}
        </div>
      </div>
    </form>
  );
}
