import Link from "next/link";

// Shown at the bottom of every page (see src/app/layout.tsx).
export default function Footer() {
  return (
    <footer className="px-4 py-6 text-center text-[0.8em] text-ink-2">
      <p>Demo system for a DUT Industrial Engineering design project. Sample data only.</p>
      <p className="mt-1">
        <Link href="/privacy" className="underline">
          Privacy
        </Link>
        <span aria-hidden="true"> · </span>
        <Link href="/display" className="underline">
          Display settings
        </Link>
      </p>
    </footer>
  );
}
