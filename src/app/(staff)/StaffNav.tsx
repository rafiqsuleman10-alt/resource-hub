"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import type { Role } from "@/lib/demo";

export default function StaffNav({ role }: { role: Role }) {
  const path = usePathname();
  const links = [
    ...(role === "technician" ? [{ href: "/dashboard", label: "Dashboard" }] : []),
    { href: "/maintenance", label: "Work orders" },
  ];
  return (
    <>
      {links.map((l) => {
        const current = path.startsWith(l.href);
        return (
          <Link
            key={l.href}
            href={l.href}
            aria-current={current ? "page" : undefined}
            className={`rounded-lg px-3 py-2 ${current ? "bg-white/15 font-bold" : "text-[#C9D3DC] hover:bg-white/10"}`}
          >
            {l.label}
          </Link>
        );
      })}
    </>
  );
}
