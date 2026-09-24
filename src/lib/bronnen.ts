// Market price sources. All return EUR per unit, excluding VAT, keyed by UTC ms.

const MINUUT = 60_000;

export interface RuweReeks {
  /** interval length in minutes (15 or 60) */
  resolutie: number;
  punten: Map<number, number>;
}

// ---------------------------------------------------------------------------
// ENTSO-E Transparency Platform (official, needs a free token)
// https://transparency.entsoe.eu  → account settings → "Web API Security Token"
// ---------------------------------------------------------------------------

const NL_BZN = "10YNL----------L";

function entsoeStempel(ms: number): string {
  // yyyyMMddHHmm in UTC
  return new Date(ms).toISOString().replace(/[-:T]/g, "").slice(0, 12);
}

export async function haalEntsoe(startMs: number, eindMs: number, token: string): Promise<RuweReeks | null> {
  const url = new URL("https://web-api.tp.entsoe.eu/api");
  url.search = new URLSearchParams({
    securityToken: token,
    documentType: "A44",
    in_Domain: NL_BZN,
    out_Domain: NL_BZN,
    "contract_MarketAgreement.type": "A01",
    periodStart: entsoeStempel(startMs),
    periodEnd: entsoeStempel(eindMs),
  }).toString();
  const res = await fetch(url, { signal: AbortSignal.timeout(30_000) });
  const xml = await res.text();
  if (!res.ok && !xml.includes("Acknowledgement_MarketDocument")) {
    throw new Error(`ENTSO-E HTTP ${res.status}`);
  }
  return leesEntsoeXml(xml, startMs, eindMs);
}

const tag = (xml: string, naam: string) => xml.match(new RegExp(`<${naam}>([^<]*)</${naam}>`))?.[1];

/** Parse an A44 price document. EUR/MWh -> EUR/kWh. Prefers the finest resolution. */
export function leesEntsoeXml(xml: string, startMs: number, eindMs: number): RuweReeks | null {
  if (xml.includes("Acknowledgement_MarketDocument")) return null; // "no matching data"
  const perResolutie = new Map<number, Map<number, number>>();

  for (const periode of xml.match(/<Period>[\s\S]*?<\/Period>/g) ?? []) {
    const pStart = Date.parse(tag(periode, "start")!);
    const pEind = Date.parse(tag(periode, "end")!);
    const resM = tag(periode, "resolution")!.match(/PT(\d+)M/);
    if (!resM) continue;
    const res = Number(resM[1]);
    const aantal = Math.round((pEind - pStart) / (res * MINUUT));

    const gegeven = new Map<number, number>();
    for (const p of periode.match(/<Point>[\s\S]*?<\/Point>/g) ?? []) {
      gegeven.set(Number(tag(p, "position")), Number(tag(p, "price.amount")));
    }
    // Curve type A03: a missing position repeats the previous price.
    const reeks = perResolutie.get(res) ?? new Map<number, number>();
    let laatste: number | undefined;
    for (let pos = 1; pos <= aantal; pos++) {
      if (gegeven.has(pos)) laatste = gegeven.get(pos)!;
      if (laatste === undefined) continue;
      const t = pStart + (pos - 1) * res * MINUUT;
      if (t >= startMs && t < eindMs) reeks.set(t, laatste / 1000);
    }
    perResolutie.set(res, reeks);
  }
  if (!perResolutie.size) return null;
  const resolutie = Math.min(...perResolutie.keys());
  return { resolutie, punten: perResolutie.get(resolutie)! };
}

// ---------------------------------------------------------------------------
// EnergyZero public API (no key). Used as fallback for electricity and for gas.
// ---------------------------------------------------------------------------

export async function haalEnergyZero(
  startMs: number,
  eindMs: number,
  soort: "stroom" | "gas",
): Promise<RuweReeks | null> {
  const url = new URL("https://api.energyzero.nl/v1/energyprices");
  url.search = new URLSearchParams({
    fromDate: new Date(startMs).toISOString(),
    tillDate: new Date(eindMs - 1).toISOString(),
    interval: "4", // hourly
    usageType: soort === "stroom" ? "1" : "3",
    inclBtw: "false",
  }).toString();
  const res = await fetch(url, { signal: AbortSignal.timeout(30_000) });
  if (!res.ok) throw new Error(`EnergyZero HTTP ${res.status}`);
  return leesEnergyZero(await res.json(), startMs, eindMs);
}

export function leesEnergyZero(json: any, startMs: number, eindMs: number): RuweReeks | null {
  const punten = new Map<number, number>();
  for (const p of json?.Prices ?? []) {
    const t = Date.parse(p.readingDate);
    if (t >= startMs && t < eindMs && typeof p.price === "number") punten.set(t, p.price);
  }
  return punten.size ? { resolutie: 60, punten } : null;
}

/** Average quarter-hours (or anything finer than an hour) into hourly prices. */
export function naarPerUur(reeks: RuweReeks): Map<number, number> {
  if (reeks.resolutie === 60) return new Map(reeks.punten);
  const bakjes = new Map<number, number[]>();
  for (const [t, p] of reeks.punten) {
    const u = t - (t % (60 * MINUUT));
    (bakjes.get(u) ?? bakjes.set(u, []).get(u)!).push(p);
  }
  return new Map([...bakjes].map(([u, ps]) => [u, ps.reduce((a, b) => a + b, 0) / ps.length]));
}
