// Home battery prices.
//
//   node src/thuisbatterijen.ts   # thuisbatterijen/thuisbatterijen.json → data/thuisbatterijen.json (no network)

import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { DATA, ROOT, schrijfJsonAlsGewijzigd } from "./lib/bestanden.ts";
import { bouwThuisbatterijen, type ThuisbatterijenConfig } from "./lib/thuisbatterijen.ts";

const cfg = JSON.parse(await readFile(join(ROOT, "thuisbatterijen", "thuisbatterijen.json"), "utf8")) as ThuisbatterijenConfig;
const bestand = bouwThuisbatterijen(cfg, new Date().toISOString());
const geschreven = await schrijfJsonAlsGewijzigd(join(DATA, "thuisbatterijen.json"), bestand);
for (const p of bestand.prijzen) {
  console.log(`${p.type} ${p.capaciteitKwh} kWh: € ${p.prijsInclBtw.van}–${p.prijsInclBtw.tot} (€ ${p.prijsPerKwhInclBtw.van}–${p.prijsPerKwhInclBtw.tot} per kWh)`);
}
console.log(geschreven ? "thuisbatterijen.json geschreven" : "thuisbatterijen.json ongewijzigd");
