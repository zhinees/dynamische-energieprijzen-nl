import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { test } from "node:test";
import { extractField, htmlToText, parseEuro } from "../src/lib/extract.ts";
import { loadSupplierConfigs } from "../src/lib/io.ts";
import { buildSupplier } from "../src/lib/tariffs.ts";

const fixture = async (name: string) => htmlToText(await readFile(new URL(`fixtures/${name}.html`, import.meta.url), "utf8"));
const configs = await loadSupplierConfigs();
const cfg = (id: string) => configs.find((c) => c.id === id)!;

test("parseEuro handles Dutch and English notation", () => {
  assert.equal(parseEuro("€ 0,0182"), 0.0182);
  assert.equal(parseEuro("0.0182"), 0.0182);
  assert.equal(parseEuro("1.234,56"), 1234.56);
});

test("htmlToText drops scripts and marks headings", () => {
  const t = htmlToText("<script>opslag € 9,99</script><h2>Gas</h2><p>a&nbsp;&euro;&nbsp;1</p>");
  assert.equal(t, "## Gas ## a € 1");
});

test("cent amounts, before-label amounts and negation", () => {
  const t = "Inkoop 1,82 cent per kWh. € 5,99 vaste kosten. Terugleverkosten € 0,02.";
  assert.equal(extractField(t, "electricityMarkup", { labels: ["inkoop"], range: [0, 0.1] }).value, 0.0182);
  assert.equal(extractField(t, "electricityFixedMonthly", { labels: ["vaste kosten"], range: [1, 20], before: true }).value, 5.99);
  assert.equal(extractField(t, "feedInDelta", { labels: ["terugleverkosten"], range: [-0.1, 0], negate: true }).value, -0.02);
});

test("out-of-range amounts are skipped, not stored", () => {
  const r = extractField("opslag € 7,25 per maand", "electricityMarkup", { labels: ["opslag"], range: [0, 0.1] });
  assert.equal(r.ok, false);
  assert.deepEqual(r.rejected, [7.25]);
});

const ex = (n: number) => Math.round((n / 1.21) * 1e6) / 1e6;

test("Tibber config reads all five tariffs (incl. btw -> excl.)", async () => {
  const url = cfg("tibber").tariffUrl;
  const rec = buildSupplier(cfg("tibber"), new Map([[url, await fixture("tibber")]]), undefined, "2026-09-24T05:00:00Z");
  const v = Object.fromEntries(Object.entries(rec.tariffs).map(([k, x]) => [k, [x!.value, x!.source]]));
  assert.deepEqual(v, {
    electricityFixedMonthly: [ex(6.99), "scraped"],
    electricityMarkup: [ex(0.018), "scraped"],
    gasFixedMonthly: [ex(5.99), "scraped"],
    gasMarkup: [ex(0.08835), "scraped"],
    feedInDelta: [ex(-0.018), "scraped"],
  });
});

test("NextEnergy config reads cents and the 'before' fixed cost", async () => {
  const url = cfg("nextenergy").tariffUrl;
  const rec = buildSupplier(cfg("nextenergy"), new Map([[url, await fixture("nextenergy")]]), undefined, "2026-09-24T05:00:00Z");
  assert.equal(rec.tariffs.electricityMarkup?.value, ex(0.021));
  assert.equal(rec.tariffs.gasMarkup?.value, ex(0.079));
  assert.equal(rec.tariffs.electricityFixedMonthly?.value, ex(5.99));
  assert.equal(rec.tariffs.feedInDelta?.source, "manual"); // no rule, "geen terugleverkosten"
  assert.equal(rec.tariffs.feedInDelta?.value, 0);
});

test("ANWB config takes the announced new gas price, stroom markup scraped", async () => {
  const url = cfg("anwb").tariffUrl;
  const rec = buildSupplier(cfg("anwb"), new Map([[url, await fixture("anwb")]]), undefined, "2026-09-24T05:00:00Z");
  assert.equal(rec.tariffs.electricityMarkup?.value, ex(0.018));
  assert.equal(rec.tariffs.gasMarkup?.value, ex(0.0768));
  assert.equal(rec.tariffs.electricityFixedMonthly?.verified, false); // from the community table
});

test("ANWB gas falls back to the second rule when the 'vanaf' note is gone", () => {
  const t = "## Wat zijn de inkoopkosten? ## De inkoopkosten bedragen € 0,018 per kWh en € 0,0768 per kuub gas (incl. btw).";
  const url = cfg("anwb").tariffUrl;
  const rec = buildSupplier(cfg("anwb"), new Map([[url, t]]), undefined, "2026-10-01T05:00:00Z");
  assert.equal(rec.tariffs.gasMarkup?.value, ex(0.0768));
  assert.equal(rec.tariffs.gasMarkup?.source, "scraped");
});

test("Vattenfall '€ 0 per kWh' verkoopvergoeding reads as 0", async () => {
  const url = cfg("vattenfall").tariffUrl;
  const rec = buildSupplier(cfg("vattenfall"), new Map([[url, await fixture("vattenfall")]]), undefined, "2026-09-24T05:00:00Z");
  assert.equal(rec.tariffs.feedInDelta?.value, 0);
  assert.equal(rec.tariffs.feedInDelta?.source, "scraped");
});
