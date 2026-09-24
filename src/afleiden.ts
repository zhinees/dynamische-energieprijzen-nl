// Build convenience files from prices + supplier tariffs:
//   data/prijzen/index.json        list of available days
//   data/vergelijking/actueel.json per-supplier hourly afname/teruglevering prices incl. btw for today and tomorrow
//   data/omslagpunten.json         usage where fixed costs stop mattering more than the markup (+ OMSLAGPUNTEN.md, history)

import { readdir } from "node:fs/promises";
import { join } from "node:path";
import { DATA, dagbestandPad, leesJson, schrijfJsonAlsGewijzigd } from "./lib/bestanden.ts";
import { plusDagen, vandaagLokaal } from "./lib/tijd.ts";
import { inclBtw } from "./lib/tarieven.ts";
import { publiceerOmslagpunten } from "./lib/omslagpunten-publiceren.ts";
import type { Dagprijzen, EnergiebelastingBestand, Leverancier, LeveranciersBestand, Veld } from "./lib/typen.ts";

const r6 = (n: number) => Math.round(n * 1e6) / 1e6 + 0;

async function lijstDagen(): Promise<string[]> {
  const basis = join(DATA, "prijzen");
  const dagen: string[] = [];
  for (const j of (await readdir(basis).catch(() => [] as string[])).filter((d) => /^\d{4}$/.test(d))) {
    for (const f of await readdir(join(basis, j))) {
      const m = f.match(/^(\d{4}-\d{2}-\d{2})\.json$/);
      if (m) dagen.push(m[1]);
    }
  }
  return dagen.sort();
}

/**
 * Consumer view: every amount incl. 21% btw. ...MetEnergiebelasting adds the energy tax
 * of the day's year; grid costs are never included (they depend on the region).
 */
export function vergelijkDag(dag: Dagprijzen, lev: LeveranciersBestand, belasting?: EnergiebelastingBestand) {
  const eb = belasting?.jaren[dag.datum.slice(0, 4)];
  const gasPrijzen = dag.gas?.perUur.map((p) => p.prijsExclBtw) ?? [];
  const gasGem = gasPrijzen.length ? inclBtw(gasPrijzen.reduce((a, b) => a + b, 0) / gasPrijzen.length) : null;
  const incl = (l: Leverancier, veld: Veld) => l.tarieven[veld]?.bedragInclBtw ?? null;
  const plus = (a: number | null, b: number | null) => (a === null || b === null ? null : r6(a + b));
  return {
    datum: dag.datum,
    stroomBron: dag.stroom?.bron ?? null,
    gasMarktgemiddeldeInclBtw: gasGem,
    energiebelastingInclBtw: eb
      ? {
          stroomPerKwh: eb.stroomPerKwh.bedragInclBtw,
          gasPerM3: eb.gasPerM3.bedragInclBtw,
          verminderingPerAansluitingPerJaar: eb.verminderingPerAansluitingPerJaar.bedragInclBtw,
        }
      : null,
    leveranciers: lev.leveranciers.map((l) => {
      const t = l.tarieven;
      return {
        id: l.id,
        naam: l.naam,
        /** false if any tariff used here is not confirmed on the supplier's own site */
        geverifieerd: [t.stroomInkoopopslag, t.terugleverCorrectie, t.gasInkoopopslag].every((v) => !v || v.geverifieerd),
        vastPerMaandInclBtw: {
          stroom: incl(l, "stroomVastPerMaand"),
          gas: incl(l, "gasVastPerMaand"),
        },
        gasPrijsInclBtw: plus(gasGem, incl(l, "gasInkoopopslag")),
        gasPrijsMetEnergiebelastingInclBtw: plus(plus(gasGem, incl(l, "gasInkoopopslag")), eb?.gasPerM3.bedragInclBtw ?? null),
      };
    }),
    uren: (dag.stroom?.perUur ?? []).map((p) => ({
      start: p.start,
      startUtc: p.startUtc,
      marktInclBtw: p.prijsInclBtw,
      // afname = markt + inkoopopslag, teruglevering = markt + terugleverCorrectie (what you get per kWh fed back)
      afnameInclBtw: Object.fromEntries(lev.leveranciers.map((l) => [l.id, plus(p.prijsInclBtw, incl(l, "stroomInkoopopslag"))])),
      terugleveringInclBtw: Object.fromEntries(lev.leveranciers.map((l) => [l.id, plus(p.prijsInclBtw, incl(l, "terugleverCorrectie"))])),
      // What a kWh taken from the grid really costs, apart from grid costs.
      afnameMetEnergiebelastingInclBtw: Object.fromEntries(
        lev.leveranciers.map((l) => [l.id, plus(plus(p.prijsInclBtw, incl(l, "stroomInkoopopslag")), eb?.stroomPerKwh.bedragInclBtw ?? null)]),
      ),
    })),
  };
}

async function main() {
  const dagen = await lijstDagen();
  await schrijfJsonAlsGewijzigd(join(DATA, "prijzen", "index.json"), {
    $schema: "../../schema/prijzen-index.schema.json",
    versie: 1,
    gegenereerdOp: new Date().toISOString(),
    eerste: dagen[0] ?? null,
    laatste: dagen.at(-1) ?? null,
    dagen,
  }, 1);

  const lev = await leesJson<LeveranciersBestand>(join(DATA, "leveranciers.json"));
  if (!lev) return console.log("nog geen leveranciers.json");
  const omslag = await publiceerOmslagpunten(lev);
  const vandaag = vandaagLokaal();
  const belasting = await leesJson<EnergiebelastingBestand>(join(DATA, "energiebelasting.json"));
  const laad = (d: string) => leesJson<Dagprijzen>(dagbestandPad(d));
  const [d0, d1] = await Promise.all([laad(vandaag), laad(plusDagen(vandaag, 1))]);

  await schrijfJsonAlsGewijzigd(join(DATA, "vergelijking", "actueel.json"), {
    $schema: "../../schema/vergelijking.schema.json",
    versie: 1,
    gegenereerdOp: new Date().toISOString(),
    valuta: "EUR",
    btw: "inclusief",
    opmerking:
      "Alle bedragen zijn inclusief 21% btw. Velden met 'MetEnergiebelasting' tellen ook de energiebelasting van de Belastingdienst mee; de andere niet. Netbeheerkosten en de belastingvermindering per aansluiting zitten nergens in.",
    vandaag: d0 ? vergelijkDag(d0, lev, belasting) : null,
    morgen: d1 ? vergelijkDag(d1, lev, belasting) : null,
  }, 1);
  console.log(`index: ${dagen.length} dagen; vergelijking: vandaag=${d0 ? "ja" : "nee"} morgen=${d1 ? "ja" : "nee"}`);
  console.log(`omslagpunten: stroom ${omslag.stroom.omslagpunt ?? "–"} kWh, gas ${omslag.gas.omslagpunt ?? "–"} m3, teruglevering ${omslag.teruglevering.omslagpunt ?? "–"} kWh`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
