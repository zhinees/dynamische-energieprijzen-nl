import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { test } from "node:test";
import { htmlNaarTekst, leesEuro, leesVeld } from "../src/lib/uitlezen.ts";
import { laadLeverancierConfigs } from "../src/lib/bestanden.ts";
import { bouwLeverancier } from "../src/lib/tarieven.ts";

const fixture = async (naam: string) => htmlNaarTekst(await readFile(new URL(`fixtures/${naam}.html`, import.meta.url), "utf8"));
const configs = await laadLeverancierConfigs();
const cfg = (id: string) => configs.find((c) => c.id === id)!;

test("leesEuro kent Nederlandse en Engelse notatie", () => {
  assert.equal(leesEuro("€ 0,0182"), 0.0182);
  assert.equal(leesEuro("0.0182"), 0.0182);
  assert.equal(leesEuro("1.234,56"), 1234.56);
});

test("htmlNaarTekst laat scripts weg en markeert koppen", () => {
  const t = htmlNaarTekst("<script>opslag € 9,99</script><h2>Gas</h2><p>a&nbsp;&euro;&nbsp;1</p>");
  assert.equal(t, "## Gas ## a € 1");
});

test("bedragen in cent, bedragen vóór het label en negatief", () => {
  const t = "Inkoop 1,82 cent per kWh. € 5,99 vaste kosten. Terugleverkosten € 0,02.";
  assert.equal(leesVeld(t, "stroomInkoopopslag", { labels: ["inkoop"], bereik: [0, 0.1] }).waarde, 0.0182);
  assert.equal(leesVeld(t, "stroomVastPerMaand", { labels: ["vaste kosten"], bereik: [1, 20], ervoor: true }).waarde, 5.99);
  assert.equal(leesVeld(t, "terugleverCorrectie", { labels: ["terugleverkosten"], bereik: [-0.1, 0], negatief: true }).waarde, -0.02);
});

test("bedragen buiten het bereik worden overgeslagen, niet opgeslagen", () => {
  const r = leesVeld("opslag € 7,25 per maand", "stroomInkoopopslag", { labels: ["opslag"], bereik: [0, 0.1] });
  assert.equal(r.ok, false);
  assert.deepEqual(r.afgewezen, [7.25]);
});

const ex = (n: number) => Math.round((n / 1.21) * 1e6) / 1e6;

test("Tibber-bestand leest alle vijf tarieven (incl. btw -> excl.)", async () => {
  const url = cfg("tibber").tariefUrl;
  const rec = bouwLeverancier(cfg("tibber"), new Map([[url, await fixture("tibber")]]), undefined, "2026-09-24T05:00:00Z");
  const v = Object.fromEntries(Object.entries(rec.tarieven).map(([k, x]) => [k, [x!.bedragExclBtw, x!.bron]]));
  assert.deepEqual(v, {
    stroomVastPerMaand: [ex(6.99), "website"],
    stroomInkoopopslag: [ex(0.018), "website"],
    gasVastPerMaand: [ex(5.99), "website"],
    gasInkoopopslag: [ex(0.08835), "website"],
    terugleverCorrectie: [ex(-0.018), "website"],
  });
  // What a consumer sees: exactly the amounts on Tibber's page.
  const incl = Object.fromEntries(Object.entries(rec.tarieven).map(([k, x]) => [k, x!.bedragInclBtw]));
  assert.deepEqual(incl, {
    stroomVastPerMaand: 6.99,
    stroomInkoopopslag: 0.018,
    gasVastPerMaand: 5.99,
    gasInkoopopslag: 0.08835,
    terugleverCorrectie: -0.018,
  });
});

test("NextEnergy-bestand leest centen en de vaste kosten 'ervoor'", async () => {
  const url = cfg("nextenergy").tariefUrl;
  const rec = bouwLeverancier(cfg("nextenergy"), new Map([[url, await fixture("nextenergy")]]), undefined, "2026-09-24T05:00:00Z");
  assert.equal(rec.tarieven.stroomInkoopopslag?.bedragExclBtw, ex(0.021));
  assert.equal(rec.tarieven.gasInkoopopslag?.bedragExclBtw, ex(0.079));
  assert.equal(rec.tarieven.stroomVastPerMaand?.bedragExclBtw, ex(5.99));
  // Every field with a rule must be scraped, not silently filled by the handmatig fallback.
  for (const k of ["stroomInkoopopslag", "gasInkoopopslag", "stroomVastPerMaand", "gasVastPerMaand"] as const) {
    assert.equal(rec.tarieven[k]?.bron, "website", k);
  }
  assert.equal(rec.tarieven.terugleverCorrectie?.bron, "handmatig"); // no rule, "geen terugleverkosten"
  assert.equal(rec.tarieven.terugleverCorrectie?.bedragExclBtw, 0);
});

test("ANWB-bestand neemt de aangekondigde nieuwe gasprijs, stroomopslag uitgelezen", async () => {
  const url = cfg("anwb").tariefUrl;
  const rec = bouwLeverancier(cfg("anwb"), new Map([[url, await fixture("anwb")]]), undefined, "2026-09-24T05:00:00Z");
  assert.equal(rec.tarieven.stroomInkoopopslag?.bedragExclBtw, ex(0.018));
  assert.equal(rec.tarieven.gasInkoopopslag?.bedragExclBtw, ex(0.0768));
  assert.equal(rec.tarieven.stroomInkoopopslag?.bron, "website");
  assert.equal(rec.tarieven.gasInkoopopslag?.bron, "website");
  assert.equal(rec.tarieven.stroomVastPerMaand, undefined); // not published by ANWB, so no value at all
});

test("ANWB-gas valt terug op de tweede regel als de 'vanaf'-melding weg is", () => {
  const t = "## Wat zijn de inkoopkosten? ## De inkoopkosten bedragen € 0,018 per kWh en € 0,0768 per kuub gas (incl. btw).";
  const url = cfg("anwb").tariefUrl;
  const rec = bouwLeverancier(cfg("anwb"), new Map([[url, t]]), undefined, "2026-10-01T05:00:00Z");
  assert.equal(rec.tarieven.gasInkoopopslag?.bedragExclBtw, ex(0.0768));
  assert.equal(rec.tarieven.gasInkoopopslag?.bron, "website");
});

test("Vattenfall-verkoopvergoeding '€ 0 per kWh' wordt 0", async () => {
  const url = cfg("vattenfall").tariefUrl;
  const rec = bouwLeverancier(cfg("vattenfall"), new Map([[url, await fixture("vattenfall")]]), undefined, "2026-09-24T05:00:00Z");
  assert.equal(rec.tarieven.terugleverCorrectie?.bedragExclBtw, 0);
  assert.equal(rec.tarieven.terugleverCorrectie?.bron, "website");
});
