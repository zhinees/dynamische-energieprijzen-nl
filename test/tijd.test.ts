import assert from "node:assert/strict";
import { test } from "node:test";
import { dagGrenzenUtc, lokaalNaarUtcMs, naarLokaalIso, naarUtcIso, vandaagLokaal } from "../src/lib/tijd.ts";

const UUR = 3_600_000;

test("18:00 Amsterdam in de zomer is 16:00 UTC", () => {
  assert.equal(naarUtcIso(lokaalNaarUtcMs("2026-09-24", 18)), "2026-09-24T16:00:00Z");
});

test("18:00 Amsterdam in de winter is 17:00 UTC", () => {
  assert.equal(naarUtcIso(lokaalNaarUtcMs("2026-12-01", 18)), "2026-12-01T17:00:00Z");
});

test("gewone dag heeft 24 uur, zomertijddagen 23 en 25", () => {
  const lengte = (d: string) => {
    const [a, b] = dagGrenzenUtc(d);
    return (b - a) / UUR;
  };
  assert.equal(lengte("2026-09-24"), 24);
  assert.equal(lengte("2026-03-29"), 23);
  assert.equal(lengte("2026-10-25"), 25);
  assert.equal(naarUtcIso(dagGrenzenUtc("2026-10-25")[0]), "2026-10-24T22:00:00Z");
  assert.equal(naarUtcIso(dagGrenzenUtc("2026-10-25")[1]), "2026-10-25T23:00:00Z");
});

test("lokale ISO-tijd heeft het juiste tijdverschil", () => {
  assert.equal(naarLokaalIso(Date.parse("2026-09-24T16:00:00Z")), "2026-09-24T18:00:00+02:00");
  assert.equal(naarLokaalIso(Date.parse("2026-12-01T17:00:00Z")), "2026-12-01T18:00:00+01:00");
});

test("vandaag in Amsterdam verschilt van UTC net na middernacht", () => {
  assert.equal(vandaagLokaal(Date.parse("2026-09-24T22:30:00Z")), "2026-09-25");
});
