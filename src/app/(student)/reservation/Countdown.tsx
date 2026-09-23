"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";

// Live mm:ss until the hold ends. Uses the server's clock (serverNow) so a
// phone with the wrong time still shows the right countdown. When it reaches
// zero the page reloads, and the server puts the item back into stock.
export default function Countdown({ until, serverNow }: { until: string; serverNow: string }) {
  const router = useRouter();
  const [offset] = useState(() => Date.parse(serverNow) - Date.now());
  const [now, setNow] = useState(() => Date.now() + offset);

  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now() + offset), 1000);
    return () => clearInterval(timer);
  }, [offset]);

  const left = Math.max(0, Date.parse(until) - now);
  const done = left === 0;
  useEffect(() => {
    if (!done) return;
    router.refresh();
    const retry = setTimeout(() => router.refresh(), 5000); // in case the server was a moment behind
    return () => clearTimeout(retry);
  }, [done, router]);

  const mins = Math.floor(left / 60_000);
  const secs = Math.floor(left / 1000) % 60;
  const wholeMinutesLeft = Math.ceil(left / 60_000);
  // Screen readers hear a short update at 10, 5 and 1 minutes, not every second.
  const announce = done
    ? "Your hold has ended."
    : [10, 5, 1].includes(wholeMinutesLeft)
      ? `${wholeMinutesLeft} minute${wholeMinutesLeft > 1 ? "s" : ""} left to collect.`
      : "";

  return (
    <>
      <div
        role="timer"
        aria-label={`${mins} minutes ${secs} seconds left`}
        className="text-[2.6em] leading-none font-bold text-amber tabular-nums"
        suppressHydrationWarning
      >
        {String(mins).padStart(2, "0")}:{String(secs).padStart(2, "0")}
      </div>
      <p className="sr-only" aria-live="polite">
        {announce}
      </p>
    </>
  );
}
