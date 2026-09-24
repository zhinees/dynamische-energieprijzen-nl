// Yearly costs per supplier and the usage where the cheapest choice flips (omslagpunt).
//
// Only the supplier's own part differs between suppliers: fixed costs x 12 + usage x markup
// (+ feed-in x terugleverCorrectie). Market price, energy tax and grid costs are the same
// for everyone, so they don't move an omslagpunt. All amounts incl. btw.

import type { Leverancier, Veld } from "./typen.ts";

export type Product = "stroom" | "gas";

const VELDEN_PER_PRODUCT: Record<Product, { vast: Veld; opslag: Veld }> = {
  stroom: { vast: "stroomVastPerMaand", opslag: "stroomInkoopopslag" },
  gas: { vast: "gasVastPerMaand", opslag: "gasInkoopopslag" },
};

const r2 = (n: number) => Math.round(n * 100) / 100 + 0;
const incl = (l: Leverancier, veld: Veld) => l.tarieven[veld]?.bedragInclBtw ?? null;

export interface Productkosten {
  id: string;
  naam: string;
  /** Fixed part per year, incl. btw: fixed costs, minus feed-in x terugleverCorrectie when feed-in is given. */
  vastPerJaar: number;
  /** Markup per kWh or m3, incl. btw. */
  opslag: number;
}

/**
 * Suppliers that publish both the fixed costs and the markup for this product.
 * With `teruglevering` (kWh per year fed back, stroom only) the feed-in correction is a fixed
 * amount for that year, so it moves into the fixed part; suppliers without one are left out.
 */
export function productkosten(leveranciers: Leverancier[], product: Product, teruglevering = 0): Productkosten[] {
  const { vast, opslag } = VELDEN_PER_PRODUCT[product];
  return leveranciers.flatMap((l) => {
    const v = incl(l, vast);
    const o = incl(l, opslag);
    const c = teruglevering > 0 ? incl(l, "terugleverCorrectie") : 0;
    return v === null || o === null || c === null ? [] : [{ id: l.id, naam: l.naam, vastPerJaar: r2(v * 12 - teruglevering * c), opslag: o }];
  });
}

/** Feed-in amounts (kWh per year) for which the cheapest stroom supplier is published. */
export const TERUGLEVERSCENARIOS = [1000, 2000, 4000];

export interface Terugleveromslag {
  /** terugleverCorrectie incl. btw, EUR per kWh fed back (negative = cost). */
  correctie: { min: number; max: number };
  /**
   * kWh fed back per year where the largest difference in terugleverCorrectie is worth as much
   * as the largest difference in stroom fixed costs. Above it, the feed-in terms weigh more.
   */
  omslagpunt: number | null;
  /** Cheapest stroom supplier per usage, for a few feed-in amounts. */
  scenarios: { teruglevering: number; goedkoopstePerVerbruik: Traject[] }[];
}

export function berekenTerugleveromslag(leveranciers: Leverancier[]): Terugleveromslag {
  const lijst = leveranciers.flatMap((l) => {
    const v = incl(l, "stroomVastPerMaand");
    const c = incl(l, "terugleverCorrectie");
    return v === null || c === null || incl(l, "stroomInkoopopslag") === null ? [] : [{ vast: v * 12, c }];
  });
  const c = lijst.map((x) => x.c);
  const vast = lijst.map((x) => x.vast);
  const verschilC = Math.max(...c) - Math.min(...c);
  return {
    correctie: { min: Math.min(...c), max: Math.max(...c) },
    omslagpunt: lijst.length > 1 && verschilC > 0 ? Math.round((Math.max(...vast) - Math.min(...vast)) / verschilC) : null,
    scenarios: TERUGLEVERSCENARIOS.map((t) => ({ teruglevering: t, goedkoopstePerVerbruik: goedkoopstePerVerbruik(productkosten(leveranciers, "stroom", t)) })),
  };
}

export interface Traject {
  /** Usage from which this supplier is the cheapest (inclusive). */
  vanaf: number;
  /** Usage up to which it stays the cheapest; null = no upper limit. */
  tot: number | null;
  id: string;
  naam: string;
}

/** Who is cheapest over the whole usage range, and where that changes. */
export function goedkoopstePerVerbruik(lijst: Productkosten[]): Traject[] {
  if (!lijst.length) return [];
  // At zero usage: lowest fixed costs, ties broken by the lowest markup.
  let huidig = lijst.reduce((a, b) => (b.vastPerJaar < a.vastPerJaar || (b.vastPerJaar === a.vastPerJaar && b.opslag < a.opslag) ? b : a));
  let vanaf = 0;
  const uit: Traject[] = [];
  for (;;) {
    let volgende: Productkosten | undefined;
    let punt = Infinity;
    for (const p of lijst) {
      if (p.opslag >= huidig.opslag) continue;
      const x = (p.vastPerJaar - huidig.vastPerJaar) / (huidig.opslag - p.opslag);
      if (x >= vanaf && x < punt) [punt, volgende] = [x, p];
    }
    if (!volgende) break;
    uit.push({ vanaf: Math.round(vanaf), tot: Math.round(punt), id: huidig.id, naam: huidig.naam });
    [huidig, vanaf] = [volgende, punt];
  }
  uit.push({ vanaf: Math.round(vanaf), tot: null, id: huidig.id, naam: huidig.naam });
  return uit;
}

export interface Omslagpunten {
  aantalLeveranciers: number;
  vastPerJaar: { min: number; max: number };
  opslag: { min: number; max: number };
  /**
   * Usage where the largest markup difference costs as much as the largest fixed-cost
   * difference. Below it fixed costs weigh more, above it the markup does.
   */
  omslagpunt: number | null;
  goedkoopstePerVerbruik: Traject[];
  /** Every pair where one has lower fixed costs and the other a lower markup. */
  paren: { lageVasteKosten: string; lageOpslag: string; omslagpunt: number }[];
}

export function berekenOmslagpunten(lijst: Productkosten[]): Omslagpunten {
  const vast = lijst.map((p) => p.vastPerJaar);
  const opslag = lijst.map((p) => p.opslag);
  const verschilVast = Math.max(...vast) - Math.min(...vast);
  const verschilOpslag = Math.max(...opslag) - Math.min(...opslag);
  const paren: Omslagpunten["paren"] = [];
  for (const a of lijst) {
    for (const b of lijst) {
      if (a.vastPerJaar < b.vastPerJaar && a.opslag > b.opslag) {
        paren.push({ lageVasteKosten: a.id, lageOpslag: b.id, omslagpunt: Math.round((b.vastPerJaar - a.vastPerJaar) / (a.opslag - b.opslag)) });
      }
    }
  }
  return {
    aantalLeveranciers: lijst.length,
    vastPerJaar: { min: r2(Math.min(...vast)), max: r2(Math.max(...vast)) },
    opslag: { min: Math.min(...opslag), max: Math.max(...opslag) },
    omslagpunt: lijst.length > 1 && verschilOpslag > 0 ? Math.round(verschilVast / verschilOpslag) : null,
    goedkoopstePerVerbruik: goedkoopstePerVerbruik(lijst),
    paren: paren.sort((x, y) => x.omslagpunt - y.omslagpunt || x.lageVasteKosten.localeCompare(y.lageVasteKosten)),
  };
}

export interface Verbruik {
  /** kWh per year taken from the grid */
  stroom: number;
  /** m3 per year */
  gas: number;
  /** kWh per year fed back */
  teruglevering: number;
}

export interface Leverancierdeel {
  id: string;
  naam: string;
  /** Supplier-dependent part per year, incl. btw: fixed costs + markups - feed-in correction. null = incomplete. */
  totaal: number | null;
  vasteKosten: number | null;
  opslagStroom: number | null;
  opslagGas: number | null;
  /** Negative = you pay (terugleverkosten), positive = you get extra. */
  teruglevering: number | null;
  /** Fields this supplier doesn't publish, so the total can't be computed. */
  ontbreekt: Veld[];
}

/** The supplier-dependent part of a year's bill, for a given usage. Cheapest first; incomplete ones last. */
export function leverancierdelen(leveranciers: Leverancier[], v: Verbruik): Leverancierdeel[] {
  const uit = leveranciers.map((l): Leverancierdeel => {
    const nodig: Veld[] = [
      ...(v.stroom > 0 || v.teruglevering > 0 ? (["stroomVastPerMaand"] as Veld[]) : []),
      ...(v.stroom > 0 ? (["stroomInkoopopslag"] as Veld[]) : []),
      ...(v.gas > 0 ? (["gasVastPerMaand", "gasInkoopopslag"] as Veld[]) : []),
      ...(v.teruglevering > 0 ? (["terugleverCorrectie"] as Veld[]) : []),
    ];
    const ontbreekt = nodig.filter((k) => incl(l, k) === null);
    const w = (k: Veld) => (nodig.includes(k) ? incl(l, k) : 0);
    const vs = w("stroomVastPerMaand");
    const vg = w("gasVastPerMaand");
    const vasteKosten = vs === null || vg === null ? null : r2((vs + vg) * 12);
    const os = w("stroomInkoopopslag");
    const og = w("gasInkoopopslag");
    const tc = w("terugleverCorrectie");
    const opslagStroom = os === null ? null : r2(v.stroom * os);
    const opslagGas = og === null ? null : r2(v.gas * og);
    const teruglevering = tc === null ? null : r2(v.teruglevering * tc);
    const totaal = ontbreekt.length ? null : r2(vasteKosten! + opslagStroom! + opslagGas! - teruglevering!);
    return { id: l.id, naam: l.naam, totaal, vasteKosten, opslagStroom, opslagGas, teruglevering, ontbreekt };
  });
  return uit.sort((a, b) => (a.totaal ?? Infinity) - (b.totaal ?? Infinity) || a.naam.localeCompare(b.naam));
}
