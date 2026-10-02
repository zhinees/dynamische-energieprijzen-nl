import assert from "node:assert/strict";
import { test } from "node:test";
import { bouwVasteContracten, type HandWaarde, type VasteContractenConfig } from "../src/lib/vaste-contracten.ts";

const NU = "2026-10-02T00:00:00.000Z";
const w = (waarde: number, inclBtw = true): HandWaarde => ({ waarde, inclBtw, geverifieerd: true, gecontroleerdOp: "2026-10-02", bron: "https://www.voorbeeld.nl/tarieven" });
const cfg = (): VasteContractenConfig => ({
  gecontroleerdOp: "2026-10-02",
  contracten: [{
    id: "voorbeeld-vast-1j", leverancier: "Voorbeeld", leverancierId: "voorbeeld", naam: "Vast 1 jaar", looptijdMaanden: 12,
    tariefUrl: "https://www.voorbeeld.nl/vast",
    tarieven: { stroomLeveringPerKwh: w(0.1), stroomVastPerMaand: w(6), terugleververgoedingPerKwh: w(0.02) },
    terugleverStaffels: {
      inclBtw: true, geverifieerd: true, gecontroleerdOp: "2026-10-02", bron: "https://zakelijk.voorbeeld.nl/staffel",
      banden: [{ totKwh: 1000, perMaand: 0 }, { totKwh: 2500, perMaand: 7.5 }, { totKwh: null, perMaand: 15 }],
    },
  }],
});
const SITES = { voorbeeld: "https://www.voorbeeld.nl" };

test("zet bedragen om naar incl. en excl. btw, met eenheid, bron en staffel", () => {
  const b = bouwVasteContracten(cfg(), NU, SITES);
  assert.equal(b.gegenereerdOp, NU);
  const c = b.contracten[0];
  assert.deepEqual(c.tarieven.stroomLeveringPerKwh, { bedragInclBtw: 0.1, bedragExclBtw: 0.082645, eenheid: "EUR/kWh", bronUrl: "https://www.voorbeeld.nl/tarieven", gecontroleerdOp: "2026-10-02" });
  assert.equal(c.tarieven.stroomVastPerMaand?.eenheid, "EUR/maand");
  assert.equal(c.tarieven.terugleverkostenPerKwh, undefined);
  assert.deepEqual(c.terugleverStaffels?.map((s) => [s.totKwh, s.perMaand.bedragInclBtw]), [[1000, 0], [2500, 7.5], [null, 15]]);
  assert.equal(c.staffelBron?.bronUrl, "https://zakelijk.voorbeeld.nl/staffel", "subdomein van de leverancier mag");
  const excl = cfg();
  excl.contracten[0].tarieven.stroomVastPerMaand = w(5, false);
  assert.equal(bouwVasteContracten(excl, NU, SITES).contracten[0].tarieven.stroomVastPerMaand?.bedragInclBtw, 6.05);
});

test("weigert bronnen buiten de eigen site, ontbrekende of onmogelijke waarden en kapotte staffels", () => {
  const met = (wijzig: (c: VasteContractenConfig["contracten"][number]) => void) => {
    const c = cfg();
    wijzig(c.contracten[0]);
    return () => bouwVasteContracten(c, NU, SITES);
  };
  assert.throws(met((c) => { c.tarieven.stroomLeveringPerKwh!.bron = "https://www.vergelijker.nl/voorbeeld"; }), /eigen site/);
  assert.throws(met((c) => { delete c.tarieven.terugleververgoedingPerKwh; }), /ontbreekt/);
  assert.throws(met((c) => { c.tarieven.stroomLeveringPerKwh = w(0.35 + 0.2); }), /buiten/);
  assert.throws(met((c) => { c.tarieven.stroomLeveringPerKwh!.gecontroleerdOp = "2099-01-01"; }), /na die van het bestand/);
  assert.throws(met((c) => { c.terugleverStaffels!.banden = [{ totKwh: null, perMaand: 1 }, { totKwh: 1000, perMaand: 2 }]; }), /laatste band/);
  assert.throws(met((c) => { c.terugleverStaffels!.banden = [{ totKwh: 2000, perMaand: 1 }, { totKwh: 1000, perMaand: 2 }, { totKwh: null, perMaand: 3 }]; }), /oplopend/);
  assert.throws(met((c) => { c.leverancierId = "onbekend"; }), /niet in leveranciers/);
  const dubbel = cfg();
  dubbel.contracten.push(structuredClone(dubbel.contracten[0]));
  assert.throws(() => bouwVasteContracten(dubbel, NU, SITES), /dubbele id/);
});
