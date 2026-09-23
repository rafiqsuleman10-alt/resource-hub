"use client";

import { useActionState, useEffect, useRef, useState } from "react";
import { cancelReservation, type ActionState } from "../actions";

// Cancel asks once more, so a stray tap doesn't lose the hold.
export default function CancelHold({ id }: { id: string }) {
  const [state, formAction, pending] = useActionState<ActionState, FormData>(cancelReservation, {});
  const [confirming, setConfirming] = useState(false);
  const yes = useRef<HTMLButtonElement>(null);
  const start = useRef<HTMLButtonElement>(null);
  const [asked, setAsked] = useState(false);

  useEffect(() => {
    if (confirming) yes.current?.focus();
    else if (asked) start.current?.focus();
  }, [confirming, asked]);

  if (!confirming) {
    return (
      <button
        ref={start}
        type="button"
        className="btn btn-danger mt-2.5"
        onClick={() => {
          setAsked(true);
          setConfirming(true);
        }}
      >
        Cancel reservation
      </button>
    );
  }

  return (
    <div className="mt-2.5 rounded-[14px] border-[1.5px] border-coral-soft p-3.5">
      <p className="mb-1 font-bold">Cancel your hold?</p>
      <p className="mb-2 text-[0.9em] text-ink-2">The item goes back on the shelf for someone else.</p>
      <form action={formAction} className="grid gap-2 sm:grid-cols-2">
        <input type="hidden" name="id" value={id} />
        <button ref={yes} type="submit" className="btn btn-danger" disabled={pending}>
          {pending ? "Cancelling…" : "Yes, cancel it"}
        </button>
        <button type="button" className="btn btn-secondary" onClick={() => setConfirming(false)}>
          Keep my hold
        </button>
      </form>
      {state.error && (
        <p role="alert" className="note note-bad mt-2">
          {state.error}
        </p>
      )}
    </div>
  );
}
