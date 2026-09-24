export const TZ = "Europe/Amsterdam";

/** Offset of Europe/Amsterdam from UTC at a given instant, in minutes (60 or 120). */
export function tzAfwijkingMinuten(utcMs: number, timeZone = TZ): number {
  const delen = new Intl.DateTimeFormat("en-US", {
    timeZone,
    hourCycle: "h23",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  }).formatToParts(new Date(utcMs));
  const pak = (t: string) => Number(delen.find((p) => p.type === t)!.value);
  const alsUtc = Date.UTC(pak("year"), pak("month") - 1, pak("day"), pak("hour"), pak("minute"), pak("second"));
  return Math.round((alsUtc - Math.floor(utcMs / 1000) * 1000) / 60000);
}

/** UTC ms of a local wall-clock time in Amsterdam. */
export function lokaalNaarUtcMs(datum: string, uur = 0, minuut = 0): number {
  const [j, m, d] = datum.split("-").map(Number);
  const gok = Date.UTC(j, m - 1, d, uur, minuut);
  let afw = tzAfwijkingMinuten(gok - 120 * 60000);
  let utc = gok - afw * 60000;
  // Re-check once in case the guess fell on the other side of a DST switch.
  afw = tzAfwijkingMinuten(utc);
  utc = gok - afw * 60000;
  return utc;
}

/** [startUtcMs, eindUtcMs) of a local calendar day. 23, 24 or 25 hours long. */
export function dagGrenzenUtc(datum: string): [number, number] {
  return [lokaalNaarUtcMs(datum), lokaalNaarUtcMs(plusDagen(datum, 1))];
}

export function plusDagen(datum: string, n: number): string {
  const [j, m, d] = datum.split("-").map(Number);
  return new Date(Date.UTC(j, m - 1, d + n)).toISOString().slice(0, 10);
}

/** Today's date in Amsterdam, YYYY-MM-DD. */
export function vandaagLokaal(nu = Date.now()): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: TZ }).format(new Date(nu));
}

/** 2026-09-24T18:00:00+02:00 */
export function naarLokaalIso(utcMs: number): string {
  const afw = tzAfwijkingMinuten(utcMs);
  const lokaal = new Date(utcMs + afw * 60000).toISOString().slice(0, 19);
  const teken = afw >= 0 ? "+" : "-";
  const a = Math.abs(afw);
  return `${lokaal}${teken}${String(Math.floor(a / 60)).padStart(2, "0")}:${String(a % 60).padStart(2, "0")}`;
}

/** 2026-09-24T16:00:00Z */
export function naarUtcIso(utcMs: number): string {
  return new Date(utcMs).toISOString().replace(".000Z", "Z");
}
