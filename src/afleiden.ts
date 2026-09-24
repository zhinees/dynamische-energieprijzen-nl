// Build convenience files from prices + supplier tariffs:
//   data/prijzen/index.json        list of available days
//   data/vergelijking/actueel.json per-supplier hourly afname/teruglevering prices for today and tomorrow

import { readdir } from "node:fs/promises";
import { join } from "node:path";
import { DATA, dagbestandPad, leesJson, schrijfJsonAlsGewijzigd } from "./lib/bestanden.ts";
import { plusDagen, vandaagLokaal } from "./lib/tijd.ts";
import type { Dagprijzen, LeveranciersBestand } from "./lib/typen.ts";

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

export function vergelijkDag(dag: Dagprijzen, lev: LeveranciersBestand) {
  const gasPrijzen = dag.gas?.perUur.map((p) => p.prijs) ?? [];
  const gasGem = gasPrijzen.length ? gasPrijzen.reduce((a, b) => a + b, 0) / gasPrijzen.length : null;
  return {
    datum: dag.datum,
    stroomBron: dag.stroom?.bron ?? null,
    gasMarktgemiddelde: gasGem === null ? null : r6(gasGem),
    leveranciers: lev.leveranciers.map((l) => {
      const t = l.tarieven;
      const gasOpslag = t.gasInkoopopslag?.waarde;
      return {
        id: l.id,
        naam: l.naam,
        /** false if any tariff used here is not confirmed on the supplier's own site */
        geverifieerd: [t.stroomInkoopopslag, t.terugleverCorrectie, t.gasInkoopopslag].every((v) => !v || v.geverifieerd),
        vastPerMaand: {
          stroom: t.stroomVastPerMaand?.waarde ?? null,
          gas: t.gasVastPerMaand?.waarde ?? null,
        },
        gasPrijs: gasGem !== null && gasOpslag !== undefined && gasOpslag !== null ? r6(gasGem + gasOpslag) : null,
      };
    }),
    uren: (dag.stroom?.perUur ?? []).map((p) => ({
      start: p.start,
      startUtc: p.startUtc,
      markt: p.prijs,
      // afname = markt + inkoopopslag, teruglevering = markt + terugleverCorrectie (what you get per kWh fed back)
      afname: Object.fromEntries(
        lev.leveranciers.map((l) => {
          const o = l.tarieven.stroomInkoopopslag?.waarde;
          return [l.id, o === undefined || o === null ? null : r6(p.prijs + o)];
        }),
      ),
      teruglevering: Object.fromEntries(
        lev.leveranciers.map((l) => {
          const c = l.tarieven.terugleverCorrectie?.waarde;
          return [l.id, c === undefined || c === null ? null : r6(p.prijs + c)];
        }),
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
  const vandaag = vandaagLokaal();
  const laad = (d: string) => leesJson<Dagprijzen>(dagbestandPad(d));
  const [d0, d1] = await Promise.all([laad(vandaag), laad(plusDagen(vandaag, 1))]);

  await schrijfJsonAlsGewijzigd(join(DATA, "vergelijking", "actueel.json"), {
    $schema: "../../schema/vergelijking.schema.json",
    versie: 1,
    gegenereerdOp: new Date().toISOString(),
    valuta: "EUR",
    btw: "exclusief",
    opmerking: "afname/teruglevering zijn exclusief btw, energiebelasting en netbeheerkosten. Tel die erbij op voor een all-in consumentenprijs.",
    vandaag: d0 ? vergelijkDag(d0, lev) : null,
    morgen: d1 ? vergelijkDag(d1, lev) : null,
  }, 1);
  console.log(`index: ${dagen.length} dagen; vergelijking: vandaag=${d0 ? "ja" : "nee"} morgen=${d1 ? "ja" : "nee"}`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
