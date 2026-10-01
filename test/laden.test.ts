import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { test } from "node:test";
import { bouwLaden, type LadenConfig } from "../src/lib/laden.ts";

const cfg = JSON.parse(await readFile(new URL("../laden/laden.json", import.meta.url), "utf8")) as LadenConfig;

test("neemt ERE en laadpaal over, met de datum", () => {
  const b = bouwLaden(cfg, "2026-10-01T00:00:00.000Z");
  assert.equal(b.gegenereerdOp, "2026-10-01T00:00:00.000Z");
  assert.equal(b.valuta, "EUR");
  assert.ok(b.ere.perKwh.richtwaarde >= b.ere.perKwh.van && b.ere.perKwh.richtwaarde <= b.ere.perKwh.tot);
});

test("weigert onmogelijke waarden", () => {
  const met = (wijzig: (c: LadenConfig) => void) => {
    const c = structuredClone(cfg);
    wijzig(c);
    return () => bouwLaden(c, "2026-10-01T00:00:00.000Z");
  };
  assert.throws(met((c) => { c.ere.perKwh = { richtwaarde: 0.1, van: 0.2, tot: 0.1 }; }), /'van' moet tussen 0 en 'tot'/);
  assert.throws(met((c) => { c.ere.perKwh.richtwaarde = 0.5; }), /binnen de bandbreedte/);
  assert.throws(met((c) => { c.ere.perKwh = { richtwaarde: 10, van: 5, tot: 15 }; }), /euro per kWh/);
  assert.throws(met((c) => { c.laadpaal.prijsInclBtw = { van: 3000, tot: 1000 }; }), /laadpaal/);
  assert.throws(met((c) => { c.ere.bronnen[0].datum = "2099-01-01"; }), /na gecontroleerdOp/);
});
