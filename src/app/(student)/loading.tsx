// Shown while a page's data loads (the header and tabs stay in place).
export default function Loading() {
  return (
    <p role="status" className="flex items-center gap-2 py-6 text-ink-2">
      <span aria-hidden="true" className="size-4 animate-spin rounded-full border-2 border-line border-t-teal motion-reduce:animate-none" />
      Loading…
    </p>
  );
}
