"use client";

import { useState } from "react";

export type Day = { key: string; weekday: string; date: string; long: string; count: number };

// Loans issued per day, as columns. One series, so no legend: the heading
// says what's plotted. Each column is a focusable hit target with a tooltip;
// the same numbers are in the table below for anyone not using a mouse.
export default function LoansChart({ days }: { days: Day[] }) {
  const [active, setActive] = useState<number | null>(null);
  const max = Math.max(1, ...days.map((d) => d.count));
  const step = max <= 10 ? 2 : max <= 25 ? 5 : 10;
  const top = Math.ceil(max / step) * step;
  const ticks = Array.from({ length: top / step + 1 }, (_, i) => i * step);
  const peak = days.reduce((best, d, i) => (d.count > days[best].count ? i : best), 0);

  return (
    <figure>
      <div className="relative flex gap-2">
        {/* Y axis */}
        <div aria-hidden="true" className="relative h-48 w-6 flex-none text-right text-[0.75em] text-ink-3 tabular-nums">
          {ticks.map((t) => (
            <span key={t} className="absolute right-0 -translate-y-1/2" style={{ bottom: `${(t / top) * 100}%` }}>
              {t}
            </span>
          ))}
        </div>

        <div className="relative h-48 flex-1">
          {/* Hairline gridlines */}
          {ticks.map((t) => (
            <div
              key={t}
              aria-hidden="true"
              className={`absolute inset-x-0 h-px ${t === 0 ? "bg-ink-3" : "bg-line"}`}
              style={{ bottom: `${(t / top) * 100}%` }}
            />
          ))}

          <div role="group" aria-label="Loans per day" className="absolute inset-0 grid" style={{ gridTemplateColumns: `repeat(${days.length}, 1fr)` }}>
            {days.map((d, i) => (
              <button
                key={d.key}
                type="button"
                aria-label={`${d.long}: ${d.count} loan${d.count === 1 ? "" : "s"}`}
                onPointerEnter={() => setActive(i)}
                onPointerLeave={() => setActive((a) => (a === i ? null : a))}
                onFocus={() => setActive(i)}
                onBlur={() => setActive((a) => (a === i ? null : a))}
                className="group relative flex h-full items-end justify-center focus-visible:outline-offset-0"
              >
                <span
                  className={`relative block w-full max-w-6 rounded-t-[4px] bg-chart transition-opacity ${
                    active !== null && active !== i ? "opacity-60" : ""
                  }`}
                  style={{ height: `${(d.count / top) * 100}%`, marginInline: 1 }}
                >
                  {i === peak && d.count > 0 && (
                    <span aria-hidden="true" className="absolute -top-5 left-1/2 -translate-x-1/2 text-[0.75em] font-bold text-ink">
                      {d.count}
                    </span>
                  )}
                </span>
                {active === i && (
                  <span
                    role="tooltip"
                    className={`pointer-events-none absolute bottom-full z-10 mb-1 rounded-lg bg-ink px-2.5 py-1.5 text-left whitespace-nowrap text-surface shadow ${
                      i < 3 ? "left-0" : i > days.length - 4 ? "right-0" : "left-1/2 -translate-x-1/2"
                    }`}
                  >
                    <b className="block text-[1.05em]">
                      {d.count} loan{d.count === 1 ? "" : "s"}
                    </b>
                    <span className="text-[0.8em] opacity-80">{d.long}</span>
                  </span>
                )}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* X axis: weekday and date */}
      <div aria-hidden="true" className="mt-1 ml-8 grid text-center text-[0.7em] leading-tight text-ink-3" style={{ gridTemplateColumns: `repeat(${days.length}, 1fr)` }}>
        {days.map((d) => (
          <span key={d.key}>
            {d.weekday}
            <br />
            {d.date}
          </span>
        ))}
      </div>

      <details className="mt-3 text-[0.9em]">
        <summary className="cursor-pointer text-teal">Show as a table</summary>
        <table className="mt-2 w-full max-w-sm">
          <thead>
            <tr className="border-b border-line text-left">
              <th scope="col" className="py-1 font-bold">
                Day
              </th>
              <th scope="col" className="py-1 text-right font-bold">
                Loans
              </th>
            </tr>
          </thead>
          <tbody>
            {days.map((d) => (
              <tr key={d.key} className="border-b border-line">
                <td className="py-1">{d.long}</td>
                <td className="py-1 text-right tabular-nums">{d.count}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </details>
    </figure>
  );
}
