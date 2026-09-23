"use client";

import { useActionState } from "react";
import { extendLoan, type ActionState } from "../../../actions";

export default function ExtendButton({ id }: { id: string }) {
  const [state, formAction, pending] = useActionState<ActionState, FormData>(extendLoan, {});
  return (
    <form action={formAction}>
      <input type="hidden" name="id" value={id} />
      <button type="submit" className="btn btn-primary" disabled={pending}>
        {pending ? "Extending…" : "Extend by one day"}
      </button>
      {state.error && (
        <p role="alert" className="note note-bad mt-3">
          {state.error}
        </p>
      )}
    </form>
  );
}
