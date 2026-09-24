// Market prices are not stored in this repo: anyone can get them from EnergyZero or ENTSO-E.
// The rekenhulp only needs a yearly average, which EnergyZero gives in one request.

import { inclBtw } from "./tarieven.ts";
import { lokaalNaarUtcMs, plusDagen, vandaagLokaal } from "./tijd.ts";

export interface Jaargemiddelde {
  /** Average of the daily average prices, incl. btw. */
  prijsInclBtw: number;
  /** Number of days it covers. */
  dagen: number;
  van: string;
  tot: string;
}

/** Average of EnergyZero's daily prices (EUR excl. btw) -> incl. btw. null when there are none. */
export function leesJaargemiddelde(json: any, van: string, tot: string): Jaargemiddelde | null {
  const prijzen: number[] = (json?.Prices ?? []).map((p: any) => p.price).filter((p: unknown) => typeof p === "number");
  if (!prijzen.length) return null;
  return { prijsInclBtw: inclBtw(prijzen.reduce((a, b) => a + b, 0) / prijzen.length), dagen: prijzen.length, van, tot };
}

/**
 * Average market price over the last 365 days (Europe/Amsterdam), from EnergyZero's public API.
 * Unweighted: as if you use the same amount every day.
 */
export async function haalJaargemiddelde(soort: "stroom" | "gas", vandaag = vandaagLokaal()): Promise<Jaargemiddelde | null> {
  const van = plusDagen(vandaag, -365);
  const url = new URL("https://api.energyzero.nl/v1/energyprices");
  url.search = new URLSearchParams({
    fromDate: new Date(lokaalNaarUtcMs(van)).toISOString(),
    tillDate: new Date(lokaalNaarUtcMs(vandaag) - 1).toISOString(),
    interval: "5", // per day
    usageType: soort === "stroom" ? "1" : "3",
    inclBtw: "false",
  }).toString();
  const res = await fetch(url, { signal: AbortSignal.timeout(30_000) });
  if (!res.ok) throw new Error(`EnergyZero HTTP ${res.status}`);
  return leesJaargemiddelde(await res.json(), van, plusDagen(vandaag, -1));
}
