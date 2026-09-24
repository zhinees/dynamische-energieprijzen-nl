import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { test } from "node:test";
import { bouwEnergiebelasting, leesEnergiebelasting } from "../src/lib/energiebelasting.ts";
import { htmlNaarTekst } from "../src/lib/uitlezen.ts";
import type { EnergiebelastingConfig } from "../src/lib/typen.ts";

// Page of the Belastingdienst captured on 2026-09-24 (scripts and styles removed).
const pagina = htmlNaarTekst(await readFile(new URL("fixtures/belastingdienst-energiebelasting-2026-09-24.html", import.meta.url), "utf8"));
const cfg = JSON.parse(await readFile(new URL("../belastingen/energiebelasting.json", import.meta.url), "utf8")) as EnergiebelastingConfig;

test("leest de huishoudtarieven per jaar uit de tabellen van de Belastingdienst", () => {
  const jaren = leesEnergiebelasting(pagina);
  assert.deepEqual([...jaren.keys()], [2023, 2024, 2025, 2026]); // before 2023 the ODE was separate
  assert.deepEqual(jaren.get(2026), { stroomPerKwh: 0.09161, gasPerM3: 0.60066, verminderingPerAansluitingPerJaar: 519.8 });
  assert.deepEqual(jaren.get(2025), { stroomPerKwh: 0.10154, gasPerM3: 0.57816, verminderingPerAansluitingPerJaar: 524.95 });
});

test("de handmatige waarden voor 2026 kloppen met de pagina", () => {
  const h = cfg.handmatig["2026"];
  assert.deepEqual(leesEnergiebelasting(pagina).get(2026), {
    stroomPerKwh: h.stroomPerKwh,
    gasPerM3: h.gasPerM3,
    verminderingPerAansluitingPerJaar: h.verminderingPerAansluitingPerJaar,
  });
});

test("faalt duidelijk als een tabel ontbreekt of een bedrag vreemd is", () => {
  assert.throws(() => leesEnergiebelasting("## Iets anders ## 2026 € 1,00"), /niet gevonden/);
  const raar = pagina.replace("2026 € 0,09161", "2026 € 9,16100");
  assert.throws(() => leesEnergiebelasting(raar), /buiten het verwachte bereik/);
});

test("bedragen worden incl. en excl. btw gepubliceerd", () => {
  const b = bouwEnergiebelasting(cfg, leesEnergiebelasting(pagina), undefined, "2026-09-24T04:17:00Z");
  assert.deepEqual(b.jaren["2026"].stroomPerKwh, { bedragInclBtw: 0.110848, bedragExclBtw: 0.09161 });
  assert.deepEqual(b.jaren["2026"].gasPerM3, { bedragInclBtw: 0.726799, bedragExclBtw: 0.60066 });
  assert.equal(b.jaren["2026"].bron, "website");
});

test("als de pagina niet te lezen is, blijven de laatst gelezen waarden staan en wordt de fout gemeld", () => {
  const eerst = bouwEnergiebelasting(cfg, leesEnergiebelasting(pagina), undefined, "2026-09-24T04:17:00Z");
  const mislukt = bouwEnergiebelasting(cfg, undefined, eerst, "2026-10-01T04:17:00Z", "HTTP 503");
  assert.equal(mislukt.jaren["2025"].bron, "website");
  assert.equal(mislukt.jaren["2026"].sinds, "2026-09-24T04:17:00Z");
  assert.equal(mislukt.ophaalfout, "HTTP 503");
});

test("zonder eerdere gegevens valt het terug op de handmatige waarden", () => {
  const b = bouwEnergiebelasting(cfg, undefined, undefined, "2026-09-24T04:17:00Z", "HTTP 503");
  assert.deepEqual(Object.keys(b.jaren), ["2026"]);
  assert.equal(b.jaren["2026"].bron, "handmatig");
});

test("'sinds' blijft staan zolang de tarieven niet veranderen", () => {
  const eerst = bouwEnergiebelasting(cfg, leesEnergiebelasting(pagina), undefined, "2026-09-24T04:17:00Z");
  const later = bouwEnergiebelasting(cfg, leesEnergiebelasting(pagina), eerst, "2026-10-05T04:17:00Z");
  assert.equal(later.jaren["2026"].sinds, "2026-09-24T04:17:00Z");
  assert.equal(later.jaren["2026"].laatstGecontroleerd, "2026-10-05T04:17:00Z");
});
