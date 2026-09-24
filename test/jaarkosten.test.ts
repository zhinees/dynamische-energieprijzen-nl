import assert from "node:assert/strict";
import { test } from "node:test";
import {
  berekenOmslagpunten,
  berekenTerugleveromslag,
  goedkoopstePerVerbruik,
  leverancierdelen,
  productkosten,
} from "../src/lib/jaarkosten.ts";
import type { Leverancier, Tariefwaarde, Veld } from "../src/lib/typen.ts";

const waarde = (bedragInclBtw: number): Tariefwaarde => ({
  bedragInclBtw,
  bedragExclBtw: bedragInclBtw / 1.21,
  eenheid: "EUR/kWh",
  bron: "handmatig",
  geverifieerd: true,
  sinds: "2026-09-24T00:00:00Z",
  bronUrl: null,
});
const leverancier = (id: string, t: Partial<Record<Veld, number>>): Leverancier => ({
  id,
  naam: id.toUpperCase(),
  website: "https://x.nl",
  tariefUrl: "https://x.nl",
  producten: { stroom: true, gas: true },
  kenmerken: { automatischAfschakelen: null },
  tarieven: Object.fromEntries(Object.entries(t).map(([k, v]) => [k, waarde(v)])),
  laatstUitgevoerd: "2026-09-24T00:00:00Z",
});

// A: cheap fixed costs, high markup. B: expensive fixed costs, low markup.
// Stroom: A = 60 + 0.03x, B = 84 + 0.02x per year  ->  equal at 2.400 kWh.
const A = leverancier("a", { stroomVastPerMaand: 5, stroomInkoopopslag: 0.03, gasVastPerMaand: 5, gasInkoopopslag: 0.1, terugleverCorrectie: -0.02 });
const B = leverancier("b", { stroomVastPerMaand: 7, stroomInkoopopslag: 0.02, gasVastPerMaand: 7, gasInkoopopslag: 0.06, terugleverCorrectie: 0.01 });
const C = leverancier("c", { stroomInkoopopslag: 0.01 }); // no fixed costs published

test("omslagpunt: grootste verschil in vaste kosten gedeeld door grootste verschil in opslag", () => {
  const o = berekenOmslagpunten(productkosten([A, B], "stroom"));
  assert.equal(o.omslagpunt, 2400); // (84 - 60) / (0.03 - 0.02)
  assert.deepEqual(o.vastPerJaar, { min: 60, max: 84 });
  assert.deepEqual(o.paren, [{ lageVasteKosten: "a", lageOpslag: "b", omslagpunt: 2400 }]);
  assert.equal(berekenOmslagpunten(productkosten([A, B], "gas")).omslagpunt, 600); // 24 / 0.04
});

test("goedkoopste per verbruik wisselt precies op het omslagpunt", () => {
  const t = goedkoopstePerVerbruik(productkosten([A, B], "stroom"));
  assert.deepEqual(
    t.map(({ vanaf, tot, id }) => ({ vanaf, tot, id })),
    [
      { vanaf: 0, tot: 2400, id: "a" },
      { vanaf: 2400, tot: null, id: "b" },
    ],
  );
});

test("een leverancier die overal duurder is, komt nooit als goedkoopste voor", () => {
  const D = leverancier("d", { stroomVastPerMaand: 8, stroomInkoopopslag: 0.04 });
  const t = goedkoopstePerVerbruik(productkosten([A, B, D], "stroom"));
  assert.ok(t.every((x) => x.id !== "d"));
});

test("leveranciers zonder vaste kosten tellen niet mee in de omslagpunten", () => {
  assert.deepEqual(productkosten([A, C], "stroom").map((p) => p.id), ["a"]);
});

test("teruglevering verschuift het omslagpunt: de correctie telt als vast bedrag per jaar", () => {
  // With 1.000 kWh fed back: A = 60 + 20 + 0.03x, B = 84 - 10 + 0.02x  ->  B already cheaper from 0 kWh.
  const t = goedkoopstePerVerbruik(productkosten([A, B], "stroom", 1000));
  assert.deepEqual(t.map((x) => x.id), ["b"]);
  // With 400 kWh: A = 68 + 0.03x, B = 80 + 0.02x  ->  equal at 1.200 kWh instead of 2.400.
  assert.equal(goedkoopstePerVerbruik(productkosten([A, B], "stroom", 400))[0].tot, 1200);
});

test("omslagpunt voor teruglevering: verschil in vaste kosten gedeeld door verschil in correctie", () => {
  const r = berekenTerugleveromslag([A, B]);
  assert.deepEqual(r.correctie, { min: -0.02, max: 0.01 });
  assert.equal(r.omslagpunt, 800); // 24 / 0.03
  assert.deepEqual(r.scenarios.map((s) => s.teruglevering), [1000, 2000, 4000]);
});

test("rekenhulp: leveranciersdeel per jaar, goedkoopste eerst, onvolledige achteraan", () => {
  const d = leverancierdelen([A, B, C], { stroom: 3000, gas: 1000, teruglevering: 0 });
  assert.deepEqual(d.map((x) => [x.id, x.totaal]), [
    ["b", 168 + 60 + 60], // vast (7 + 7) x 12, 3000 x 0.02, 1000 x 0.06
    ["a", 120 + 90 + 100],
    ["c", null],
  ]);
  assert.deepEqual(d[2].ontbreekt, ["stroomVastPerMaand", "gasVastPerMaand", "gasInkoopopslag"]);
});

test("rekenhulp: terugleverkosten tellen als kosten, een bonus als korting", () => {
  const [b, a] = leverancierdelen([A, B], { stroom: 1000, gas: 0, teruglevering: 2000 });
  assert.equal(a.teruglevering, -40); // 2000 x -0.02
  assert.equal(a.totaal, 60 + 30 + 40);
  assert.equal(b.teruglevering, 20); // 2000 x 0.01 bonus
  assert.equal(b.totaal, 84 + 20 - 20);
});
