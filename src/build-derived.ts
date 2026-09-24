// Build convenience files from prices + supplier tariffs:
//   data/prices/index.json   list of available days
//   data/compare/latest.json per-supplier hourly buy/sell prices for today and tomorrow

import { readdir } from "node:fs/promises";
import { join } from "node:path";
import { DATA, dayFilePath, readJson, writeJsonIfChanged } from "./lib/io.ts";
import { addDays, todayLocal } from "./lib/time.ts";
import type { DayPrices, SuppliersFile } from "./lib/types.ts";

const r6 = (n: number) => Math.round(n * 1e6) / 1e6 + 0;

async function listDays(): Promise<string[]> {
  const root = join(DATA, "prices");
  const days: string[] = [];
  for (const y of (await readdir(root).catch(() => [] as string[])).filter((d) => /^\d{4}$/.test(d))) {
    for (const f of await readdir(join(root, y))) {
      const m = f.match(/^(\d{4}-\d{2}-\d{2})\.json$/);
      if (m) days.push(m[1]);
    }
  }
  return days.sort();
}

export function compareDay(day: DayPrices, sup: SuppliersFile) {
  const gasPrices = day.gas?.hourly.map((p) => p.price) ?? [];
  const gasAvg = gasPrices.length ? gasPrices.reduce((a, b) => a + b, 0) / gasPrices.length : null;
  return {
    date: day.date,
    electricitySource: day.electricity?.source ?? null,
    gasMarketAverage: gasAvg === null ? null : r6(gasAvg),
    suppliers: sup.suppliers.map((s) => {
      const t = s.tariffs;
      const markup = t.electricityMarkup?.value;
      const feedIn = t.feedInDelta?.value;
      const gasMarkup = t.gasMarkup?.value;
      return {
        id: s.id,
        name: s.name,
        /** false if any tariff used here is not confirmed on the supplier's own site */
        verified: [t.electricityMarkup, t.feedInDelta, t.gasMarkup].every((v) => !v || v.verified),
        fixedMonthly: {
          electricity: t.electricityFixedMonthly?.value ?? null,
          gas: t.gasFixedMonthly?.value ?? null,
        },
        gasPrice: gasAvg !== null && gasMarkup !== undefined && gasMarkup !== null ? r6(gasAvg + gasMarkup) : null,
      };
    }),
    hours: (day.electricity?.hourly ?? []).map((p) => ({
      start: p.start,
      startUtc: p.startUtc,
      market: p.price,
      // buy = market + inkoopopslag, sell = market + feedInDelta (what you get per kWh fed back)
      buy: Object.fromEntries(
        sup.suppliers.map((s) => {
          const m = s.tariffs.electricityMarkup?.value;
          return [s.id, m === undefined || m === null ? null : r6(p.price + m)];
        }),
      ),
      sell: Object.fromEntries(
        sup.suppliers.map((s) => {
          const d = s.tariffs.feedInDelta?.value;
          return [s.id, d === undefined || d === null ? null : r6(p.price + d)];
        }),
      ),
    })),
  };
}

async function main() {
  const days = await listDays();
  await writeJsonIfChanged(join(DATA, "prices", "index.json"), {
    version: 1,
    generatedAt: new Date().toISOString(),
    first: days[0] ?? null,
    last: days.at(-1) ?? null,
    days,
  }, 1);

  const sup = await readJson<SuppliersFile>(join(DATA, "suppliers.json"));
  if (!sup) return console.log("no suppliers.json yet");
  const today = todayLocal();
  const load = (d: string) => readJson<DayPrices>(dayFilePath(d));
  const [t0, t1] = await Promise.all([load(today), load(addDays(today, 1))]);

  await writeJsonIfChanged(join(DATA, "compare", "latest.json"), {
    $schema: "../../schema/compare.schema.json",
    version: 1,
    generatedAt: new Date().toISOString(),
    currency: "EUR",
    vat: "excluded",
    note: "buy/sell exclude VAT, energy tax (energiebelasting) and grid costs. Add those for an all-in consumer price.",
    today: t0 ? compareDay(t0, sup) : null,
    tomorrow: t1 ? compareDay(t1, sup) : null,
  }, 1);
  console.log(`index: ${days.length} days; compare: today=${!!t0} tomorrow=${!!t1}`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
