"use client";

import { useActionState, useEffect, useRef, useState } from "react";
import { moveStock, resetDemo, setNodeStatus, type StaffState } from "../actions";

function ErrorNote({ state }: { state: StaffState }) {
  return state.error ? (
    <p role="alert" className="note note-bad mt-2">
      {state.error}
    </p>
  ) : null;
}

export function MoveButton(props: { type: string; name: string; from: string; to: string; count: number }) {
  const [state, action, pending] = useActionState<StaffState, FormData>(moveStock, {});
  return (
    <form action={action}>
      {Object.entries(props).map(([k, v]) => (
        <input key={k} type="hidden" name={k} value={v} />
      ))}
      <button
        type="submit"
        disabled={pending}
        className="rounded-[10px] border-[1.5px] border-line bg-surface px-3 py-1.5 text-[0.85em] font-bold whitespace-nowrap"
      >
        {pending ? "Moving…" : "Mark as moved"}
      </button>
      <ErrorNote state={state} />
    </form>
  );
}

export function NodeSwitch({ node, field, value, label }: { node: string; field: string; value: boolean; label: string }) {
  const [state, action, pending] = useActionState<StaffState, FormData>(setNodeStatus, {});
  return (
    <form action={action}>
      <input type="hidden" name="node" value={node} />
      <input type="hidden" name="field" value={field} />
      <input type="hidden" name="value" value={String(!value)} />
      <button
        type="submit"
        role="switch"
        aria-checked={value}
        disabled={pending}
        className="flex w-full items-center justify-between gap-3 py-1.5 text-left text-[0.9em]"
      >
        <span>{label}</span>
        <span
          aria-hidden="true"
          className={`relative h-6 w-11 flex-none rounded-full transition-colors ${value ? "bg-teal" : "bg-line"}`}
        >
          <span className={`absolute top-0.5 size-5 rounded-full bg-surface shadow transition-all ${value ? "left-[22px]" : "left-0.5"}`} />
        </span>
      </button>
      <ErrorNote state={state} />
    </form>
  );
}

export function ResetDemo() {
  const [state, action, pending] = useActionState<StaffState>(resetDemo, {});
  const [confirming, setConfirming] = useState(false);
  const yes = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    if (confirming) yes.current?.focus();
  }, [confirming]);

  if (!confirming) {
    return (
      <button type="button" className="btn btn-danger md:max-w-xs" onClick={() => setConfirming(true)}>
        Reset demo data
      </button>
    );
  }
  return (
    <div className="rounded-[14px] border-[1.5px] border-coral-soft p-3.5 md:max-w-md">
      <p className="mb-1 font-bold">Reset all demo data?</p>
      <p className="mb-2 text-[0.9em] text-ink-2">
        Every reservation, loan, fault report and stock move goes back to how it started. The demo logins stay the same.
      </p>
      <form action={action} className="grid gap-2 sm:grid-cols-2">
        <button ref={yes} type="submit" className="btn btn-danger" disabled={pending}>
          {pending ? "Resetting…" : "Yes, reset it"}
        </button>
        <button type="button" className="btn btn-secondary" onClick={() => setConfirming(false)}>
          Keep the data
        </button>
      </form>
      <ErrorNote state={state} />
    </div>
  );
}
