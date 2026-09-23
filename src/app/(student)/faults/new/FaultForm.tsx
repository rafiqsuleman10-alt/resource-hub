"use client";

import { useEffect, useState, useTransition } from "react";
import { LOAN_REASONS, LOCKER_REASONS, REASON_LABEL, type FaultReason } from "@/lib/faults";
import { createClient } from "@/lib/supabase/client";
import { reportFault } from "../../actions";

// Phone photos are large. Shrink to at most 1600 px on the long side as a
// JPEG before uploading, so it's quick on mobile data and under the 5 MB limit.
async function shrinkPhoto(file: File): Promise<Blob> {
  const bitmap = await createImageBitmap(file);
  const scale = Math.min(1, 1600 / Math.max(bitmap.width, bitmap.height));
  const canvas = document.createElement("canvas");
  canvas.width = Math.round(bitmap.width * scale);
  canvas.height = Math.round(bitmap.height * scale);
  canvas.getContext("2d")!.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
  bitmap.close();
  return new Promise((resolve, reject) =>
    canvas.toBlob((b) => (b ? resolve(b) : reject(new Error("shrink failed"))), "image/jpeg", 0.85),
  );
}

export default function FaultForm({
  userId,
  loan,
  nodes,
}: {
  userId: string;
  loan: { id: string } | null;
  nodes: { id: string; label: string }[]; // nearest first
}) {
  const reasons = loan ? LOAN_REASONS : LOCKER_REASONS;
  const [reason, setReason] = useState<FaultReason | null>(null);
  const [node, setNode] = useState(nodes[0]?.id ?? "");
  const [note, setNote] = useState("");
  const [photo, setPhoto] = useState<{ file: File; url: string } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  // Free the preview's memory when the photo changes or the page closes.
  useEffect(() => {
    if (!photo) return;
    return () => URL.revokeObjectURL(photo.url);
  }, [photo]);

  function submit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    // Read the choices from the form itself, so a tap made before the page
    // finished loading still counts.
    const fields = new FormData(e.currentTarget);
    const reason = (fields.get("reason") as FaultReason | null) ?? null;
    const note = String(fields.get("note") ?? "");
    const node = String(fields.get("node") ?? "");
    if (!reason) {
      setError("Choose what happened first.");
      return;
    }
    setError(null);
    startTransition(async () => {
      let photoPath = "";
      if (photo) {
        try {
          const blob = await shrinkPhoto(photo.file);
          photoPath = `${userId}/${crypto.randomUUID()}.jpg`;
          const { error: upErr } = await createClient()
            .storage.from("fault-photos")
            .upload(photoPath, blob, { contentType: "image/jpeg" });
          if (upErr) throw upErr;
        } catch {
          setError("The photo didn't upload. Try again, or remove the photo and send the report without it.");
          return;
        }
      }
      const form = new FormData();
      form.set("reason", reason);
      form.set("note", note);
      form.set("photo", photoPath);
      if (loan) form.set("loan", loan.id);
      else form.set("node", node);
      const result = await reportFault(form); // redirects on success
      if (result?.error) setError(result.error);
    });
  }

  return (
    <form onSubmit={submit} noValidate>
      {!loan && (
        <label className="mb-3 grid gap-1">
          <span className="font-bold">Which locker?</span>
          <select name="node" className="field" value={node} onChange={(e) => setNode(e.target.value)}>
            {nodes.map((n) => (
              <option key={n.id} value={n.id}>
                {n.label}
              </option>
            ))}
          </select>
        </label>
      )}

      <fieldset>
        <legend className="mb-2 font-bold">What happened?</legend>
        <div className="grid gap-2">
          {reasons.map((r) => (
            <label
              key={r}
              className="cursor-pointer rounded-xl border-[1.5px] border-line bg-surface p-3 has-[:checked]:border-teal has-[:checked]:bg-teal-soft has-[:checked]:font-bold has-[:focus-visible]:outline-3 has-[:focus-visible]:outline-offset-2 has-[:focus-visible]:outline-(--focus)"
            >
              <input
                type="radio"
                name="reason"
                value={r}
                className="sr-only"
                checked={reason === r}
                onChange={() => {
                  setReason(r);
                  setError(null);
                }}
              />
              {REASON_LABEL[r]}
            </label>
          ))}
        </div>
      </fieldset>

      <label htmlFor="note" className="mt-4 mb-1 block text-[0.9em]">
        Anything else we should know? (optional)
      </label>
      <textarea
        id="note"
        name="note"
        maxLength={1000}
        value={note}
        onChange={(e) => setNote(e.target.value)}
        className="field min-h-[84px]"
      />

      <div className="mt-3">
        {photo ? (
          <div className="flex items-center gap-3 rounded-xl border-[1.5px] border-line bg-surface-2 p-2.5">
            {/* A local preview (blob: URL), so next/image doesn't apply. */}
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={photo.url} alt="The photo you chose" className="size-16 rounded-lg object-cover" />
            <span className="min-w-0 flex-1 truncate text-[0.9em]">{photo.file.name}</span>
            <button type="button" className="rounded-lg border-[1.5px] border-line px-3 py-1.5 text-[0.9em]" onClick={() => setPhoto(null)}>
              Remove
            </button>
          </div>
        ) : (
          <label className="btn btn-secondary cursor-pointer has-[:focus-visible]:outline-3 has-[:focus-visible]:outline-offset-2 has-[:focus-visible]:outline-(--focus)">
            Add a photo (optional)
            <input
              type="file"
              accept="image/jpeg,image/png,image/webp"
              className="sr-only"
              onChange={(e) => {
                const file = e.target.files?.[0];
                if (!file) return;
                if (file.size > 25 * 1024 * 1024) {
                  setError("That photo is too big. Choose one under 25 MB.");
                  return;
                }
                setPhoto({ file, url: URL.createObjectURL(file) });
                setError(null);
              }}
            />
          </label>
        )}
        <p className="mt-1 text-[0.8em] text-ink-3">Photograph the item or locker only, not people.</p>
      </div>

      <button type="submit" className="btn btn-primary mt-3" disabled={pending}>
        {pending ? "Sending…" : "Send report"}
      </button>
      <div aria-live="polite">
        {error && (
          <p role="alert" className="note note-bad mt-3">
            {error}
          </p>
        )}
      </div>
    </form>
  );
}
