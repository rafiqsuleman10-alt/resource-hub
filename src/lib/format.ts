// Dates and times, always shown in South African time (the server runs in UTC).
const TZ = "Africa/Johannesburg";

const timeFmt = new Intl.DateTimeFormat("en-ZA", { timeZone: TZ, hour: "2-digit", minute: "2-digit", hourCycle: "h23" });
const dayFmt = new Intl.DateTimeFormat("en-ZA", { timeZone: TZ, weekday: "short", day: "numeric", month: "short" });
const keyFmt = new Intl.DateTimeFormat("en-CA", { timeZone: TZ, year: "numeric", month: "2-digit", day: "2-digit" });

/** "16:00" */
export const fmtTime = (d: Date | string) => timeFmt.format(new Date(d));
/** "Thu 24 Sept" */
export const fmtDay = (d: Date | string) => dayFmt.format(new Date(d));
/** "2026-09-24", for comparing calendar days */
export const dayKey = (d: Date | string) => keyFmt.format(new Date(d));

/** "Today, 16:00", "Tomorrow, 11:30" or "Fri 25 Sept, 10:00" */
export function fmtWhen(d: Date | string, now: Date = new Date()) {
  const key = dayKey(d);
  if (key === dayKey(now)) return `Today, ${fmtTime(d)}`;
  if (key === dayKey(new Date(now.getTime() + 86_400_000))) return `Tomorrow, ${fmtTime(d)}`;
  return `${fmtDay(d)}, ${fmtTime(d)}`;
}

/** Label for a loan period button. Types with a 4-hour option call 24 hours "Until tomorrow". */
export function loanLabel(hours: number, options: number[]) {
  if (hours === 24) return options.includes(4) ? "Until tomorrow" : "1 day";
  if (hours % 24 === 0) return `${hours / 24} days`;
  return `${hours} hours`;
}

/** Midnight (South African time) at the start of today, or `daysAgo` days before. SA has no daylight saving. */
export function saDayStart(daysAgo = 0, now: Date = new Date()) {
  const midnight = new Date(`${dayKey(now)}T00:00:00+02:00`);
  return new Date(midnight.getTime() - daysAgo * 86_400_000);
}

/** "3 h" or "2 days 4 h" */
export function fmtDuration(ms: number) {
  const hours = Math.max(1, Math.round(ms / 3_600_000));
  const days = Math.floor(hours / 24);
  const rest = hours % 24;
  if (!days) return `${hours} h`;
  return `${days} day${days > 1 ? "s" : ""}${rest ? ` ${rest} h` : ""}`;
}
