import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { test } from "node:test";
import { bouwThuisbatterijen, type ThuisbatterijenConfig } from "../src/lib/thuisbatterijen.ts";

const cfg = JSON.parse(await readFile(new URL("../thuisbatterijen/thuisbatterijen.json", import.meta.url), "utf8")) as ThuisbatterijenConfig;

test("rekent de prijs per kWh uit en sorteert per type en capaciteit", () => {
  const b = bouwThuisbatterijen(cfg, "2026-09-28T00:00:00.000Z");
  const vast10 = b.prijzen.find((p) => p.type === "vast" && p.capaciteitKwh === 10)!;
  assert.deepEqual(vast10.prijsPerKwhInclBtw, { van: vast10.prijsInclBtw.van / 10, tot: vast10.prijsInclBtw.tot / 10 });
  assert.deepEqual(b.prijzen.map((p) => `${p.type} ${p.capaciteitKwh}`), [...b.prijzen].sort((x, y) => x.type.localeCompare(y.type) || x.capaciteitKwh - y.capaciteitKwh).map((p) => `${p.type} ${p.capaciteitKwh}`));
  assert.equal(b.gegenereerdOp, "2026-09-28T00:00:00.000Z");
});

test("weigert onmogelijke prijzen", () => {
  const met = (wijzig: (c: ThuisbatterijenConfig) => void) => {
    const c = structuredClone(cfg);
    wijzig(c);
    return () => bouwThuisbatterijen(c, "2026-09-28T00:00:00.000Z");
  };
  assert.throws(met((c) => { c.prijzen[0].prijsInclBtw = { van: 5000, tot: 4000 }; }), /'van' moet tussen 0 en 'tot'/);
  assert.throws(met((c) => { c.prijzen.find((p) => p.type === "vast" && p.capaciteitKwh === 20)!.prijsInclBtw.van = 100; }), /goedkoper dan/);
  assert.throws(met((c) => { c.prijzen.push({ ...c.prijzen[0] }); }), /twee keer/);
  assert.throws(met((c) => { c.prijzen[0].bronDatum = "2099-01-01"; }), /na gecontroleerdOp/);
});
