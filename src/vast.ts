// Average fixed contract (CBS) → data/vast.json.
//
//   node src/vast.ts   # fetch CBS StatLine 85592NED; on failure keep data/vast.json as it is

import { join } from "node:path";
import { DATA, schrijfJsonAlsGewijzigd } from "./lib/bestanden.ts";
import { CBS_URL, bouwVast, leesCbs, type CbsRij } from "./lib/vast.ts";

try {
  const antwoord = await fetch(CBS_URL, { headers: { accept: "application/json" }, signal: AbortSignal.timeout(30_000) });
  if (!antwoord.ok) throw new Error(`CBS: HTTP ${antwoord.status}`);
  const { value } = (await antwoord.json()) as { value: CbsRij[] };
  const bestand = bouwVast(leesCbs(value), new Date().toISOString());
  const geschreven = await schrijfJsonAlsGewijzigd(join(DATA, "vast.json"), bestand);
  const l = bestand.laatste;
  console.log(`vast (CBS ${l.maand}): € ${l.totaalPerKwh}/kWh incl. energiebelasting, € ${l.vastPerMaand}/maand`);
  console.log(geschreven ? "vast.json geschreven" : "vast.json ongewijzigd");
} catch (e) {
  // CBS unreachable or changed: the previous file stays, the other data still gets updated.
  console.error(`vast: FOUT ${(e as Error).message} (data/vast.json blijft zoals hij was)`);
}
