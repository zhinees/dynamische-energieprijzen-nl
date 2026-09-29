import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { test } from "node:test";
import { bouwBatterijmodellen, type BatterijmodellenConfig } from "../src/lib/batterijmodellen.ts";

const cfg = JSON.parse(await readFile(new URL("../thuisbatterijen/modellen.json", import.meta.url), "utf8")) as BatterijmodellenConfig;

test("rekent bruikbaar aandeel en één vermogen uit", () => {
  const b = bouwBatterijmodellen(cfg, "2026-09-29T00:00:00.000Z");
  const sessy = b.modellen.find((m) => m.id === "sessy-5")!;
  assert.equal(sessy.bruikbaarAandeel, 1);
  assert.equal(sessy.vermogenKw, 1.7); // het laagste van laden (2,2) en ontladen (1,7)
  const tesla = b.modellen.find((m) => m.id === "tesla-powerwall-3")!;
  assert.equal(tesla.vermogenKw, 11.04); // laden onbekend: alleen ontladen
  const sigen = b.modellen.find((m) => m.id === "sigenergy-sigenstor-bat-10")!;
  assert.equal(sigen.bruikbaarAandeel, 0.876);
  assert.equal(b.gegenereerdOp, "2026-09-29T00:00:00.000Z");
});

test("weigert onmogelijke gegevens", () => {
  const met = (wijzig: (c: BatterijmodellenConfig) => void) => {
    const c = structuredClone(cfg);
    wijzig(c);
    return () => bouwBatterijmodellen(c, "2026-09-29T00:00:00.000Z");
  };
  assert.throws(met((c) => { c.modellen[0].bruikbaarKwh = c.modellen[0].capaciteitKwh + 1; }), /bruikbare capaciteit/);
  assert.throws(met((c) => { c.modellen.push({ ...c.modellen[0] }); }), /twee keer/);
  assert.throws(met((c) => { c.modellen[0].laadKw = 0; }), /laadKw/);
  assert.throws(met((c) => { c.modellen[0].bronnen = []; }), /bron/);
});
