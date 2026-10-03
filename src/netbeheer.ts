// Grid tariffs and the grid operator per postcode.
//
//   node src/netbeheer.ts               # netbeheer/netbeheerders.json → data/netbeheer.json (no network)
//   node src/netbeheer.ts --postcodes   # also data/netbeheer-postcodes.json, once a year (January)
//
// --postcodes downloads the open small-consumer file of each grid operator (tens of MB) and asks PDOK
// which postcodes exist in each four-digit area that appears in them, so postcodes that no file
// mentions can be given to Enexis, which no longer publishes its file. Downloads and PDOK answers are
// kept in tmp/netbeheer/ so a rerun costs nothing; remove that folder for fresh data.

import { mkdir, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { DATA, ROOT, leesJson, schrijfJsonAlsGewijzigd } from "./lib/bestanden.ts";
import { bouwNetbeheer, bouwPostcodes, gebiedenIn, leesCsv, leesXlsx, netbeheerderVoor, stroomBereiken, type NetbeheerConfig, type PostcodesBestand } from "./lib/netbeheer.ts";

const CACHE = join(ROOT, "tmp", "netbeheer");
const PDOK = "https://api.pdok.nl/bzk/locatieserver/search/v3_1/free";
const AGENT = "energieprijzen-nl (+https://github.com/zhinees/energieprijzen-nl)";

async function metCache(naam: string, haal: () => Promise<Buffer>): Promise<Buffer> {
  const pad = join(CACHE, naam);
  try {
    return await readFile(pad);
  } catch {
    const buf = await haal();
    await mkdir(CACHE, { recursive: true });
    await writeFile(pad, buf);
    return buf;
  }
}

async function download(url: string): Promise<Buffer> {
  const r = await fetch(url, { headers: { "user-agent": AGENT } });
  if (!r.ok) throw new Error(`${url}: HTTP ${r.status}`);
  return Buffer.from(await r.arrayBuffer());
}

/** All six-character postcodes of one four-digit area, from the PDOK Locatieserver (100 per page). */
async function postcodesIn(pc4: string): Promise<string[]> {
  const uit: string[] = [];
  for (let start = 0; ; start += 100) {
    const q = new URLSearchParams({ q: `postcode:${pc4}*`, fq: "type:postcode", fl: "postcode", rows: "100", start: String(start) });
    let r: Response | undefined;
    for (let poging = 0; poging < 3 && !r?.ok; poging++) {
      if (poging) await new Promise((w) => setTimeout(w, 2000 * poging));
      r = await fetch(`${PDOK}?${q}`, { headers: { "user-agent": AGENT } });
    }
    if (!r?.ok) throw new Error(`PDOK ${pc4}: HTTP ${r?.status}`);
    const d = (await r.json()) as { response: { numFound: number; docs: { postcode: string }[] } };
    uit.push(...d.response.docs.map((x) => x.postcode).filter((p) => p.startsWith(pc4)));
    if (start + 100 >= d.response.numFound) return uit;
  }
}

async function main() {
  const cfg = JSON.parse(await readFile(join(ROOT, "netbeheer", "netbeheerders.json"), "utf8")) as NetbeheerConfig;
  const nu = new Date().toISOString();
  const tarieven = bouwNetbeheer(cfg, nu);
  const geschreven = await schrijfJsonAlsGewijzigd(join(DATA, "netbeheer.json"), tarieven);
  console.log(`netbeheer: ${tarieven.netbeheerders.map((n) => `${n.id} € ${n.tarieven.tm3x25.bedragInclBtw.toFixed(2)}`).join(", ")} (t/m 3x25A incl. btw)`);
  console.log(geschreven ? "netbeheer.json geschreven" : "netbeheer.json ongewijzigd");
  if (!process.argv.includes("--postcodes")) return;

  // 1. Electricity postcode ranges per grid operator.
  const bereiken = new Map<string, [string, string][]>();
  const bronnen: PostcodesBestand["bronnen"] = [];
  for (const n of cfg.netbeheerders) {
    if (!n.openData) continue;
    const buf = await metCache(`${n.id}.${n.openData.formaat}`, () => download(n.openData!.url));
    const rijen = n.openData.formaat === "xlsx" ? leesXlsx(buf) : leesCsv(buf.toString("latin1"));
    const lijst = stroomBereiken(rijen);
    if (lijst.length < 100) throw new Error(`${n.id}: maar ${lijst.length} regels stroom; is het bestand veranderd?`);
    bereiken.set(n.id, lijst);
    bronnen.push({ id: n.id, url: n.openData.url });
    console.log(`${n.id}: ${lijst.length} postcodebereiken stroom`);
  }

  // 2. Existing postcodes per four-digit area that appears in any file (PDOK), 4 requests at a time.
  const gebieden = gebiedenIn(bereiken.values());
  const pdokPad = join(CACHE, "pdok-postcodes.json");
  const bestaand = new Map(Object.entries((await leesJson<Record<string, string[]>>(pdokPad)) ?? {}));
  const open = gebieden.filter((g) => !bestaand.has(g));
  console.log(`PDOK: ${gebieden.length} gebieden, ${open.length} nog op te vragen`);
  let klaar = 0;
  await Promise.all(Array.from({ length: 4 }, async () => {
    for (let g = open.shift(); g; g = open.shift()) {
      bestaand.set(g, await postcodesIn(g));
      if (++klaar % 250 === 0) {
        console.log(`  ${klaar} gebieden`);
        await writeFile(pdokPad, JSON.stringify(Object.fromEntries(bestaand)));
      }
    }
  }));
  await mkdir(CACHE, { recursive: true });
  await writeFile(pdokPad, JSON.stringify(Object.fromEntries(bestaand)));

  // 3. The table, with a few known postcodes as a check.
  // Guessing the Enexis border is only worth it where it changes the price: next to Liander and Stedin
  // (about € 1–3 a year apart) the long runs of missing postcodes are mostly business parks instead.
  const prijs = (id: string) => cfg.netbeheerders.find((n) => n.id === id)!.tarieven.tm3x25.bedragInclBtw;
  const grens = new Set(cfg.netbeheerders.filter((n) => Math.abs(prijs(n.id) - prijs(cfg.standaard)) >= 5).map((n) => n.id));
  const tabel: PostcodesBestand = { gegenereerdOp: nu, bronnen, standaard: cfg.standaard, ...bouwPostcodes(bereiken, bestaand, cfg.standaard, grens) };
  const controle: Record<string, string> = { "1011AB": "liander", "3511AB": "stedin", "5611AA": "enexis", "2291AA": "westland" };
  for (const [pc, id] of Object.entries(controle)) {
    if (netbeheerderVoor(tabel, pc) !== id) throw new Error(`controle: ${pc} zou ${id} moeten zijn, niet ${netbeheerderVoor(tabel, pc)}`);
  }
  const perId = Object.entries(tabel.postcodes4).map(([id, l]) => `${id} ${l.length}`).join(", ");
  console.log(`postcodes: ${perId}; ${Object.keys(tabel.uitzonderingen).length} uitzonderingen op 6 posities; overige gebieden: ${cfg.standaard}`);
  await schrijfJsonAlsGewijzigd(join(DATA, "netbeheer-postcodes.json"), tabel, 366);
  console.log("netbeheer-postcodes.json geschreven");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
