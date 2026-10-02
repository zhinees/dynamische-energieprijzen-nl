// Fixed electricity contracts of suppliers, hand-maintained (vaste-contracten/contracten.json) → data/vaste-contracten.json.
// Like the manual values of the dynamic suppliers: every number read on the supplier's own site or tariff sheet, with
// the URL and the date. The supply tariff is without energy tax (consumers add the tax of their year), incl. btw.
// Feed-in costs are per kWh, or a staffel: a fixed amount per month for the band the yearly feed-in falls in.

import { exclBtw, inclBtw } from "./tarieven.ts";

export type HandWaarde = { waarde: number; inclBtw: boolean; geverifieerd: true; gecontroleerdOp: string; bron: string; notitie?: string };
export const VAST_VELDEN = ["stroomLeveringPerKwh", "stroomVastPerMaand", "terugleververgoedingPerKwh", "terugleverkostenPerKwh"] as const;
export type VastVeld = (typeof VAST_VELDEN)[number];
const VERPLICHT: VastVeld[] = ["stroomLeveringPerKwh", "stroomVastPerMaand", "terugleververgoedingPerKwh"];
const EENHEID: Record<VastVeld, string> = {
  stroomLeveringPerKwh: "EUR/kWh", stroomVastPerMaand: "EUR/maand", terugleververgoedingPerKwh: "EUR/kWh", terugleverkostenPerKwh: "EUR/kWh",
};
/** Sanity ranges incl. btw: a number outside is almost certainly a typo (cents, or energy tax included). */
const BEREIK: Record<VastVeld, [number, number]> = {
  stroomLeveringPerKwh: [0.03, 0.5], stroomVastPerMaand: [0, 30], terugleververgoedingPerKwh: [-0.2, 0.3], terugleverkostenPerKwh: [0, 0.4],
};

export type VastContractConfig = {
  id: string;
  leverancier: string;
  /** Id in leveranciers/ when the supplier is also there (its website is then checked against the sources). */
  leverancierId?: string;
  naam: string;
  looptijdMaanden: number | null;
  tariefUrl: string;
  /** Postcode used in the supplier's calculator, when the tariffs depend on it. */
  postcode?: string;
  geldigVanaf?: string;
  tarieven: Partial<Record<VastVeld, HandWaarde>>;
  terugleverStaffels?: {
    inclBtw: boolean; geverifieerd: true; gecontroleerdOp: string; bron: string; notitie?: string;
    /** totKwh: upper bound of the band in kWh feed-in per year; null = everything above (the last band). */
    banden: { totKwh: number | null; perMaand: number }[];
  };
  notitie?: string;
};
export type VasteContractenConfig = { gecontroleerdOp: string; contracten: VastContractConfig[] };

type Bedrag = { bedragInclBtw: number; bedragExclBtw: number; eenheid: string; bronUrl: string; gecontroleerdOp: string; notitie?: string };
export type VastContract = Omit<VastContractConfig, "tarieven" | "terugleverStaffels"> & {
  tarieven: Partial<Record<VastVeld, Bedrag>>;
  terugleverStaffels?: { totKwh: number | null; perMaand: { bedragInclBtw: number; bedragExclBtw: number } }[];
  staffelBron?: { bronUrl: string; gecontroleerdOp: string; notitie?: string };
};
export type VasteContractenBestand = {
  gegenereerdOp: string; gecontroleerdOp: string; valuta: "EUR"; inclBtw: true; omschrijving: string; contracten: VastContract[];
};

const bedrag = (v: number, isIncl: boolean) => ({ bedragInclBtw: isIncl ? v : inclBtw(v), bedragExclBtw: isIncl ? exclBtw(v) : v });
const host = (url: string) => new URL(url).hostname.replace(/^www\./, "");

/**
 * Checks and converts. websites: leverancierId → website, to check that every source is on the supplier's own domain
 * (a contract without leverancierId is checked against the domain of its tariefUrl).
 */
export function bouwVasteContracten(cfg: VasteContractenConfig, nu: string, websites: Record<string, string> = {}): VasteContractenBestand {
  const ids = new Set<string>();
  const contracten = cfg.contracten.map((c): VastContract => {
    const waar = c.id;
    if (ids.has(c.id)) throw new Error(`${waar}: dubbele id`);
    ids.add(c.id);
    const site = c.leverancierId ? websites[c.leverancierId] : c.tariefUrl;
    if (c.leverancierId && !site) throw new Error(`${waar}: leverancierId ${c.leverancierId} staat niet in leveranciers/`);
    const domein = host(site!);
    const eigen = (url: string, wat: string) => {
      const h = host(url);
      if (h !== domein && !h.endsWith(`.${domein}`)) throw new Error(`${waar} ${wat}: bron ${url} staat niet op de eigen site van de leverancier (${domein})`);
    };
    const datum = (d: string, wat: string) => { if (d > cfg.gecontroleerdOp) throw new Error(`${waar} ${wat}: gecontroleerdOp na die van het bestand`); };
    eigen(c.tariefUrl, "tariefUrl");
    const tarieven: VastContract["tarieven"] = {};
    for (const veld of VAST_VELDEN) {
      const h = c.tarieven[veld];
      if (!h) { if (VERPLICHT.includes(veld)) throw new Error(`${waar}: ${veld} ontbreekt`); continue; }
      if (h.geverifieerd !== true) throw new Error(`${waar} ${veld}: alleen gecontroleerde waarden (geverifieerd: true)`);
      eigen(h.bron, veld); datum(h.gecontroleerdOp, veld);
      const b = bedrag(h.waarde, h.inclBtw), [min, max] = BEREIK[veld];
      if (b.bedragInclBtw < min || b.bedragInclBtw > max) throw new Error(`${waar} ${veld}: ${b.bedragInclBtw} ligt buiten ${min}–${max} (incl. btw; zonder energiebelasting?)`);
      tarieven[veld] = { ...b, eenheid: EENHEID[veld], bronUrl: h.bron, gecontroleerdOp: h.gecontroleerdOp, ...(h.notitie && { notitie: h.notitie }) };
    }
    const { terugleverStaffels: s, tarieven: _t, ...rest } = c;
    if (!s) return { ...rest, tarieven };
    if (s.geverifieerd !== true) throw new Error(`${waar} staffel: alleen gecontroleerde waarden (geverifieerd: true)`);
    eigen(s.bron, "staffel"); datum(s.gecontroleerdOp, "staffel");
    if (!s.banden.length) throw new Error(`${waar} staffel: geen banden`);
    s.banden.forEach((b, i) => {
      const laatste = i === s.banden.length - 1;
      if ((b.totKwh === null) !== laatste) throw new Error(`${waar} staffel: alleen de laatste band is open (totKwh null)`);
      if (i > 0 && b.totKwh !== null && b.totKwh <= s.banden[i - 1].totKwh!) throw new Error(`${waar} staffel: banden oplopend op totKwh`);
      if (b.perMaand < 0 || bedrag(b.perMaand, s.inclBtw).bedragInclBtw > 200) throw new Error(`${waar} staffel: bedrag per maand ${b.perMaand} onmogelijk`);
    });
    return {
      ...rest, tarieven,
      terugleverStaffels: s.banden.map((b) => ({ totKwh: b.totKwh, perMaand: bedrag(b.perMaand, s.inclBtw) })),
      staffelBron: { bronUrl: s.bron, gecontroleerdOp: s.gecontroleerdOp, ...(s.notitie && { notitie: s.notitie }) },
    };
  });
  return {
    gegenereerdOp: nu, gecontroleerdOp: cfg.gecontroleerdOp, valuta: "EUR", inclBtw: true,
    omschrijving: "Vaste stroomcontracten van leveranciers voor nieuwe klanten, met de hand overgenomen van de eigen site of het tariefblad van de leverancier. Leveringstarief per kWh zonder energiebelasting, incl. btw. Terugleverkosten per kWh, of een staffel: een vast bedrag per maand voor de band waarin de teruglevering per jaar valt. Geen volledige lijst: er komen leveranciers bij.",
    contracten,
  };
}
