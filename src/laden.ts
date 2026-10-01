// Home charging: ERE payment and home charger price.
//
//   node src/laden.ts   # laden/laden.json → data/laden.json (no network)

import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { DATA, ROOT, schrijfJsonAlsGewijzigd } from "./lib/bestanden.ts";
import { bouwLaden, type LadenConfig } from "./lib/laden.ts";

const cfg = JSON.parse(await readFile(join(ROOT, "laden", "laden.json"), "utf8")) as LadenConfig;
const bestand = bouwLaden(cfg, new Date().toISOString());
const geschreven = await schrijfJsonAlsGewijzigd(join(DATA, "laden.json"), bestand);
console.log(`ERE: € ${bestand.ere.perKwh.richtwaarde} per kWh (€ ${bestand.ere.perKwh.van}–${bestand.ere.perKwh.tot}); laadpaal € ${bestand.laadpaal.prijsInclBtw.van}–${bestand.laadpaal.prijsInclBtw.tot}`);
console.log(geschreven ? "laden.json geschreven" : "laden.json ongewijzigd");
