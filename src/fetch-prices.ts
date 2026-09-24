// Fetch day-ahead market prices and write data/prices/.
//
//   node src/fetch-prices.ts                 # today + tomorrow (Europe/Amsterdam)
//   node src/fetch-prices.ts 2026-09-01 2026-09-23   # backfill a range
//
// Env: ENTSOE_TOKEN (optional). Without it, electricity comes from EnergyZero.

import { join } from "node:path";
import { DATA, dayFilePath, readJson, writeJsonIfChanged, writeText } from "./lib/io.ts";
import { fetchEnergyZero, fetchEntsoe, toHourly, type RawSeries } from "./lib/sources.ts";
import { addDays, dayBoundsUtc, toLocalIso, todayLocal, toUtcIso } from "./lib/time.ts";
import type { DayPrices, PricePoint } from "./lib/types.ts";

const HOUR = 3_600_000;
const r6 = (n: number) => Math.round(n * 1e6) / 1e6 + 0;

function points(map: Map<number, number>): PricePoint[] {
  return [...map.entries()]
    .sort(([a], [b]) => a - b)
    .map(([t, price]) => ({ start: toLocalIso(t), startUtc: toUtcIso(t), price: r6(price) }));
}

async function electricity(date: string): Promise<DayPrices["electricity"]> {
  const [start, end] = dayBoundsUtc(date);
  const hours = Math.round((end - start) / HOUR);
  const token = process.env.ENTSOE_TOKEN;

  type Source = NonNullable<DayPrices["electricity"]>["source"];
  const attempts: [Source, () => Promise<RawSeries | null>][] = [];
  if (token) attempts.push(["entsoe", () => fetchEntsoe(start, end, token)]);
  attempts.push(["energyzero", () => fetchEnergyZero(start, end, "electricity")]);

  for (const [source, run] of attempts) {
    try {
      const raw = await run();
      if (!raw) continue;
      const hourly = toHourly(raw);
      if (hourly.size !== hours) {
        console.warn(`  ${source}: ${hourly.size}/${hours} hours for ${date}, incomplete`);
        continue;
      }
      return {
        unit: "EUR/kWh",
        source,
        hourly: points(hourly),
        ...(raw.resolution < 60 ? { quarterHourly: points(raw.points) } : {}),
      };
    } catch (e) {
      console.warn(`  ${source}: ${(e as Error).message}`);
    }
  }
  return null;
}

async function gas(date: string): Promise<DayPrices["gas"]> {
  const [start, end] = dayBoundsUtc(date);
  try {
    const raw = await fetchEnergyZero(start, end, "gas");
    if (!raw) return null;
    return { unit: "EUR/m3", source: "energyzero", hourly: points(raw.points) };
  } catch (e) {
    console.warn(`  gas: ${(e as Error).message}`);
    return null;
  }
}

function toCsv(day: DayPrices): string {
  const gasByUtc = new Map(day.gas?.hourly.map((p) => [p.startUtc, p.price]) ?? []);
  const rows = ["start,start_utc,electricity_eur_kwh,gas_eur_m3"];
  for (const p of day.electricity?.hourly ?? []) {
    rows.push(`${p.start},${p.startUtc},${p.price},${gasByUtc.get(p.startUtc) ?? ""}`);
  }
  return rows.join("\n") + "\n";
}

async function fetchDay(date: string): Promise<DayPrices | null> {
  console.log(`prices ${date}`);
  const [el, g] = await Promise.all([electricity(date), gas(date)]);
  if (!el) {
    console.log(`  no complete electricity prices yet`);
    return null;
  }
  const day: DayPrices = {
    $schema: "../../../schema/prices.schema.json",
    version: 1,
    date,
    timezone: "Europe/Amsterdam",
    currency: "EUR",
    vat: "excluded",
    fetchedAt: new Date().toISOString(),
    electricity: el,
    gas: g,
  };
  // Keep a previously stored gas series if gas failed this time.
  const prev = await readJson<DayPrices>(dayFilePath(date));
  if (!day.gas && prev?.gas) day.gas = prev.gas;

  const changed = await writeJsonIfChanged(dayFilePath(date), day, Infinity);
  if (changed) await writeText(dayFilePath(date).replace(/\.json$/, ".csv"), toCsv(day));
  console.log(`  ${el.source}, ${el.hourly.length} h${changed ? ", written" : ", unchanged"}`);
  return day;
}

function datesFromArgs(args: string[]): string[] {
  const today = todayLocal();
  if (!args.length) return [today, addDays(today, 1)];
  const [from, to = from] = args;
  for (const d of [from, to]) if (!/^\d{4}-\d{2}-\d{2}$/.test(d)) throw new Error(`bad date "${d}", use YYYY-MM-DD`);
  const out: string[] = [];
  for (let d = from; d <= to; d = addDays(d, 1)) out.push(d);
  return out;
}

async function main() {
  const dates = datesFromArgs(process.argv.slice(2));
  for (const d of dates) await fetchDay(d);

  // latest.json: today + tomorrow (tomorrow is null until ~13:00 CET)
  const today = todayLocal();
  const latest = {
    $schema: "../../schema/latest.schema.json",
    version: 1,
    generatedAt: new Date().toISOString(),
    today: (await readJson<DayPrices>(dayFilePath(today))) ?? null,
    tomorrow: (await readJson<DayPrices>(dayFilePath(addDays(today, 1)))) ?? null,
  };
  await writeJsonIfChanged(join(DATA, "prices", "latest.json"), latest, 1);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
