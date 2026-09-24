import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { test } from "node:test";
import { fetchFrank, parseFrank } from "../src/calculators/frank.ts";
import { loadSupplierConfigs } from "../src/lib/io.ts";
import { buildSupplier } from "../src/lib/tariffs.ts";

// Real response captured from Frank's calculator on 2026-09-24 (Madurodam test address).
const fixture = JSON.parse(await readFile(new URL("fixtures/frank-simulate-2026-09-24.json", import.meta.url), "utf8"));
const frank = (await loadSupplierConfigs()).find((c) => c.id === "frank")!;

test("parseFrank picks only Frank's own tariff lines", () => {
  const r = parseFrank(fixture.data);
  assert.deepEqual(Object.keys(r).sort(), ["electricityFixedMonthly", "electricityMarkup", "feedInDelta", "gasFixedMonthly", "gasMarkup"]);
  assert.equal(r.electricityMarkup?.value, 0.01815);
  assert.equal(r.gasMarkup?.value, 0.07986);
  assert.equal(r.feedInDelta?.value, -0.012705);
  assert.ok(Object.values(r).every((v) => v!.vatIncluded));
});

test("calculator values become excl. btw, source 'calculator'", () => {
  const rec = buildSupplier(frank, new Map(), undefined, "2026-09-24T04:17:00Z", [], parseFrank(fixture.data));
  const t = rec.tariffs;
  assert.equal(t.electricityMarkup?.value, 0.015);
  assert.equal(t.gasMarkup?.value, 0.066);
  assert.equal(t.feedInDelta?.value, -0.0105);
  assert.equal(t.electricityFixedMonthly?.value, 5.785124);
  assert.equal(t.electricityMarkup?.source, "calculator");
  assert.equal(t.electricityMarkup?.verified, true);
});

test("calculator failure falls back to manual values and flags it", () => {
  const rec = buildSupplier(frank, new Map(), undefined, "2026-09-24T04:17:00Z", ["calculator: HTTP 503"], {});
  assert.equal(rec.tariffs.electricityMarkup?.source, "manual");
  assert.equal(rec.tariffs.electricityMarkup?.value, 0.015);
  assert.equal(rec.tariffs.electricityMarkup?.lastError, "calculator returned no value");
  assert.equal(rec.fetchError, "calculator: HTTP 503");
});

test("fetchFrank: address -> EANs -> simulation (stubbed network)", async () => {
  const calls: any[] = [];
  const realFetch = globalThis.fetch;
  globalThis.fetch = (async (_url: any, init: any) => {
    const body = JSON.parse(init.body);
    calls.push(body);
    const json = body.query.includes("SignupMeteringPoints")
      ? { data: { signupMeteringPoints: { status: "ANSWERED", meteringPoints: [{ ean: body.variables.input.segment === "GAS" ? "GAS-EAN" : "EL-EAN" }] } } }
      : fixture;
    return new Response(JSON.stringify(json), { headers: { "content-type": "application/json" } });
  }) as typeof fetch;
  try {
    const r = await fetchFrank(frank.calculator!.testAddress);
    assert.equal(r.electricityMarkup?.value, 0.01815);
  } finally {
    globalThis.fetch = realFetch;
  }
  assert.equal(calls.length, 3);
  const sim = calls.find((c) => c.query.includes("SignupSimulatePrice")).variables.input;
  assert.equal(sim.electricityEAN, "EL-EAN");
  assert.equal(sim.gasEAN, "GAS-EAN");
  assert.equal(sim.zipCode, "2584RZ");
  assert.equal(sim.electricityPropositionType, "dynamic");
});

// ---- Vandebron (real response captured 2026-09-24) ----
import { fetchVandebron, parseVandebron, startDateFor } from "../src/calculators/vandebron.ts";
import { fetchBudget, parseBudget, RESELLER_ID } from "../src/calculators/budget.ts";

const vdb = JSON.parse(await readFile(new URL("fixtures/vandebron-pricebreakdown-2026-09-24.json", import.meta.url), "utf8"));
const bt = JSON.parse(await readFile(new URL("fixtures/budget-online-offers-2026-09-24.json", import.meta.url), "utf8"));

test("parseVandebron reads the dynamic surcharges excl. btw", () => {
  const r = parseVandebron(vdb);
  assert.equal(r.electricityMarkup?.value, 0.01825);
  assert.equal(r.gasMarkup?.value, 0.04945);
  assert.equal(r.feedInDelta?.value, -0.01125);
  assert.equal(r.electricityFixedMonthly?.value, 5.781296); // 0.19007 per day x 365/12
  assert.ok(Object.values(r).every((v) => v!.vatIncluded === false));
});

test("Vandebron start date follows the website (Sep 24 -> Nov 1)", () => {
  assert.equal(startDateFor("2026-09-24"), "2026-11-01");
  assert.equal(startDateFor("2026-12-15"), "2027-02-01");
});

test("fetchVandebron: address -> grid operator -> dynamic price breakdown (stubbed)", async () => {
  const calls: { url: string; body?: any }[] = [];
  const realFetch = globalThis.fetch;
  globalThis.fetch = (async (url: any, init: any) => {
    calls.push({ url: String(url), body: init?.body ? JSON.parse(init.body) : undefined });
    const json = String(url).includes("/validate/edsn/address")
      ? { electricityGridOperatorEan: "8716892000005", gasGridOperatorEan: "8716892000005" }
      : vdb;
    return new Response(JSON.stringify(json), { headers: { "content-type": "application/json" } });
  }) as typeof fetch;
  try {
    const r = await fetchVandebron({ postcode: "2584RZ", houseNumber: 1, city: "X", label: "test" });
    assert.equal(r.electricityMarkup?.value, 0.01825);
  } finally {
    globalThis.fetch = realFetch;
  }
  assert.equal(calls.length, 2);
  assert.match(calls[0].url, /zipcode=2584RZ/);
  assert.equal(calls[1].body.electricity.contractDuration.durationType, "MarketPriceVariable");
  assert.equal(calls[1].body.electricity.gridOperatorEan, "8716892000005");
});

// ---- Budget Thuis (real response captured 2026-09-24, trimmed) ----

test("parseBudget picks the dynamic proposition, excl. btw", () => {
  const r = parseBudget(bt);
  assert.equal(r.electricityMarkup?.value, 0.0139);
  assert.equal(r.gasMarkup?.value, 0.053);
  assert.equal(r.electricityFixedMonthly?.value, 4.95);
  assert.equal(r.gasFixedMonthly?.value, 4.95);
  assert.equal(r.feedInDelta?.value, 0);
});

test("parseBudget fails loudly when there is no dynamic proposition", () => {
  assert.throws(() => parseBudget({ salesChannels: [{ offers: [] }] }), /no dynamic proposition/);
});

test("fetchBudget posts the test address and usage (stubbed)", async () => {
  let sent: any;
  const realFetch = globalThis.fetch;
  globalThis.fetch = (async (_url: any, init: any) => {
    sent = JSON.parse(init.body);
    return new Response(JSON.stringify(bt), { headers: { "content-type": "application/json" } });
  }) as typeof fetch;
  try {
    const r = await fetchBudget({ postcode: "2584RZ", houseNumber: 1, city: "X", label: "test" });
    assert.equal(r.electricityMarkup?.value, 0.0139);
  } finally {
    globalThis.fetch = realFetch;
  }
  assert.equal(sent.resellerId, RESELLER_ID);
  assert.deepEqual(sent.address, { postalCode: "2584RZ", houseNumber: 1, extension: "" });
});

test("adapters keep the API's exact incl.-btw amounts", () => {
  const v = parseVandebron(vdb);
  assert.equal(v.electricityMarkup?.valueInclVat, 0.02208);
  assert.equal(v.feedInDelta?.valueInclVat, -0.01361);
  const b = parseBudget(bt);
  assert.equal(b.electricityMarkup?.valueInclVat, 0.01682);
  const rec = buildSupplier(frank, new Map(), undefined, "2026-09-24T04:17:00Z", [], b);
  assert.equal(rec.tariffs.electricityMarkup?.value, 0.0139);
  assert.equal(rec.tariffs.electricityMarkup?.valueInclVat, 0.01682);
});
