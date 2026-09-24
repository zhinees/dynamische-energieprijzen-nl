// Build convenience files from prices + supplier tariffs:
//   data/prijzen/index.json        list of available days
//   data/vergelijking/actueel.json per-supplier hourly afname/teruglevering prices incl. btw for today and tomorrow

import { readdir } from "node:fs/promises";
import { join } from "node:path";
import { DATA, dagbestandPad, leesJson, schrijfJsonAlsGewijzigd } from "./lib/bestanden.ts";
import { plusDagen, vandaagLokaal } from "./lib/tijd.ts";
import { inclBtw } from "./lib/tarieven.ts";
import type { Dagprijzen, Leverancier, LeveranciersBestand, Veld } from "./lib/typen.ts";

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

/** Consumer view: every amount incl. 21% btw (still excl. energy tax and grid costs). */
export function vergelijkDag(dag: Dagprijzen, lev: LeveranciersBestand) {
  const gasPrijzen = dag.gas?.perUur.map((p) => p.prijsExclBtw) ?? [];
  const gasGem = gasPrijzen.length ? inclBtw(gasPrijzen.reduce((a, b) => a + b, 0) / gasPrijzen.length) : null;
  const incl = (l: Leverancier, veld: Veld) => l.tarieven[veld]?.bedragInclBtw ?? null;
  const plus = (a: number | null, b: number | null) => (a === null || b === null ? null : r6(a + b));
  return {
    datum: dag.datum,
    stroomBron: dag.stroom?.bron ?? null,
    gasMarktgemiddeldeInclBtw: gasGem,
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
      };
    }),
    uren: (dag.stroom?.perUur ?? []).map((p) => ({
      start: p.start,
      startUtc: p.startUtc,
      marktInclBtw: p.prijsInclBtw,
      // afname = markt + inkoopopslag, teruglevering = markt + terugleverCorrectie (what you get per kWh fed back)
      afnameInclBtw: Object.fromEntries(lev.leveranciers.map((l) => [l.id, plus(p.prijsInclBtw, incl(l, "stroomInkoopopslag"))])),
      terugleveringInclBtw: Object.fromEntries(lev.leveranciers.map((l) => [l.id, plus(p.prijsInclBtw, incl(l, "terugleverCorrectie"))])),
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
    btw: "inclusief",
    opmerking: "Alle bedragen zijn inclusief 21% btw, maar exclusief energiebelasting en netbeheerkosten. Tel die erbij op voor een all-in consumentenprijs.",
    vandaag: d0 ? vergelijkDag(d0, lev) : null,
    morgen: d1 ? vergelijkDag(d1, lev) : null,
  }, 1);
  console.log(`index: ${dagen.length} dagen; vergelijking: vandaag=${d0 ? "ja" : "nee"} morgen=${d1 ? "ja" : "nee"}`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
