// Fixed electricity contracts of suppliers.
//
//   node src/vaste-contracten.ts   # vaste-contracten/contracten.json → data/vaste-contracten.json (no network)

import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { DATA, ROOT, laadLeverancierConfigs, schrijfJsonAlsGewijzigd } from "./lib/bestanden.ts";
import { bouwVasteContracten, type VasteContractenConfig } from "./lib/vaste-contracten.ts";

const cfg = JSON.parse(await readFile(join(ROOT, "vaste-contracten", "contracten.json"), "utf8")) as VasteContractenConfig;
const websites = Object.fromEntries((await laadLeverancierConfigs()).map((l) => [l.id, l.website]));
const bestand = bouwVasteContracten(cfg, new Date().toISOString(), websites);
const geschreven = await schrijfJsonAlsGewijzigd(join(DATA, "vaste-contracten.json"), bestand);
console.log(`${bestand.contracten.length} vaste contracten: ${bestand.contracten.map((c) => `${c.leverancier} ${c.naam}`).join(", ")}`);
console.log(geschreven ? "vaste-contracten.json geschreven" : "vaste-contracten.json ongewijzigd");
