"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const TABS = [
  {
    href: "/browse",
    label: "Browse",
    // Item and reservation pages belong to Browse.
    match: ["/browse", "/items", "/reservation"],
    icon: (
      <>
        <circle cx="11" cy="11" r="6.5" />
        <path d="M16 16l4.5 4.5" />
      </>
    ),
  },
  {
    href: "/loans",
    label: "My loans",
    match: ["/loans"],
    icon: (
      <>
        <rect x="4" y="3.5" width="16" height="17" rx="2.5" />
        <path d="M8 9h8M8 13h8M8 17h5" />
      </>
    ),
  },
  {
    href: "/help",
    label: "Help",
    match: ["/help"],
    icon: (
      <>
        <circle cx="12" cy="12" r="8.5" />
        <path d="M9.6 9.5a2.5 2.5 0 1 1 3.4 2.3c-.7.3-1 .8-1 1.5v.5" />
        <circle cx="12" cy="17" r=".6" fill="currentColor" />
      </>
    ),
  },
];

// Bottom tab bar on phones, a row of links in the header on wider screens.
export default function StudentNav({ loans, variant }: { loans: number; variant: "bottom" | "top" }) {
  const path = usePathname();
  const top = variant === "top";

  return (
    <nav
      aria-label="Main"
      className={
        top
          ? "hidden gap-1 md:flex"
          : "sticky bottom-0 z-10 grid grid-cols-3 border-t border-line bg-surface pb-[env(safe-area-inset-bottom)] md:hidden"
      }
    >
      {TABS.map((t) => {
        const current = t.match.some((m) => path.startsWith(m));
        return (
          <Link
            key={t.href}
            href={t.href}
            aria-current={current ? "page" : undefined}
            className={
              top
                ? `flex items-center gap-2 rounded-lg px-3 py-2 ${current ? "bg-white/15 font-bold" : "text-[#C9D3DC] hover:bg-white/10"}`
                : `flex flex-col items-center gap-0.5 px-1 pt-2.5 pb-3 text-[0.82em] ${current ? "font-bold text-teal" : "text-ink-3"}`
            }
          >
            <svg viewBox="0 0 24 24" className={top ? "size-5" : "size-[22px]"} fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden="true">
              {t.icon}
            </svg>
            <span>
              {t.label}
              {t.href === "/loans" && loans > 0 && (
                <span className="ml-1 inline-block min-w-[18px] rounded-full bg-amber px-1.5 text-center text-[0.75em] font-bold text-white">
                  {loans}
                  <span className="sr-only"> on loan</span>
                </span>
              )}
            </span>
          </Link>
        );
      })}
    </nav>
  );
}
