// Combine this repo's tariffs with a market price you fetch yourself: what a kWh costs per
// supplier at a given hour today, incl. btw and energy tax (no grid costs).
//   node voorbeelden/prijs-op-uur.mjs 18
//   DATA_BASIS=./data node voorbeelden/prijs-op-uur.mjs 18   # use a local checkout
import { readFile } from "node:fs/promises";

const BASIS = process.env.DATA_BASIS ?? "https://raw.githubusercontent.com/zhinees/dynamische-energieprijzen-nl/main/data";
const uur = Number(process.argv[2] ?? 18);

const haal = async (pad) =>
  BASIS.startsWith("http") ? (await fetch(`${BASIS}/${pad}`)).json() : JSON.parse(await readFile(`${BASIS}/${pad}`, "utf8"));

// 1. Market price for that hour today, straight from EnergyZero (excl. btw).
const vandaag = new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Amsterdam" }).format(new Date());
const url = new URL("https://api.energyzero.nl/v1/energyprices");
const dag = new Date(`${vandaag}T12:00:00Z`);
url.search = new URLSearchParams({
  // A UTC window around the local day; the exact hour is picked below in Amsterdam time.
  fromDate: new Date(dag.getTime() - 36 * 3_600_000).toISOString(),
  tillDate: new Date(dag.getTime() + 36 * 3_600_000).toISOString(),
  interval: "4",
  usageType: "1",
  inclBtw: "false",
}).toString();
const { Prices } = await (await fetch(url)).json();
const lokaal = (d) =>
  new Intl.DateTimeFormat("sv-SE", { timeZone: "Europe/Amsterdam", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", hourCycle: "h23" }).format(new Date(d));
const punt = Prices.find((p) => lokaal(p.readingDate) === `${vandaag} ${String(uur).padStart(2, "0")}`);
if (!punt) throw new Error(`Geen marktprijs voor ${uur}:00`);
const marktInclBtw = punt.price * 1.21;

// 2. Tariffs and energy tax from this repo, incl. btw.
const { leveranciers } = await haal("leveranciers.json");
const { jaren } = await haal("energiebelasting.json");
const eb = jaren[vandaag.slice(0, 4)]?.stroomPerKwh.bedragInclBtw ?? null;

const eur = (n) => (n === null || n === undefined ? "   n.b." : `€ ${n.toFixed(4)}`);
console.log(`${vandaag} ${String(uur).padStart(2, "0")}:00 marktprijs: ${eur(marktInclBtw)} /kWh, energiebelasting: ${eur(eb)} /kWh (incl. btw)\n`);
console.log("leverancier".padEnd(32), "afname /kWh".padEnd(12), "teruglevering /kWh");
const rijen = leveranciers
  .map((l) => {
    const opslag = l.tarieven.stroomInkoopopslag?.bedragInclBtw;
    const correctie = l.tarieven.terugleverCorrectie?.bedragInclBtw;
    return {
      naam: l.naam,
      afname: opslag == null || eb === null ? null : marktInclBtw + opslag + eb,
      teruglevering: correctie == null ? null : marktInclBtw + correctie,
    };
  })
  .sort((a, b) => (a.afname ?? 9) - (b.afname ?? 9));
for (const r of rijen) console.log(r.naam.padEnd(32), eur(r.afname).padEnd(12), eur(r.teruglevering));
console.log("\nAfname = marktprijs + inkoopopslag + energiebelasting. Alles incl. btw, zonder netbeheerkosten.");
console.log("n.b. = de leverancier publiceert deze waarde (incl. btw) niet op een plek waar we hem kunnen controleren");
