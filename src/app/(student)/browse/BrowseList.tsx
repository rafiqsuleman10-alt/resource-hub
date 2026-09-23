"use client";

import Link from "next/link";
import { useState } from "react";
import Glyph from "@/components/Glyph";
import { CATEGORIES } from "@/lib/catalogue";

export type BrowseRow = { id: string; name: string; category: string; free: number; nearest: string | null };

// Search box, category chips and the equipment list. Filtering happens in
// the browser, so it's instant.
export default function BrowseList({ rows }: { rows: BrowseRow[] }) {
  const [query, setQuery] = useState("");
  const [category, setCategory] = useState<string | null>(null);

  const q = query.trim().toLowerCase();
  const shown = rows.filter((r) => (!category || r.category === category) && r.name.toLowerCase().includes(q));

  return (
    <>
      <label htmlFor="search" className="sr-only">
        Search equipment
      </label>
      <input
        id="search"
        type="search"
        className="field md:max-w-md"
        placeholder="Search equipment"
        autoComplete="off"
        value={query}
        onChange={(e) => setQuery(e.target.value)}
      />
      <div
        role="group"
        aria-label="Category"
        className="-mx-4 flex gap-2 overflow-x-auto px-4 pt-3 pb-1.5 [scrollbar-width:none] md:mx-0 md:flex-wrap md:px-0"
      >
        {[null, ...CATEGORIES].map((c) => (
          <button
            key={c ?? "all"}
            type="button"
            aria-pressed={category === c}
            onClick={() => setCategory(c)}
            className="flex-none rounded-full border-[1.5px] border-line bg-surface px-3.5 py-1.5 text-[0.88em] whitespace-nowrap aria-pressed:border-ink aria-pressed:bg-ink aria-pressed:text-surface"
          >
            {c ?? "All"}
          </button>
        ))}
      </div>

      <p className="sr-only" aria-live="polite">
        {shown.length} {shown.length === 1 ? "item" : "items"} shown
      </p>
      {shown.length === 0 ? (
        <p className="py-5 text-ink-2">
          {q
            ? `No equipment matches "${query.trim()}". Try a shorter word, or choose All.`
            : "Nothing in this category right now. Choose All to see everything."}
        </p>
      ) : (
        <ul className="mt-1.5 md:grid md:grid-cols-2 md:gap-x-8">
          {shown.map((r) => (
            <li key={r.id}>
              <Link
                href={`/items/${r.id}`}
                className="flex w-full items-center gap-3 border-b border-line px-0.5 py-3 text-left hover:bg-surface-2"
              >
                <Glyph category={r.category} />
                <span className="min-w-0 flex-1">
                  <span className="block font-bold">{r.name}</span>
                  <span className="block text-[0.86em] text-ink-2">{r.nearest ?? "None available right now"}</span>
                </span>
                <span className="flex-none text-right text-[0.8em] leading-tight text-ink-3">
                  <b className={`block text-[1.55em] ${r.free ? "text-teal" : "text-coral"}`}>{r.free}</b>free
                </span>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </>
  );
}
