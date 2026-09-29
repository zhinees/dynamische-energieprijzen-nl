// Home battery models: hand-maintained technical data (thuisbatterijen/modellen.json) → data/batterijmodellen.json, with
// the usable share and a single power figure worked out for calculators, and sanity checks.

import type { BatterijType } from "./thuisbatterijen.ts";

export type BronSoort = "fabrikant" | "datasheet" | "verkoper" | "review";

export type BatterijModel = {
  id: string;
  merk: string;
  model: string;
  type: BatterijType;
  capaciteitKwh: number;
  bruikbaarKwh: number | null;
  laadKw: number | null;
  ontlaadKw: number | null;
  rondeVerliesPct: number | null;
  standbyW: number | null;
  garantie: string | null;
  notitie?: string;
  bronnen: { url: string; soort: BronSoort; notitie?: string }[];
};

export type BatterijmodellenConfig = { gecontroleerdOp: string; modellen: BatterijModel[] };

export type BatterijmodellenBestand = {
  gegenereerdOp: string;
  gecontroleerdOp: string;
  modellen: (BatterijModel & {
    /** bruikbaarKwh / capaciteitKwh, of null als de bruikbare capaciteit niet bekend is. */
    bruikbaarAandeel: number | null;
    /** Eén vermogen voor een rekenhulp die laden en ontladen niet apart kent: het laagste van de twee die bekend zijn. */
    vermogenKw: number | null;
  })[];
};

export function bouwBatterijmodellen(cfg: BatterijmodellenConfig, nu: string): BatterijmodellenBestand {
  const ids = new Set<string>();
  for (const m of cfg.modellen) {
    const waar = m.id;
    if (ids.has(m.id)) throw new Error(`${waar}: id staat er twee keer in`);
    ids.add(m.id);
    if (!(m.capaciteitKwh > 0 && m.capaciteitKwh <= 100)) throw new Error(`${waar}: capaciteit moet tussen 0 en 100 kWh liggen`);
    if (m.bruikbaarKwh !== null && !(m.bruikbaarKwh > 0 && m.bruikbaarKwh <= m.capaciteitKwh)) throw new Error(`${waar}: bruikbare capaciteit moet tussen 0 en de capaciteit liggen`);
    for (const [naam, kw] of [["laadKw", m.laadKw], ["ontlaadKw", m.ontlaadKw]] as const) {
      if (kw !== null && !(kw > 0 && kw <= 30)) throw new Error(`${waar}: ${naam} moet tussen 0 en 30 kW liggen`);
    }
    if (m.rondeVerliesPct !== null && !(m.rondeVerliesPct >= 0 && m.rondeVerliesPct <= 50)) throw new Error(`${waar}: rondeVerliesPct moet tussen 0 en 50 liggen`);
    if (m.standbyW !== null && !(m.standbyW >= 0 && m.standbyW <= 200)) throw new Error(`${waar}: standbyW moet tussen 0 en 200 liggen`);
    if (!m.bronnen.length) throw new Error(`${waar}: minstens één bron nodig`);
  }
  const rond = (v: number, n: number) => Math.round(v * 10 ** n) / 10 ** n;
  return {
    gegenereerdOp: nu,
    gecontroleerdOp: cfg.gecontroleerdOp,
    modellen: [...cfg.modellen]
      .sort((a, b) => a.type.localeCompare(b.type) || a.merk.localeCompare(b.merk) || a.capaciteitKwh - b.capaciteitKwh)
      .map((m) => {
        const bekend = [m.laadKw, m.ontlaadKw].filter((v): v is number => v !== null);
        return {
          ...m,
          bruikbaarAandeel: m.bruikbaarKwh === null ? null : rond(m.bruikbaarKwh / m.capaciteitKwh, 3),
          vermogenKw: bekend.length ? Math.min(...bekend) : null,
        };
      }),
  };
}
