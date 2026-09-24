// Read the energy tax rates from the Belastingdienst and write data/energiebelasting.json.
//
//   node src/belasting-ophalen.ts            # read the Belastingdienst page
//   node src/belasting-ophalen.ts --offline  # no network: rebuild from handmatig values (used in CI)

import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { DATA, ROOT, leesJson, schrijfJsonAlsGewijzigd } from "./lib/bestanden.ts";
import { bouwEnergiebelasting, leesEnergiebelasting, type Jaarwaarden } from "./lib/energiebelasting.ts";
import { haalPaginaTekst } from "./lib/pagina-ophalen.ts";
import type { EnergiebelastingBestand, EnergiebelastingConfig } from "./lib/typen.ts";

const UITVOER = join(DATA, "energiebelasting.json");

async function main() {
  const offline = process.argv.includes("--offline");
  const cfg = JSON.parse(await readFile(join(ROOT, "belastingen", "energiebelasting.json"), "utf8")) as EnergiebelastingConfig;
  const vorige = await leesJson<EnergiebelastingBestand>(UITVOER);

  let gelezen: Map<number, Jaarwaarden> | undefined;
  let fout: string | undefined;
  if (!offline) {
    try {
      gelezen = leesEnergiebelasting(await haalPaginaTekst(cfg.tariefUrl));
    } catch (e) {
      fout = (e as Error).message;
    }
  }

  const bestand = bouwEnergiebelasting(cfg, gelezen, vorige, new Date().toISOString(), fout);
  const geschreven = await schrijfJsonAlsGewijzigd(UITVOER, bestand);
  const jaren = Object.entries(bestand.jaren).map(([j, v]) => `${j} (${v.bron})`).join(", ");
  console.log(`energiebelasting: ${jaren}${fout ? `  FOUT ${fout}` : ""}`);
  console.log(geschreven ? "energiebelasting.json geschreven" : "energiebelasting.json ongewijzigd");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
