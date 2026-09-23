"use client";

// Shown if a student page fails to load (for example, the database is unreachable).
export default function StudentError({ retry }: { error: Error; retry: () => void }) {
  return (
    <div className="card max-w-xl">
      <h1 className="mb-2 text-[1.2em] font-bold">This page didn&apos;t load</h1>
      <p className="mb-3 text-ink-2">We couldn&apos;t reach the database. Check your connection and try again.</p>
      <button type="button" className="btn btn-primary" onClick={() => retry()}>
        Try again
      </button>
    </div>
  );
}
