import assert from "node:assert/strict";
import { test } from "node:test";
import { buildSupplier } from "../src/lib/tariffs.ts";
import type { SupplierConfig } from "../src/lib/types.ts";

const cfg: SupplierConfig = {
  id: "x",
  name: "X",
  website: "https://x.nl",
  tariffUrl: "https://x.nl/t",
  products: { electricity: true, gas: false },
  features: { autoCurtailment: null },
  fields: { electricityMarkup: { labels: ["opslag"], range: [0, 0.1] } },
  manual: {
    electricityMarkup: { value: 0.02, vatIncluded: false, verified: true, checkedAt: "2026-09-01", source: "https://x.nl/t" },
    gasMarkup: { value: 0.08, vatIncluded: false, verified: true, checkedAt: "2026-09-01", source: "https://x.nl/t" },
  },
};
const page = (v: string) => new Map([["https://x.nl/t", `opslag € ${v} per kWh`]]);

test("scraped value wins and is marked verified", () => {
  const r = buildSupplier(cfg, page("0,03"), undefined, "2026-09-24T05:00:00Z");
  assert.equal(r.tariffs.electricityMarkup?.value, 0.03);
  assert.equal(r.tariffs.electricityMarkup?.source, "scraped");
  assert.equal(r.tariffs.electricityMarkup?.valueInclVat, 0.0363);
});

test("gas fields are skipped when the supplier has no gas", () => {
  const r = buildSupplier(cfg, page("0,03"), undefined, "2026-09-24T05:00:00Z");
  assert.equal(r.tariffs.gasMarkup, undefined);
});

test("'since' stays put while the value is unchanged", () => {
  const first = buildSupplier(cfg, page("0,03"), undefined, "2026-09-24T05:00:00Z");
  const second = buildSupplier(cfg, page("0,03"), first, "2026-09-25T05:00:00Z");
  assert.equal(second.tariffs.electricityMarkup?.since, "2026-09-24T05:00:00Z");
  assert.equal(second.tariffs.electricityMarkup?.lastChecked, "2026-09-25T05:00:00Z");
  const third = buildSupplier(cfg, page("0,04"), second, "2026-09-26T05:00:00Z");
  assert.equal(third.tariffs.electricityMarkup?.since, "2026-09-26T05:00:00Z");
});

test("failed scrape keeps the newer scraped value over an older manual one", () => {
  const first = buildSupplier(cfg, page("0,03"), undefined, "2026-09-24T05:00:00Z");
  const failed = buildSupplier(cfg, new Map(), first, "2026-09-25T05:00:00Z", ["HTTP 503"]);
  assert.equal(failed.tariffs.electricityMarkup?.value, 0.03);
  assert.equal(failed.tariffs.electricityMarkup?.lastError, "page could not be fetched");
  assert.equal(failed.fetchError, "HTTP 503");
});

test("failed scrape with a newer manual value uses the manual value", () => {
  const first = buildSupplier(cfg, page("0,03"), undefined, "2026-08-01T05:00:00Z");
  const failed = buildSupplier(cfg, new Map(), first, "2026-09-25T05:00:00Z");
  assert.equal(failed.tariffs.electricityMarkup?.value, 0.02);
  assert.equal(failed.tariffs.electricityMarkup?.source, "manual");
});

test("unverified manual values are never published", () => {
  const c = structuredClone(cfg);
  (c.manual.electricityMarkup as any).verified = false;
  const r = buildSupplier({ ...c, fields: {} }, new Map(), undefined, "2026-09-24T05:00:00Z");
  assert.equal(r.tariffs.electricityMarkup, undefined);
});

test("an old manual value is not carried forward once it is removed from the config", () => {
  const first = buildSupplier({ ...cfg, fields: {} }, new Map(), undefined, "2026-09-24T05:00:00Z");
  assert.equal(first.tariffs.electricityMarkup?.source, "manual");
  const next = buildSupplier({ ...cfg, fields: {}, manual: {} }, new Map(), first, "2026-09-25T05:00:00Z");
  assert.equal(next.tariffs.electricityMarkup, undefined);
});

test("valueInclVat is the exact published amount, no rounding drift", () => {
  const c = structuredClone(cfg);
  c.manual.electricityMarkup = { value: 0.08835, vatIncluded: true, verified: true, checkedAt: "2026-09-24", source: "https://x.nl/t" };
  const r = buildSupplier({ ...c, fields: {} }, new Map(), undefined, "2026-09-24T05:00:00Z");
  assert.equal(r.tariffs.electricityMarkup?.valueInclVat, 0.08835);
});
