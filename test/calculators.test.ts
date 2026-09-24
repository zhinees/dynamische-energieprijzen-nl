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
