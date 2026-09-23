"use client";

import { useActionState, useEffect, useRef, useState } from "react";
import { closeWork, startWork, type StaffState } from "../actions";

// "Start work" and "Close" for one work order or service.
export default function WorkActions({
  kind,
  id,
  label,
  started,
}: {
  kind: "fault" | "service";
  id: string;
  label: string; // e.g. "WO-1002" or "Scientific calculator SC-0203", for the confirmation
  started: boolean;
}) {
  const [startState, startAction, starting] = useActionState<StaffState, FormData>(startWork, {});
  const [closeState, closeAction, closing] = useActionState<StaffState, FormData>(closeWork, {});
  const [closingOpen, setClosingOpen] = useState(false);
  const noteRef = useRef<HTMLTextAreaElement>(null);
  useEffect(() => {
    if (closingOpen) noteRef.current?.focus();
  }, [closingOpen]);
  const error = startState.error ?? closeState.error;

  return (
    <div className="mt-3">
      {!closingOpen ? (
        <div className="flex flex-wrap gap-2">
          {!started && (
            <form action={startAction} className="min-w-[120px] flex-1">
              <input type="hidden" name="kind" value={kind} />
              <input type="hidden" name="id" value={id} />
              <button type="submit" disabled={starting} className="w-full rounded-[10px] border-[1.5px] border-line bg-surface px-3 py-2 text-[0.9em] font-bold">
                {starting ? "Starting…" : "Start work"}
              </button>
            </form>
          )}
          <button
            type="button"
            onClick={() => setClosingOpen(true)}
            className="min-w-[120px] flex-1 rounded-[10px] border-[1.5px] border-teal bg-teal px-3 py-2 text-[0.9em] font-bold text-(--on-teal)"
          >
            Close…
          </button>
        </div>
      ) : (
        <form action={closeAction} className="rounded-xl border-[1.5px] border-line bg-surface-2 p-3">
          <input type="hidden" name="kind" value={kind} />
          <input type="hidden" name="id" value={id} />
          <input type="hidden" name="label" value={label} />
          <label htmlFor={`note-${id}`} className="mb-1 block text-[0.9em] font-bold">
            What was done? (optional)
          </label>
          <textarea ref={noteRef} id={`note-${id}`} name="note" maxLength={500} className="field min-h-[64px] bg-surface" />
          <p className="mt-1 text-[0.8em] text-ink-2">If an item is involved, it goes back into stock at Node S.</p>
          <div className="mt-2 flex flex-wrap gap-2">
            <button type="submit" disabled={closing} className="min-w-[120px] flex-1 rounded-[10px] bg-teal px-3 py-2 text-[0.9em] font-bold text-(--on-teal)">
              {closing ? "Closing…" : kind === "service" ? "Close service" : "Close work order"}
            </button>
            <button type="button" onClick={() => setClosingOpen(false)} className="min-w-[120px] flex-1 rounded-[10px] border-[1.5px] border-line bg-surface px-3 py-2 text-[0.9em]">
              Cancel
            </button>
          </div>
        </form>
      )}
      {error && (
        <p role="alert" className="note note-bad mt-2">
          {error}
        </p>
      )}
    </div>
  );
}
