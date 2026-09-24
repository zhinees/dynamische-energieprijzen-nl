// Market price sources. All return EUR per unit, excluding VAT, keyed by UTC ms.

const MINUTE = 60_000;

export interface RawSeries {
  /** interval length in minutes (15 or 60) */
  resolution: number;
  points: Map<number, number>;
}

// ---------------------------------------------------------------------------
// ENTSO-E Transparency Platform (official, needs a free token)
// https://transparency.entsoe.eu  → account settings → "Web API Security Token"
// ---------------------------------------------------------------------------

const NL_BZN = "10YNL----------L";

function entsoeStamp(ms: number): string {
  // yyyyMMddHHmm in UTC
  return new Date(ms).toISOString().replace(/[-:T]/g, "").slice(0, 12);
}

export async function fetchEntsoe(startMs: number, endMs: number, token: string): Promise<RawSeries | null> {
  const url = new URL("https://web-api.tp.entsoe.eu/api");
  url.search = new URLSearchParams({
    securityToken: token,
    documentType: "A44",
    in_Domain: NL_BZN,
    out_Domain: NL_BZN,
    "contract_MarketAgreement.type": "A01",
    periodStart: entsoeStamp(startMs),
    periodEnd: entsoeStamp(endMs),
  }).toString();
  const res = await fetch(url, { signal: AbortSignal.timeout(30_000) });
  const xml = await res.text();
  if (!res.ok && !xml.includes("Acknowledgement_MarketDocument")) {
    throw new Error(`ENTSO-E HTTP ${res.status}`);
  }
  return parseEntsoeXml(xml, startMs, endMs);
}

const tag = (xml: string, name: string) => xml.match(new RegExp(`<${name}>([^<]*)</${name}>`))?.[1];

/** Parse an A44 price document. EUR/MWh -> EUR/kWh. Prefers the finest resolution. */
export function parseEntsoeXml(xml: string, startMs: number, endMs: number): RawSeries | null {
  if (xml.includes("Acknowledgement_MarketDocument")) return null; // "no matching data"
  const byRes = new Map<number, Map<number, number>>();

  for (const period of xml.match(/<Period>[\s\S]*?<\/Period>/g) ?? []) {
    const pStart = Date.parse(tag(period, "start")!);
    const pEnd = Date.parse(tag(period, "end")!);
    const resM = tag(period, "resolution")!.match(/PT(\d+)M/);
    if (!resM) continue;
    const res = Number(resM[1]);
    const count = Math.round((pEnd - pStart) / (res * MINUTE));

    const given = new Map<number, number>();
    for (const p of period.match(/<Point>[\s\S]*?<\/Point>/g) ?? []) {
      given.set(Number(tag(p, "position")), Number(tag(p, "price.amount")));
    }
    // Curve type A03: a missing position repeats the previous price.
    const series = byRes.get(res) ?? new Map<number, number>();
    let last: number | undefined;
    for (let pos = 1; pos <= count; pos++) {
      if (given.has(pos)) last = given.get(pos)!;
      if (last === undefined) continue;
      const t = pStart + (pos - 1) * res * MINUTE;
      if (t >= startMs && t < endMs) series.set(t, last / 1000);
    }
    byRes.set(res, series);
  }
  if (!byRes.size) return null;
  const resolution = Math.min(...byRes.keys());
  return { resolution, points: byRes.get(resolution)! };
}

// ---------------------------------------------------------------------------
// EnergyZero public API (no key). Used as fallback for electricity and for gas.
// ---------------------------------------------------------------------------

export async function fetchEnergyZero(
  startMs: number,
  endMs: number,
  kind: "electricity" | "gas",
): Promise<RawSeries | null> {
  const url = new URL("https://api.energyzero.nl/v1/energyprices");
  url.search = new URLSearchParams({
    fromDate: new Date(startMs).toISOString(),
    tillDate: new Date(endMs - 1).toISOString(),
    interval: "4", // hourly
    usageType: kind === "electricity" ? "1" : "3",
    inclBtw: "false",
  }).toString();
  const res = await fetch(url, { signal: AbortSignal.timeout(30_000) });
  if (!res.ok) throw new Error(`EnergyZero HTTP ${res.status}`);
  return parseEnergyZero(await res.json(), startMs, endMs);
}

export function parseEnergyZero(json: any, startMs: number, endMs: number): RawSeries | null {
  const points = new Map<number, number>();
  for (const p of json?.Prices ?? []) {
    const t = Date.parse(p.readingDate);
    if (t >= startMs && t < endMs && typeof p.price === "number") points.set(t, p.price);
  }
  return points.size ? { resolution: 60, points } : null;
}

/** Average quarter-hours (or anything finer than an hour) into hourly prices. */
export function toHourly(series: RawSeries): Map<number, number> {
  if (series.resolution === 60) return new Map(series.points);
  const buckets = new Map<number, number[]>();
  for (const [t, p] of series.points) {
    const h = t - (t % (60 * MINUTE));
    (buckets.get(h) ?? buckets.set(h, []).get(h)!).push(p);
  }
  return new Map([...buckets].map(([h, ps]) => [h, ps.reduce((a, b) => a + b, 0) / ps.length]));
}
