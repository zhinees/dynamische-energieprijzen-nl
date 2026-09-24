import assert from "node:assert/strict";
import { test } from "node:test";
import { dayBoundsUtc, localToUtcMs, toLocalIso, todayLocal, toUtcIso } from "../src/lib/time.ts";

const HOUR = 3_600_000;

test("18:00 Amsterdam in summer is 16:00 UTC", () => {
  assert.equal(toUtcIso(localToUtcMs("2026-09-24", 18)), "2026-09-24T16:00:00Z");
});

test("18:00 Amsterdam in winter is 17:00 UTC", () => {
  assert.equal(toUtcIso(localToUtcMs("2026-12-01", 18)), "2026-12-01T17:00:00Z");
});

test("normal day has 24 hours, DST days 23 and 25", () => {
  const len = (d: string) => {
    const [a, b] = dayBoundsUtc(d);
    return (b - a) / HOUR;
  };
  assert.equal(len("2026-09-24"), 24);
  assert.equal(len("2026-03-29"), 23);
  assert.equal(len("2026-10-25"), 25);
  assert.equal(toUtcIso(dayBoundsUtc("2026-10-25")[0]), "2026-10-24T22:00:00Z");
  assert.equal(toUtcIso(dayBoundsUtc("2026-10-25")[1]), "2026-10-25T23:00:00Z");
});

test("local ISO carries the right offset", () => {
  assert.equal(toLocalIso(Date.parse("2026-09-24T16:00:00Z")), "2026-09-24T18:00:00+02:00");
  assert.equal(toLocalIso(Date.parse("2026-12-01T17:00:00Z")), "2026-12-01T18:00:00+01:00");
});

test("today in Amsterdam differs from UTC just after midnight", () => {
  assert.equal(todayLocal(Date.parse("2026-09-24T22:30:00Z")), "2026-09-25");
});
