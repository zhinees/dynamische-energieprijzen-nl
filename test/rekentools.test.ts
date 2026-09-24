import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { test } from "node:test";
import { haalFrank, leesFrank } from "../src/rekentools/frank.ts";
import { laadLeverancierConfigs } from "../src/lib/bestanden.ts";
import { bouwLeverancier } from "../src/lib/tarieven.ts";

// Real response captured from Frank's calculator on 2026-09-24 (Madurodam test address).
const fixture = JSON.parse(await readFile(new URL("fixtures/frank-simulate-2026-09-24.json", import.meta.url), "utf8"));
const frank = (await laadLeverancierConfigs()).find((c) => c.id === "frank")!;

test("leesFrank pakt alleen Franks eigen tariefregels", () => {
  const r = leesFrank(fixture.data);
  assert.deepEqual(Object.keys(r).sort(), ["gasInkoopopslag", "gasVastPerMaand", "stroomInkoopopslag", "stroomVastPerMaand", "terugleverCorrectie"]);
  assert.equal(r.stroomInkoopopslag?.waarde, 0.01815);
  assert.equal(r.gasInkoopopslag?.waarde, 0.07986);
  assert.equal(r.terugleverCorrectie?.waarde, -0.012705);
  assert.ok(Object.values(r).every((v) => v!.inclBtw));
});

test("rekentoolwaarden worden excl. btw, bron 'rekentool'", () => {
  const rec = bouwLeverancier(frank, new Map(), undefined, "2026-09-24T04:17:00Z", [], leesFrank(fixture.data));
  const t = rec.tarieven;
  assert.equal(t.stroomInkoopopslag?.bedragExclBtw, 0.015);
  assert.equal(t.gasInkoopopslag?.bedragExclBtw, 0.066);
  assert.equal(t.terugleverCorrectie?.bedragExclBtw, -0.0105);
  assert.equal(t.stroomVastPerMaand?.bedragExclBtw, 5.785124);
  assert.equal(t.stroomInkoopopslag?.bron, "rekentool");
  assert.equal(t.stroomInkoopopslag?.geverifieerd, true);
});

test("als de rekentool faalt, vallen we terug op handmatige waarden en melden we dat", () => {
  const rec = bouwLeverancier(frank, new Map(), undefined, "2026-09-24T04:17:00Z", ["rekentool: HTTP 503"], {});
  assert.equal(rec.tarieven.stroomInkoopopslag?.bron, "handmatig");
  assert.equal(rec.tarieven.stroomInkoopopslag?.bedragExclBtw, 0.015);
  assert.equal(rec.tarieven.stroomInkoopopslag?.laatsteFout, "rekentool gaf geen waarde");
  assert.equal(rec.ophaalfout, "rekentool: HTTP 503");
});

test("haalFrank: adres -> EAN's -> simulatie (netwerk nagebootst)", async () => {
  const aanroepen: any[] = [];
  const echteFetch = globalThis.fetch;
  globalThis.fetch = (async (_url: any, init: any) => {
    const body = JSON.parse(init.body);
    aanroepen.push(body);
    const json = body.query.includes("SignupMeteringPoints")
      ? { data: { signupMeteringPoints: { status: "ANSWERED", meteringPoints: [{ ean: body.variables.input.segment === "GAS" ? "GAS-EAN" : "EL-EAN" }] } } }
      : fixture;
    return new Response(JSON.stringify(json), { headers: { "content-type": "application/json" } });
  }) as typeof fetch;
  try {
    const r = await haalFrank(frank.rekentool!.testadres);
    assert.equal(r.stroomInkoopopslag?.waarde, 0.01815);
  } finally {
    globalThis.fetch = echteFetch;
  }
  assert.equal(aanroepen.length, 3);
  const sim = aanroepen.find((c) => c.query.includes("SignupSimulatePrice")).variables.input;
  assert.equal(sim.electricityEAN, "EL-EAN");
  assert.equal(sim.gasEAN, "GAS-EAN");
  assert.equal(sim.zipCode, "2584RZ");
  assert.equal(sim.electricityPropositionType, "dynamic");
});

// ---- Vandebron (real response captured 2026-09-24) ----
import { haalVandebron, leesVandebron, startdatumVoor } from "../src/rekentools/vandebron.ts";
import { haalBudget, leesBudget, RESELLER_ID } from "../src/rekentools/budget.ts";

const vdb = JSON.parse(await readFile(new URL("fixtures/vandebron-pricebreakdown-2026-09-24.json", import.meta.url), "utf8"));
const bt = JSON.parse(await readFile(new URL("fixtures/budget-online-offers-2026-09-24.json", import.meta.url), "utf8"));
const testadres = { postcode: "2584RZ", huisnummer: 1, plaats: "X", omschrijving: "test" };

test("leesVandebron leest de dynamische opslagen excl. btw", () => {
  const r = leesVandebron(vdb);
  assert.equal(r.stroomInkoopopslag?.waarde, 0.01825);
  assert.equal(r.gasInkoopopslag?.waarde, 0.04945);
  assert.equal(r.terugleverCorrectie?.waarde, -0.01125);
  assert.equal(r.stroomVastPerMaand?.waarde, 5.781296); // 0.19007 per day x 365/12
  assert.ok(Object.values(r).every((v) => v!.inclBtw === false));
});

test("Vandebron-startdatum volgt de website (24 sep -> 1 nov)", () => {
  assert.equal(startdatumVoor("2026-09-24"), "2026-11-01");
  assert.equal(startdatumVoor("2026-12-15"), "2027-02-01");
});

test("haalVandebron: adres -> netbeheerder -> dynamische prijsopbouw (nagebootst)", async () => {
  const aanroepen: { url: string; body?: any }[] = [];
  const echteFetch = globalThis.fetch;
  globalThis.fetch = (async (url: any, init: any) => {
    aanroepen.push({ url: String(url), body: init?.body ? JSON.parse(init.body) : undefined });
    const json = String(url).includes("/validate/edsn/address")
      ? { electricityGridOperatorEan: "8716892000005", gasGridOperatorEan: "8716892000005" }
      : vdb;
    return new Response(JSON.stringify(json), { headers: { "content-type": "application/json" } });
  }) as typeof fetch;
  try {
    const r = await haalVandebron(testadres);
    assert.equal(r.stroomInkoopopslag?.waarde, 0.01825);
  } finally {
    globalThis.fetch = echteFetch;
  }
  assert.equal(aanroepen.length, 2);
  assert.match(aanroepen[0].url, /zipcode=2584RZ/);
  assert.equal(aanroepen[1].body.electricity.contractDuration.durationType, "MarketPriceVariable");
  assert.equal(aanroepen[1].body.electricity.gridOperatorEan, "8716892000005");
});

// ---- Budget Thuis (real response captured 2026-09-24, trimmed) ----

test("leesBudget kiest de dynamische propositie, excl. btw", () => {
  const r = leesBudget(bt);
  assert.equal(r.stroomInkoopopslag?.waarde, 0.0139);
  assert.equal(r.gasInkoopopslag?.waarde, 0.053);
  assert.equal(r.stroomVastPerMaand?.waarde, 4.95);
  assert.equal(r.gasVastPerMaand?.waarde, 4.95);
  assert.equal(r.terugleverCorrectie?.waarde, 0);
});

test("leesBudget faalt duidelijk als er geen dynamische propositie is", () => {
  assert.throws(() => leesBudget({ salesChannels: [{ offers: [] }] }), /geen dynamische propositie/);
});

test("haalBudget stuurt het testadres en verbruik mee (nagebootst)", async () => {
  let verstuurd: any;
  const echteFetch = globalThis.fetch;
  globalThis.fetch = (async (_url: any, init: any) => {
    verstuurd = JSON.parse(init.body);
    return new Response(JSON.stringify(bt), { headers: { "content-type": "application/json" } });
  }) as typeof fetch;
  try {
    const r = await haalBudget(testadres);
    assert.equal(r.stroomInkoopopslag?.waarde, 0.0139);
  } finally {
    globalThis.fetch = echteFetch;
  }
  assert.equal(verstuurd.resellerId, RESELLER_ID);
  assert.deepEqual(verstuurd.address, { postalCode: "2584RZ", houseNumber: 1, extension: "" });
});

test("adapters bewaren de exacte bedragen incl. btw uit de API", () => {
  const v = leesVandebron(vdb);
  assert.equal(v.stroomInkoopopslag?.waardeInclBtw, 0.02208);
  assert.equal(v.terugleverCorrectie?.waardeInclBtw, -0.01361);
  const b = leesBudget(bt);
  assert.equal(b.stroomInkoopopslag?.waardeInclBtw, 0.01682);
  const rec = bouwLeverancier(frank, new Map(), undefined, "2026-09-24T04:17:00Z", [], b);
  assert.equal(rec.tarieven.stroomInkoopopslag?.bedragExclBtw, 0.0139);
  assert.equal(rec.tarieven.stroomInkoopopslag?.bedragInclBtw, 0.01682);
});
