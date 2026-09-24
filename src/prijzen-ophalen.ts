// Fetch day-ahead market prices and write data/prijzen/.
//
//   node src/prijzen-ophalen.ts                          # today + tomorrow (Europe/Amsterdam)
//   node src/prijzen-ophalen.ts 2026-09-01 2026-09-23    # backfill a range
//
// Env: ENTSOE_TOKEN (optional). Without it, electricity comes from EnergyZero.

import { join } from "node:path";
import { DATA, dagbestandPad, leesJson, schrijfJsonAlsGewijzigd, schrijfTekst } from "./lib/bestanden.ts";
import { haalEnergyZero, haalEntsoe, naarPerUur, type RuweReeks } from "./lib/bronnen.ts";
import { dagGrenzenUtc, naarLokaalIso, naarUtcIso, plusDagen, vandaagLokaal } from "./lib/tijd.ts";
import type { Dagprijzen, Prijspunt } from "./lib/typen.ts";

const UUR = 3_600_000;
const r6 = (n: number) => Math.round(n * 1e6) / 1e6 + 0;

function punten(map: Map<number, number>): Prijspunt[] {
  return [...map.entries()]
    .sort(([a], [b]) => a - b)
    .map(([t, prijs]) => ({ start: naarLokaalIso(t), startUtc: naarUtcIso(t), prijs: r6(prijs) }));
}

async function stroom(datum: string): Promise<Dagprijzen["stroom"]> {
  const [start, eind] = dagGrenzenUtc(datum);
  const uren = Math.round((eind - start) / UUR);
  const token = process.env.ENTSOE_TOKEN;

  type Bron = NonNullable<Dagprijzen["stroom"]>["bron"];
  const pogingen: [Bron, () => Promise<RuweReeks | null>][] = [];
  if (token) pogingen.push(["entsoe", () => haalEntsoe(start, eind, token)]);
  pogingen.push(["energyzero", () => haalEnergyZero(start, eind, "stroom")]);

  for (const [bron, haal] of pogingen) {
    try {
      const ruw = await haal();
      if (!ruw) continue;
      const perUur = naarPerUur(ruw);
      if (perUur.size !== uren) {
        console.warn(`  ${bron}: ${perUur.size}/${uren} uur voor ${datum}, onvolledig`);
        continue;
      }
      return {
        eenheid: "EUR/kWh",
        bron,
        perUur: punten(perUur),
        ...(ruw.resolutie < 60 ? { perKwartier: punten(ruw.punten) } : {}),
      };
    } catch (e) {
      console.warn(`  ${bron}: ${(e as Error).message}`);
    }
  }
  return null;
}

async function gas(datum: string): Promise<Dagprijzen["gas"]> {
  const [start, eind] = dagGrenzenUtc(datum);
  try {
    const ruw = await haalEnergyZero(start, eind, "gas");
    if (!ruw) return null;
    return { eenheid: "EUR/m3", bron: "energyzero", perUur: punten(ruw.punten) };
  } catch (e) {
    console.warn(`  gas: ${(e as Error).message}`);
    return null;
  }
}

function naarCsv(dag: Dagprijzen): string {
  const gasPerUtc = new Map(dag.gas?.perUur.map((p) => [p.startUtc, p.prijs]) ?? []);
  const rijen = ["start,start_utc,stroom_eur_kwh,gas_eur_m3"];
  for (const p of dag.stroom?.perUur ?? []) {
    rijen.push(`${p.start},${p.startUtc},${p.prijs},${gasPerUtc.get(p.startUtc) ?? ""}`);
  }
  return rijen.join("\n") + "\n";
}

async function haalDag(datum: string): Promise<Dagprijzen | null> {
  console.log(`prijzen ${datum}`);
  const [s, g] = await Promise.all([stroom(datum), gas(datum)]);
  if (!s) {
    console.log(`  nog geen volledige stroomprijzen`);
    return null;
  }
  const dag: Dagprijzen = {
    $schema: "../../../schema/prijzen.schema.json",
    versie: 1,
    datum,
    tijdzone: "Europe/Amsterdam",
    valuta: "EUR",
    btw: "exclusief",
    opgehaaldOp: new Date().toISOString(),
    stroom: s,
    gas: g,
  };
  // Keep a previously stored gas series if gas failed this time.
  const vorige = await leesJson<Dagprijzen>(dagbestandPad(datum));
  if (!dag.gas && vorige?.gas) dag.gas = vorige.gas;

  const gewijzigd = await schrijfJsonAlsGewijzigd(dagbestandPad(datum), dag, Infinity);
  if (gewijzigd) await schrijfTekst(dagbestandPad(datum).replace(/\.json$/, ".csv"), naarCsv(dag));
  console.log(`  ${s.bron}, ${s.perUur.length} uur${gewijzigd ? ", geschreven" : ", ongewijzigd"}`);
  return dag;
}

function datumsUitArgs(args: string[]): string[] {
  const vandaag = vandaagLokaal();
  if (!args.length) return [vandaag, plusDagen(vandaag, 1)];
  const [van, tot = van] = args;
  for (const d of [van, tot]) if (!/^\d{4}-\d{2}-\d{2}$/.test(d)) throw new Error(`ongeldige datum "${d}", gebruik JJJJ-MM-DD`);
  const uit: string[] = [];
  for (let d = van; d <= tot; d = plusDagen(d, 1)) uit.push(d);
  return uit;
}

async function main() {
  const datums = datumsUitArgs(process.argv.slice(2));
  for (const d of datums) await haalDag(d);

  // actueel.json: today + tomorrow (tomorrow is null until ~13:00 CET)
  const vandaag = vandaagLokaal();
  const actueel = {
    $schema: "../../schema/prijzen-actueel.schema.json",
    versie: 1,
    gegenereerdOp: new Date().toISOString(),
    vandaag: (await leesJson<Dagprijzen>(dagbestandPad(vandaag))) ?? null,
    morgen: (await leesJson<Dagprijzen>(dagbestandPad(plusDagen(vandaag, 1)))) ?? null,
  };
  await schrijfJsonAlsGewijzigd(join(DATA, "prijzen", "actueel.json"), actueel, 1);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
