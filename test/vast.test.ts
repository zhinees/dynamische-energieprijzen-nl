import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { test } from "node:test";
import { bouwVast, leesCbs, type CbsRij } from "../src/lib/vast.ts";

const rijen = (JSON.parse(await readFile(new URL("./fixtures/cbs-85592NED.json", import.meta.url), "utf8")) as { value: CbsRij[] }).value;

test("leest de maanden incl. btw, zonder het jaartotaal", () => {
  const m = leesCbs(rijen);
  assert.ok(m.length > 0);
  assert.ok(m.every((x) => /^\d{4}-\d{2}$/.test(x.maand)));
  const aug = m.find((x) => x.maand === "2026-08")!;
  assert.equal(aug.leveringPerKwh, 0.1469);
  assert.equal(aug.totaalPerKwh, 0.2578);
  assert.equal(aug.vastPerMaand, 9.55);
});

test("laatste maand en hoogstens twaalf maanden", () => {
  const extra = [...rijen, { ...rijen[0], Perioden: "2026JJ00" }, { ...rijen[0], Btw: "A048945" }];
  const b = bouwVast(leesCbs(extra), "2026-10-01T00:00:00.000Z");
  assert.equal(b.laatste.maand, b.maanden[b.maanden.length - 1].maand);
  assert.ok(b.maanden.length <= 12);
});

test("weigert onmogelijke waarden", () => {
  assert.throws(() => bouwVast([], "x"), /geen maanden/);
  const m = leesCbs(rijen);
  assert.throws(() => bouwVast([{ ...m[0], leveringPerKwh: 15 }], "x"), /onmogelijk/);
});
