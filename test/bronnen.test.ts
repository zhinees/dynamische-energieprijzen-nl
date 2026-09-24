import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { test } from "node:test";
import { leesEnergyZero, leesEntsoeXml, naarPerUur } from "../src/lib/bronnen.ts";
import { dagGrenzenUtc, lokaalNaarUtcMs } from "../src/lib/tijd.ts";

const lees = (f: string) => readFile(new URL(`fixtures/${f}`, import.meta.url), "utf8");

test("EnergyZero: echt antwoord, 24 uur, prijs om 18:00 lokaal", async () => {
  const [a, b] = dagGrenzenUtc("2026-09-24");
  const r = leesEnergyZero(JSON.parse(await lees("energyzero-2026-09-24.json")), a, b)!;
  assert.equal(r.punten.size, 24);
  assert.equal(r.punten.get(lokaalNaarUtcMs("2026-09-24", 18)), 0.22118);
});

test("ENTSO-E: kiest PT15M, vult A03-gaten, rekent EUR/MWh -> EUR/kWh", async () => {
  const a = Date.parse("2026-09-24T16:00:00Z");
  const r = leesEntsoeXml(await lees("entsoe-sample.xml"), a, a + 2 * 3_600_000)!;
  assert.equal(r.resolutie, 15);
  assert.deepEqual([...r.punten.values()], [0.2, 0.22, 0.22, 0.24, -0.01, -0.01, -0.01, -0.01]);
  const perUur = naarPerUur(r);
  assert.equal(perUur.get(a), 0.22); // (0.20 + 0.22 + 0.22 + 0.24) / 4
  assert.equal(perUur.get(a + 3_600_000), -0.01);
});

test("ENTSO-E: 'geen data'-bevestiging geeft null", () => {
  assert.equal(leesEntsoeXml("<Acknowledgement_MarketDocument><Reason><text>No matching data found</text></Reason></Acknowledgement_MarketDocument>", 0, 1), null);
});
