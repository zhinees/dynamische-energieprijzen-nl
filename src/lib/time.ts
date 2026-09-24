export const TZ = "Europe/Amsterdam";

/** Offset of Europe/Amsterdam from UTC at a given instant, in minutes (60 or 120). */
export function tzOffsetMinutes(utcMs: number, timeZone = TZ): number {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone,
    hourCycle: "h23",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  }).formatToParts(new Date(utcMs));
  const get = (t: string) => Number(parts.find((p) => p.type === t)!.value);
  const asUtc = Date.UTC(get("year"), get("month") - 1, get("day"), get("hour"), get("minute"), get("second"));
  return Math.round((asUtc - Math.floor(utcMs / 1000) * 1000) / 60000);
}

/** UTC ms of a local wall-clock time in Amsterdam. */
export function localToUtcMs(date: string, hour = 0, minute = 0): number {
  const [y, m, d] = date.split("-").map(Number);
  const guess = Date.UTC(y, m - 1, d, hour, minute);
  let off = tzOffsetMinutes(guess - 120 * 60000);
  let utc = guess - off * 60000;
  // Re-check once in case the guess fell on the other side of a DST switch.
  off = tzOffsetMinutes(utc);
  utc = guess - off * 60000;
  return utc;
}

/** [startUtcMs, endUtcMs) of a local calendar day. 23, 24 or 25 hours long. */
export function dayBoundsUtc(date: string): [number, number] {
  return [localToUtcMs(date), localToUtcMs(addDays(date, 1))];
}

export function addDays(date: string, n: number): string {
  const [y, m, d] = date.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d + n)).toISOString().slice(0, 10);
}

/** Today's date in Amsterdam, YYYY-MM-DD. */
export function todayLocal(now = Date.now()): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: TZ }).format(new Date(now));
}

/** 2026-09-24T18:00:00+02:00 */
export function toLocalIso(utcMs: number): string {
  const off = tzOffsetMinutes(utcMs);
  const local = new Date(utcMs + off * 60000).toISOString().slice(0, 19);
  const sign = off >= 0 ? "+" : "-";
  const a = Math.abs(off);
  return `${local}${sign}${String(Math.floor(a / 60)).padStart(2, "0")}:${String(a % 60).padStart(2, "0")}`;
}

/** 2026-09-24T16:00:00Z */
export function toUtcIso(utcMs: number): string {
  return new Date(utcMs).toISOString().replace(".000Z", "Z");
}
