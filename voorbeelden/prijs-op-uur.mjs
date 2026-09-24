// Print today's market price at a given hour and each supplier's afname/teruglevering price.
//   node voorbeelden/prijs-op-uur.mjs 18
//   DATA_BASIS=./data node voorbeelden/prijs-op-uur.mjs 18   # use a local checkout
import { readFile } from "node:fs/promises";

const BASIS = process.env.DATA_BASIS ?? "https://raw.githubusercontent.com/zhinees/dynamische-energieprijzen-nl/main/data";
const uur = Number(process.argv[2] ?? 18);

const haal = async (pad) =>
  BASIS.startsWith("http") ? (await fetch(`${BASIS}/${pad}`)).json() : JSON.parse(await readFile(`${BASIS}/${pad}`, "utf8"));

const vergelijking = await haal("vergelijking/actueel.json");
const dag = vergelijking.vandaag;
if (!dag) throw new Error("Nog geen prijzen voor vandaag");

// `start` is local Amsterdam time, e.g. 2026-09-24T18:00:00+02:00
const slot = dag.uren.find((u) => Number(u.start.slice(11, 13)) === uur);
if (!slot) throw new Error(`Geen prijs voor ${uur}:00`);

const eur = (n) => (n === null ? "   n.b." : `€ ${n.toFixed(4)}`);
console.log(`${dag.datum} ${String(uur).padStart(2, "0")}:00 marktprijs: ${eur(slot.markt)} /kWh (excl. btw)\n`);
console.log("leverancier".padEnd(32), "afname /kWh".padEnd(12), "teruglevering /kWh");
const rijen = dag.leveranciers
  .map((l) => ({ ...l, afname: slot.afname[l.id], teruglevering: slot.teruglevering[l.id] }))
  .sort((a, b) => (a.afname ?? 9) - (b.afname ?? 9));
for (const l of rijen) {
  console.log(l.naam.padEnd(32), eur(l.afname).padEnd(12), eur(l.teruglevering));
}
console.log("\nn.b. = de leverancier publiceert deze waarde niet op een plek waar we hem kunnen controleren");
