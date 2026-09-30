// Watch pages and pdfs of suppliers without an automatic source (see `bewaken` in leveranciers/*.json):
//   data/bewaakt/<id>--<pad>.txt  the watched text, one sentence per line
//   data/BEWAKING.md              what changed this run (🔔 = open an issue)

import { readdir, readFile, rm } from "node:fs/promises";
import { join } from "node:path";
import { bewaak, rapport } from "./lib/bewaken.ts";
import { DATA, laadLeverancierConfigs, schrijfTekst } from "./lib/bestanden.ts";
import { vandaagLokaal } from "./lib/tijd.ts";

const MAP = join(DATA, "bewaakt");

async function main() {
  const vorige = new Map<string, string>();
  for (const f of await readdir(MAP).catch(() => [] as string[])) vorige.set(f, await readFile(join(MAP, f), "utf8"));

  const uitkomsten = await bewaak(await laadLeverancierConfigs(), vorige);
  for (const u of uitkomsten) if (u.tekst !== undefined) await schrijfTekst(join(MAP, u.bestand), u.tekst);
  // Drop files of URLs that are no longer watched (a failed fetch keeps its old file).
  const bewaakt = new Set(uitkomsten.map((u) => u.bestand));
  for (const f of vorige.keys()) if (!bewaakt.has(f)) await rm(join(MAP, f));

  await schrijfTekst(join(DATA, "BEWAKING.md"), rapport(uitkomsten, vandaagLokaal()));
  for (const u of uitkomsten) console.log(`${u.status.padEnd(9)} ${u.id}: ${u.bewaking.omschrijving}${u.fout ? ` (${u.fout})` : ""}`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
