import Link from "next/link";

// Simple frame for public pages (privacy, display settings): works whether or not you're logged in.
export default function PlainPage({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <>
      <header className="bg-slate text-white">
        <div className="mx-auto max-w-3xl px-5 py-5">
          <Link href="/" className="text-[1.35em] font-bold tracking-tight">
            Resource Hub
          </Link>
        </div>
      </header>
      <main id="main" className="mx-auto max-w-3xl px-5 py-6">
        <h1 className="mb-4 text-[1.5em] font-bold">{title}</h1>
        {children}
      </main>
    </>
  );
}
