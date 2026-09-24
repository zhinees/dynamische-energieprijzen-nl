import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { test } from "node:test";
import { parseEnergyZero, parseEntsoeXml, toHourly } from "../src/lib/sources.ts";
import { dayBoundsUtc, localToUtcMs } from "../src/lib/time.ts";

const read = (f: string) => readFile(new URL(`fixtures/${f}`, import.meta.url), "utf8");

test("EnergyZero: real response, 24 hours, 18:00 local price", async () => {
  const [a, b] = dayBoundsUtc("2026-09-24");
  const s = parseEnergyZero(JSON.parse(await read("energyzero-2026-09-24.json")), a, b)!;
  assert.equal(s.points.size, 24);
  assert.equal(s.points.get(localToUtcMs("2026-09-24", 18)), 0.22118);
});

test("ENTSO-E: prefers PT15M, fills A03 gaps, converts EUR/MWh -> EUR/kWh", async () => {
  const a = Date.parse("2026-09-24T16:00:00Z");
  const s = parseEntsoeXml(await read("entsoe-sample.xml"), a, a + 2 * 3_600_000)!;
  assert.equal(s.resolution, 15);
  assert.deepEqual([...s.points.values()], [0.2, 0.22, 0.22, 0.24, -0.01, -0.01, -0.01, -0.01]);
  const hourly = toHourly(s);
  assert.equal(hourly.get(a), 0.22); // (0.20 + 0.22 + 0.22 + 0.24) / 4
  assert.equal(hourly.get(a + 3_600_000), -0.01);
});

test("ENTSO-E: 'no data' acknowledgement returns null", () => {
  assert.equal(parseEntsoeXml("<Acknowledgement_MarketDocument><Reason><text>No matching data found</text></Reason></Acknowledgement_MarketDocument>", 0, 1), null);
});
