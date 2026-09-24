// Energy tax (energiebelasting) from the Belastingdienst's tariff tables.
//
// The page has one table per tax, with a row per year: "2026 € 0,09161 € 0,09161 ...".
// The first column is the household bracket (stroom 0 t/m 2.900 kWh, gas 0 tot 1.000 m3;
// the next bracket up to 10.000 kWh / 170.000 m3 has the same rate). Amounts are excl. btw.

import { leesEuro } from "./uitlezen.ts";
import { inclBtw } from "./tarieven.ts";
import type { BelastingJaar, Belastingbedrag, EnergiebelastingBestand, EnergiebelastingConfig } from "./typen.ts";

/** Before 2023 the ODE surcharge was a separate tax, so the energy tax alone was not the full amount. */
export const EERSTE_JAAR = 2023;

const TABELLEN = {
  stroomPerKwh: { kop: "Belasting op elektriciteit", bereik: [0.03, 0.3] },
  gasPerM3: { kop: "Belasting op aardgas (normaal tarief)", bereik: [0.2, 1.5] },
  verminderingPerAansluitingPerJaar: { kop: "Belastingvermindering per elektriciteitsaansluiting", bereik: [100, 1500] },
} as const;

type Soort = keyof typeof TABELLEN;
export type Jaarwaarden = Record<Soort, number>;

/** The first amount in each year row of the table under heading `kop`. */
function leesTabel(tekst: string, kop: string): Map<number, number> {
  const start = tekst.indexOf(`## ${kop} ##`);
  if (start === -1) return new Map();
  const na = start + kop.length + 6;
  const einde = tekst.indexOf("##", na);
  const tabel = tekst.slice(na, einde === -1 ? undefined : einde);
  const uit = new Map<number, number>();
  for (const m of tabel.matchAll(/\b(20\d\d) € (\d{1,4}(?:\.\d{3})*,\d{2,5})/g)) {
    const bedrag = leesEuro(m[2]);
    if (bedrag !== null) uit.set(Number(m[1]), bedrag);
  }
  return uit;
}

/**
 * Read every year (from EERSTE_JAAR) that has all three rates. Throws when the page
 * no longer looks like the known tables, so a layout change is noticed instead of guessed.
 */
export function leesEnergiebelasting(tekst: string): Map<number, Jaarwaarden> {
  const tabellen = Object.fromEntries(
    Object.entries(TABELLEN).map(([soort, { kop }]) => [soort, leesTabel(tekst, kop)]),
  ) as Record<Soort, Map<number, number>>;
  for (const [soort, { kop }] of Object.entries(TABELLEN)) {
    if (!tabellen[soort as Soort].size) throw new Error(`tabel "${kop}" niet gevonden`);
  }
  const uit = new Map<number, Jaarwaarden>();
  for (const jaar of tabellen.stroomPerKwh.keys()) {
    if (jaar < EERSTE_JAAR) continue;
    const w = {} as Jaarwaarden;
    for (const [soort, { bereik }] of Object.entries(TABELLEN) as [Soort, (typeof TABELLEN)[Soort]][]) {
      const bedrag = tabellen[soort].get(jaar);
      if (bedrag === undefined) continue;
      if (bedrag < bereik[0] || bedrag > bereik[1]) throw new Error(`${soort} ${jaar}: € ${bedrag} valt buiten het verwachte bereik`);
      w[soort] = bedrag;
    }
    if (Object.keys(w).length === 3) uit.set(jaar, w);
  }
  if (!uit.size) throw new Error(`geen jaren vanaf ${EERSTE_JAAR} met alle drie de tarieven`);
  return uit;
}

const bedrag = (exclBtw: number): Belastingbedrag => ({ bedragInclBtw: inclBtw(exclBtw), bedragExclBtw: exclBtw });

/**
 * Build data/energiebelasting.json.
 * @param gelezen years read from the Belastingdienst page; undefined when fetching or reading failed
 * @param vorige  last published file, so values survive a failed run
 */
export function bouwEnergiebelasting(
  cfg: EnergiebelastingConfig,
  gelezen: Map<number, Jaarwaarden> | undefined,
  vorige: EnergiebelastingBestand | undefined,
  nu: string,
  fout?: string,
): EnergiebelastingBestand {
  const jaren: Record<string, BelastingJaar> = {};

  // Hand-checked values first, so they are there even if the page can't be read.
  for (const [jaar, h] of Object.entries(cfg.handmatig)) {
    if (h.geverifieerd !== true) continue; // only real, checked data is published
    jaren[jaar] = {
      stroomPerKwh: bedrag(h.stroomPerKwh),
      gasPerM3: bedrag(h.gasPerM3),
      verminderingPerAansluitingPerJaar: bedrag(h.verminderingPerAansluitingPerJaar),
      bron: "handmatig",
      bronUrl: h.bron,
      geverifieerd: true,
      sinds: `${h.gecontroleerdOp}T00:00:00Z`,
    };
  }

  // Values from an earlier successful run beat the hand-checked ones (same source, read automatically).
  if (!gelezen) {
    for (const [jaar, v] of Object.entries(vorige?.jaren ?? {})) if (v.bron === "website") jaren[jaar] = v;
  }

  for (const [jaar, w] of gelezen ?? []) {
    const oud = vorige?.jaren[jaar];
    const ongewijzigd =
      oud?.bron === "website" &&
      oud.stroomPerKwh.bedragExclBtw === w.stroomPerKwh &&
      oud.gasPerM3.bedragExclBtw === w.gasPerM3 &&
      oud.verminderingPerAansluitingPerJaar.bedragExclBtw === w.verminderingPerAansluitingPerJaar;
    jaren[jaar] = {
      stroomPerKwh: bedrag(w.stroomPerKwh),
      gasPerM3: bedrag(w.gasPerM3),
      verminderingPerAansluitingPerJaar: bedrag(w.verminderingPerAansluitingPerJaar),
      bron: "website",
      bronUrl: cfg.tariefUrl,
      geverifieerd: true,
      sinds: ongewijzigd ? oud!.sinds : nu,
      laatstGecontroleerd: nu,
    };
  }

  return {
    $schema: "../schema/energiebelasting.schema.json",
    versie: 1,
    gegenereerdOp: nu,
    valuta: "EUR",
    jaren: Object.fromEntries(Object.entries(jaren).sort(([a], [b]) => a.localeCompare(b))),
    ...(fout ? { ophaalfout: fout } : {}),
  };
}
