import Link from "next/link";

// Shown for an item or page that doesn't exist (for example, an old link).
export default function StudentNotFound() {
  return (
    <div className="max-w-xl">
      <h1 className="mb-2 text-[1.35em] font-bold">We can&apos;t find that</h1>
      <p className="mb-3 text-ink-2">This item or page doesn&apos;t exist. It may have been an old link.</p>
      <Link href="/browse" className="btn btn-primary md:max-w-xs">
        Browse equipment
      </Link>
    </div>
  );
}
