import assert from "node:assert/strict";
import { test } from "node:test";
import { haalJaargemiddelde, leesJaargemiddelde } from "../src/lib/bronnen.ts";

test("jaargemiddelde: gemiddelde van de dagprijzen, incl. btw", () => {
  const r = leesJaargemiddelde({ Prices: [{ price: 0.1 }, { price: 0.2 }, { price: null }] }, "2025-09-24", "2026-09-23");
  assert.deepEqual(r, { prijsInclBtw: 0.1815, dagen: 2, van: "2025-09-24", tot: "2026-09-23" }); // 0.15 x 1.21
  assert.equal(leesJaargemiddelde({ Prices: [] }, "a", "b"), null);
});

test("haalJaargemiddelde vraagt 365 dagen per dag op, zonder btw (nagebootst)", async () => {
  let gevraagd: URL | undefined;
  const echteFetch = globalThis.fetch;
  globalThis.fetch = (async (url: any) => {
    gevraagd = new URL(String(url));
    return new Response(JSON.stringify({ Prices: [{ price: 0.1 }] }), { headers: { "content-type": "application/json" } });
  }) as typeof fetch;
  try {
    const r = await haalJaargemiddelde("gas", "2026-09-24");
    assert.equal(r?.prijsInclBtw, 0.121);
  } finally {
    globalThis.fetch = echteFetch;
  }
  const p = gevraagd!.searchParams;
  assert.equal(p.get("interval"), "5");
  assert.equal(p.get("usageType"), "3");
  assert.equal(p.get("inclBtw"), "false");
  assert.equal(p.get("fromDate"), "2025-09-23T22:00:00.000Z"); // 2025-09-24 00:00 Amsterdam
  assert.equal(p.get("tillDate"), "2026-09-23T21:59:59.999Z"); // up to and including yesterday
});
