// Build derived files from the supplier tariffs:
//   data/omslagpunten.json  usage where fixed costs stop mattering more than the markup
//                           (+ OMSLAGPUNTEN.md and omslagpunten-geschiedenis.json)

import { join } from "node:path";
import { DATA, leesJson } from "./lib/bestanden.ts";
import { publiceerOmslagpunten } from "./lib/omslagpunten-publiceren.ts";
import type { LeveranciersBestand } from "./lib/typen.ts";

async function main() {
  const lev = await leesJson<LeveranciersBestand>(join(DATA, "leveranciers.json"));
  if (!lev) return console.log("nog geen leveranciers.json");
  const omslag = await publiceerOmslagpunten(lev);
  console.log(`omslagpunten: stroom ${omslag.stroom.omslagpunt ?? "–"} kWh, gas ${omslag.gas.omslagpunt ?? "–"} m3, teruglevering ${omslag.teruglevering.omslagpunt ?? "–"} kWh`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
