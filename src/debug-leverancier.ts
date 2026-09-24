// Show what the scraper reads for one supplier. Use this while writing rules.
//
//   node src/debug-leverancier.ts tibber                    # fetch the live page
//   node src/debug-leverancier.ts tibber --bestand page.html  # use a saved copy
//   node src/debug-leverancier.ts tibber --tekst            # also print the page text
//   node src/debug-leverancier.ts tibber --zoek inkoop      # print text around a word

import { readFile } from "node:fs/promises";
import { htmlNaarTekst, leesVeld } from "./lib/uitlezen.ts";
import { sluitBrowser, haalPaginaTekst } from "./lib/pagina-ophalen.ts";
import { laadLeverancierConfigs } from "./lib/bestanden.ts";
import { exclBtw, regelsVoor } from "./lib/tarieven.ts";
import { VELDEN } from "./lib/typen.ts";

const args = process.argv.slice(2);
const id = args[0];
const optie = (naam: string) => {
  const i = args.indexOf(naam);
  return i === -1 ? undefined : args[i + 1] ?? "";
};

const configs = await laadLeverancierConfigs();
const cfg = configs.find((c) => c.id === id);
if (!cfg) {
  console.error(`Gebruik: node src/debug-leverancier.ts <id> [--bestand pagina.html] [--tekst] [--zoek woord]\nIds: ${configs.map((c) => c.id).join(", ")}`);
  process.exit(1);
}

const bestand = optie("--bestand");
const tekst = bestand ? htmlNaarTekst(await readFile(bestand, "utf8")) : await haalPaginaTekst(cfg.tariefUrl, cfg.ophalen ?? "http");
await sluitBrowser();

console.log(`${cfg.naam} — ${bestand ?? cfg.tariefUrl}`);
console.log(`paginatekst: ${tekst.length} tekens${!bestand && tekst.length < 2000 ? "  (erg weinig tekst: waarschijnlijk door JavaScript opgebouwd, probeer \"ophalen\": \"browser\")" : ""}\n`);

for (const veld of VELDEN) {
  const regels = regelsVoor(cfg, veld);
  if (!regels.length) {
    const h = cfg.handmatig[veld];
    console.log(`${veld}: geen regel${h ? `, handmatig ${h.waarde}${h.inclBtw ? " incl. btw" : ""} (gecontroleerd ${h.gecontroleerdOp})` : ""}`);
    continue;
  }
  regels.forEach((regel, i) => {
    if (regel.url && regel.url !== cfg.tariefUrl) {
      console.log(`${veld} [regel ${i}]: gebruikt andere url ${regel.url} (hier niet opgehaald)`);
      return;
    }
    const r = leesVeld(tekst, veld, regel);
    const getoond = r.ok && regel.inclBtw ? `${r.waarde} incl. btw → ${exclBtw(r.waarde!)} excl.` : String(r.waarde);
    console.log(`${veld} [regel ${i}]: ${r.ok ? "OK " + getoond : "MISLUKT " + r.reden}`);
    if (r.context) console.log(`   …${r.context}…`);
    if (r.afgewezen) console.log(`   afgewezen (buiten bereik ${JSON.stringify(regel.bereik)}): ${r.afgewezen.join(", ")}`);
  });
}

const zoek = optie("--zoek");
if (zoek) {
  console.log(`\n--- voorkomens van "${zoek}" ---`);
  const re = new RegExp(zoek, "gi");
  let m: RegExpExecArray | null;
  let n = 0;
  while ((m = re.exec(tekst)) && n++ < 20) console.log(`…${tekst.slice(Math.max(0, m.index - 80), m.index + 160)}…\n`);
}
if (args.includes("--tekst")) console.log(`\n--- paginatekst ---\n${tekst}`);
