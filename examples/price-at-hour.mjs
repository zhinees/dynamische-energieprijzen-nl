// Print today's market price at a given hour and each supplier's buy/sell price.
//   node examples/price-at-hour.mjs 18
//   DATA_BASE=./data node examples/price-at-hour.mjs 18   # use a local checkout
import { readFile } from "node:fs/promises";

const BASE = process.env.DATA_BASE ?? "https://raw.githubusercontent.com/OWNER/dynamische-energieprijzen-nl/main/data";
const hour = Number(process.argv[2] ?? 18);

const get = async (path) =>
  BASE.startsWith("http") ? (await fetch(`${BASE}/${path}`)).json() : JSON.parse(await readFile(`${BASE}/${path}`, "utf8"));

const compare = await get("compare/latest.json");
const day = compare.today;
if (!day) throw new Error("No prices for today yet");

// `start` is local Amsterdam time, e.g. 2026-09-24T18:00:00+02:00
const slot = day.hours.find((h) => Number(h.start.slice(11, 13)) === hour);
if (!slot) throw new Error(`No price for ${hour}:00`);

const eur = (n) => (n === null ? "   n/a" : `€ ${n.toFixed(4)}`);
console.log(`${day.date} ${String(hour).padStart(2, "0")}:00 market price: ${eur(slot.market)} /kWh (excl. btw)\n`);
console.log("supplier".padEnd(32), "buy /kWh".padEnd(10), "sell /kWh");
const rows = day.suppliers
  .map((s) => ({ ...s, buy: slot.buy[s.id], sell: slot.sell[s.id] }))
  .sort((a, b) => (a.buy ?? 9) - (b.buy ?? 9));
for (const s of rows) {
  console.log(`${s.name}${s.verified ? "" : " *"}`.padEnd(32), eur(s.buy).padEnd(10), eur(s.sell));
}
console.log("\n* includes values not yet confirmed on the supplier's own site");
