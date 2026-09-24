import assert from "node:assert/strict";
import { test } from "node:test";
import { bouwLeverancier } from "../src/lib/tarieven.ts";
import type { LeverancierConfig } from "../src/lib/typen.ts";

const cfg: LeverancierConfig = {
  id: "x",
  naam: "X",
  website: "https://x.nl",
  tariefUrl: "https://x.nl/t",
  producten: { stroom: true, gas: false },
  kenmerken: { automatischAfschakelen: null },
  regels: { stroomInkoopopslag: { labels: ["opslag"], bereik: [0, 0.1] } },
  handmatig: {
    stroomInkoopopslag: { waarde: 0.02, inclBtw: false, geverifieerd: true, gecontroleerdOp: "2026-09-01", bron: "https://x.nl/t" },
    gasInkoopopslag: { waarde: 0.08, inclBtw: false, geverifieerd: true, gecontroleerdOp: "2026-09-01", bron: "https://x.nl/t" },
  },
};
const pagina = (v: string) => new Map([["https://x.nl/t", `opslag € ${v} per kWh`]]);

test("uitgelezen waarde wint en is geverifieerd", () => {
  const r = bouwLeverancier(cfg, pagina("0,03"), undefined, "2026-09-24T05:00:00Z");
  assert.equal(r.tarieven.stroomInkoopopslag?.waarde, 0.03);
  assert.equal(r.tarieven.stroomInkoopopslag?.bron, "website");
  assert.equal(r.tarieven.stroomInkoopopslag?.waardeInclBtw, 0.0363);
});

test("gasvelden worden overgeslagen als de leverancier geen gas levert", () => {
  const r = bouwLeverancier(cfg, pagina("0,03"), undefined, "2026-09-24T05:00:00Z");
  assert.equal(r.tarieven.gasInkoopopslag, undefined);
});

test("'sinds' blijft staan zolang de waarde niet verandert", () => {
  const eerste = bouwLeverancier(cfg, pagina("0,03"), undefined, "2026-09-24T05:00:00Z");
  const tweede = bouwLeverancier(cfg, pagina("0,03"), eerste, "2026-09-25T05:00:00Z");
  assert.equal(tweede.tarieven.stroomInkoopopslag?.sinds, "2026-09-24T05:00:00Z");
  assert.equal(tweede.tarieven.stroomInkoopopslag?.laatstGecontroleerd, "2026-09-25T05:00:00Z");
  const derde = bouwLeverancier(cfg, pagina("0,04"), tweede, "2026-09-26T05:00:00Z");
  assert.equal(derde.tarieven.stroomInkoopopslag?.sinds, "2026-09-26T05:00:00Z");
});

test("mislukt uitlezen houdt de nieuwere uitgelezen waarde boven een oudere handmatige", () => {
  const eerste = bouwLeverancier(cfg, pagina("0,03"), undefined, "2026-09-24T05:00:00Z");
  const mislukt = bouwLeverancier(cfg, new Map(), eerste, "2026-09-25T05:00:00Z", ["HTTP 503"]);
  assert.equal(mislukt.tarieven.stroomInkoopopslag?.waarde, 0.03);
  assert.equal(mislukt.tarieven.stroomInkoopopslag?.laatsteFout, "pagina kon niet worden opgehaald");
  assert.equal(mislukt.ophaalfout, "HTTP 503");
});

test("mislukt uitlezen met een nieuwere handmatige waarde gebruikt de handmatige waarde", () => {
  const eerste = bouwLeverancier(cfg, pagina("0,03"), undefined, "2026-08-01T05:00:00Z");
  const mislukt = bouwLeverancier(cfg, new Map(), eerste, "2026-09-25T05:00:00Z");
  assert.equal(mislukt.tarieven.stroomInkoopopslag?.waarde, 0.02);
  assert.equal(mislukt.tarieven.stroomInkoopopslag?.bron, "handmatig");
});

test("ongecontroleerde handmatige waarden worden nooit gepubliceerd", () => {
  const c = structuredClone(cfg);
  (c.handmatig.stroomInkoopopslag as any).geverifieerd = false;
  const r = bouwLeverancier({ ...c, regels: {} }, new Map(), undefined, "2026-09-24T05:00:00Z");
  assert.equal(r.tarieven.stroomInkoopopslag, undefined);
});

test("een oude handmatige waarde verdwijnt zodra hij uit het bestand is gehaald", () => {
  const eerste = bouwLeverancier({ ...cfg, regels: {} }, new Map(), undefined, "2026-09-24T05:00:00Z");
  assert.equal(eerste.tarieven.stroomInkoopopslag?.bron, "handmatig");
  const volgende = bouwLeverancier({ ...cfg, regels: {}, handmatig: {} }, new Map(), eerste, "2026-09-25T05:00:00Z");
  assert.equal(volgende.tarieven.stroomInkoopopslag, undefined);
});

test("waardeInclBtw is precies het gepubliceerde bedrag, zonder afrondingsverschil", () => {
  const c = structuredClone(cfg);
  c.handmatig.stroomInkoopopslag = { waarde: 0.08835, inclBtw: true, geverifieerd: true, gecontroleerdOp: "2026-09-24", bron: "https://x.nl/t" };
  const r = bouwLeverancier({ ...c, regels: {} }, new Map(), undefined, "2026-09-24T05:00:00Z");
  assert.equal(r.tarieven.stroomInkoopopslag?.waardeInclBtw, 0.08835);
});
