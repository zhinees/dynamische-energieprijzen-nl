// Grid operator (netbeheerder) per postcode, from the open small-consumer files ("kleinverbruiksgegevens")
// that each grid operator publishes, plus the periodic grid tariffs per operator.

import { inflateRawSync } from "node:zlib";

export type Categorie = "tm1x10" | "tm3x25" | "3x35";
export const CATEGORIEEN: Categorie[] = ["tm1x10", "tm3x25", "3x35"];

export interface Bedrag {
  bedragInclBtw: number;
  bedragExclBtw: number;
}

export interface NetbeheerderConfig {
  id: string;
  naam: string;
  geldigVanaf: string;
  tarieven: Record<Categorie, Bedrag>;
  bron: string;
  gecontroleerdOp: string;
  notitie?: string;
  openData?: { url: string; formaat: "csv" | "xlsx" };
}

export interface NetbeheerConfig {
  categorieen: Record<Categorie, string>;
  standaard: string;
  netbeheerders: NetbeheerderConfig[];
}

export interface NetbeheerBestand {
  gegenereerdOp: string;
  categorieen: Record<Categorie, string>;
  standaard: string;
  netbeheerders: Omit<NetbeheerderConfig, "openData" | "notitie">[];
}

export interface PostcodesBestand {
  gegenereerdOp: string;
  bronnen: { id: string; url: string }[];
  /** Grid operator for every postcode that is in neither list below. */
  standaard: string;
  /** Four-digit postcode areas per grid operator (the default operator is left out). */
  postcodes4: Record<string, string[]>;
  /** Six-character postcodes whose grid operator differs from that of their four-digit area. */
  uitzonderingen: Record<string, string>;
}

// --- Reading the files ---------------------------------------------------------------------------

/** Rows of a CSV file; the delimiter is a tab or a semicolon. Liander wraps whole lines in quotes. */
export function leesCsv(tekst: string): string[][] {
  const regels = tekst.replace(/^﻿/, "").split(/\r?\n/).filter((r) => r.trim());
  const scheiding = regels[0]?.includes("\t") ? "\t" : ";";
  return regels.map((r) => {
    const t = r.trim();
    const regel = t.startsWith('"') && t.endsWith('"') && !t.slice(1, -1).includes('"') ? t.slice(1, -1) : t;
    return regel.split(scheiding).map((c) => c.trim().replace(/^"(.*)"$/, "$1"));
  });
}

/** Files of a zip archive (enough for an .xlsx: stored or deflated entries). */
function unzip(buf: Buffer): Map<string, Buffer> {
  let eocd = buf.length - 22;
  while (eocd >= 0 && buf.readUInt32LE(eocd) !== 0x06054b50) eocd--;
  if (eocd < 0) throw new Error("geen zip-bestand");
  const aantal = buf.readUInt16LE(eocd + 10);
  let p = buf.readUInt32LE(eocd + 16);
  const uit = new Map<string, Buffer>();
  for (let i = 0; i < aantal; i++) {
    if (buf.readUInt32LE(p) !== 0x02014b50) throw new Error("zip: centrale map onleesbaar");
    const methode = buf.readUInt16LE(p + 10);
    const grootte = buf.readUInt32LE(p + 20);
    const naamLen = buf.readUInt16LE(p + 28), extraLen = buf.readUInt16LE(p + 30), commentLen = buf.readUInt16LE(p + 32);
    const lokaal = buf.readUInt32LE(p + 42);
    const naam = buf.toString("utf8", p + 46, p + 46 + naamLen);
    const start = lokaal + 30 + buf.readUInt16LE(lokaal + 26) + buf.readUInt16LE(lokaal + 28);
    const data = buf.subarray(start, start + grootte);
    if (methode === 0) uit.set(naam, data);
    else if (methode === 8) uit.set(naam, inflateRawSync(data));
    p += 46 + naamLen + extraLen + commentLen;
  }
  return uit;
}

const xmlTekst = (s: string) =>
  s.replace(/<[^>]+>/g, "").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, '"').replace(/&apos;/g, "'").replace(/&amp;/g, "&");

const kolomIndex = (letters: string) => [...letters].reduce((n, c) => n * 26 + c.charCodeAt(0) - 64, 0) - 1;

/** Rows of the largest sheet of an .xlsx file. Cells are placed by their reference, since empty cells are left out. */
export function leesXlsx(buf: Buffer): string[][] {
  const bestanden = unzip(buf);
  const gedeeld = [...(bestanden.get("xl/sharedStrings.xml")?.toString("utf8") ?? "").matchAll(/<si>([\s\S]*?)<\/si>/g)].map((m) => xmlTekst(m[1]));
  const bladen = [...bestanden.keys()].filter((n) => /^xl\/worksheets\/sheet\d+\.xml$/.test(n));
  if (!bladen.length) throw new Error("xlsx: geen werkblad");
  const blad = bladen.reduce((a, b) => (bestanden.get(b)!.length > bestanden.get(a)!.length ? b : a));
  const xml = bestanden.get(blad)!.toString("utf8");
  const rijen: string[][] = [];
  for (const rij of xml.matchAll(/<row[^>]*>([\s\S]*?)<\/row>/g)) {
    const cellen: string[] = [];
    for (const c of rij[1].matchAll(/<c r="([A-Z]+)\d+"([^>]*?)(?:\/>|>([\s\S]*?)<\/c>)/g)) {
      const [, ref, attrs, inhoud = ""] = c;
      const v = inhoud.match(/<v>([\s\S]*?)<\/v>/)?.[1];
      const inline = inhoud.match(/<is>([\s\S]*?)<\/is>/)?.[1];
      cellen[kolomIndex(ref)] = /t="s"/.test(attrs) && v !== undefined ? gedeeld[Number(v)] ?? "" : xmlTekst(v ?? inline ?? "");
    }
    rijen.push(Array.from(cellen, (c) => c ?? ""));
  }
  return rijen;
}

const sleutel = (kop: string) => kop.toLowerCase().replace(/[^a-z]/g, "");

/** Postcode ranges [from, to] of the electricity rows. Column names differ per grid operator. */
export function stroomBereiken(rijen: string[][]): [string, string][] {
  const kop = (rijen[0] ?? []).map(sleutel);
  const zoek = (...namen: string[]) => {
    const i = kop.findIndex((k) => namen.includes(k));
    if (i === -1) throw new Error(`kolom ${namen.join("/")} niet gevonden in ${kop.join(", ")}`);
    return i;
  };
  const van = zoek("postcodevan", "postcode"), tot = zoek("postcodetot", "postcodeeind"), soort = zoek("productsoort");
  return rijen.slice(1).filter((r) => r[soort]?.trim().toUpperCase() === "ELK").map((r) => [r[van], r[tot]]);
}

// --- Postcodes -----------------------------------------------------------------------------------

const LETTERS = "ABCDEFGHIJKLMNOPQRSTUVWXYZ";
const POSTCODE = /^([1-9]\d{3})\s?([A-Z]{2})$/;

export const normaliseer = (pc: string) => {
  const m = pc.trim().toUpperCase().match(POSTCODE);
  return m ? m[1] + m[2] : undefined;
};

const naarGetal = (pc: string) => Number(pc.slice(0, 4)) * 676 + LETTERS.indexOf(pc[4]) * 26 + LETTERS.indexOf(pc[5]);
const naarPostcode = (n: number) => `${Math.floor(n / 676)}${LETTERS[Math.floor((n % 676) / 26)]}${LETTERS[n % 26]}`;

/** All six-character postcodes from `van` to `tot`; letter combinations that do not exist do no harm. */
export function breidUit(van: string, tot: string): string[] {
  const a = normaliseer(van), b = normaliseer(tot) ?? a;
  if (!a || !b) return [];
  const [x, y] = [naarGetal(a), naarGetal(b)];
  if (y < x || y - x > 5000) return [a]; // nonsense range: keep the start only
  return Array.from({ length: y - x + 1 }, (_, i) => naarPostcode(x + i));
}

/** Four-digit areas covered by the ranges, including areas a range runs through. */
export function gebiedenIn(bereiken: Iterable<[string, string][]>): string[] {
  const uit = new Set<string>();
  for (const lijst of bereiken) for (const [van, tot] of lijst) for (const pc of breidUit(van, tot)) uit.add(pc.slice(0, 4));
  return [...uit].sort();
}

const meest = (telling: Map<string, number>) => [...telling].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))[0]?.[0];

/**
 * Build the lookup table.
 * - `bereiken`: electricity postcode ranges per grid operator (the default operator has none).
 * - `bestaand`: the six-character postcodes that exist per four-digit area (from PDOK), for the areas
 *   that appear in any file. Without this list for an area, the area goes to the operator with the most
 *   postcodes in it.
 *
 * Postcodes that no file mentions are mostly new streets or business-only postcodes; they get the
 * operator of their area. In areas of the operators in `grens`, a long run of consecutive missing postcodes
 * (`reeks` or more) is the default operator's instead: the border with Enexis, which publishes no file.
 * Elsewhere such runs are mostly business parks and new streets, so they follow the area as well.
 */
export function bouwPostcodes(
  bereiken: Map<string, [string, string][]>,
  bestaand: Map<string, string[]>,
  standaard: string,
  grens: Set<string> = new Set(),
  reeks = 10,
): Pick<PostcodesBestand, "postcodes4" | "uitzonderingen"> {
  // Ranges merge postcodes for privacy and can skip over another operator's postcodes, so only a range's
  // first and last postcode are certain; the ones in between only count towards their area.
  const perPostcode = new Map<string, Set<string>>();
  const zeker = new Map<string, Set<string>>();
  const voeg = (m: Map<string, Set<string>>, pc: string, id: string) => (m.get(pc) ?? m.set(pc, new Set()).get(pc)!).add(id);
  for (const [id, lijst] of bereiken) {
    for (const [van, tot] of lijst) {
      const alle = breidUit(van, tot);
      for (const pc of alle) voeg(perPostcode, pc, id);
      for (const pc of new Set([alle[0], alle.at(-1)])) if (pc) voeg(zeker, pc, id);
    }
  }
  const perGebied = new Map<string, Map<string, number>>(); // pc4 → operator → number of postcodes in the files
  for (const [pc, ids] of perPostcode) {
    const telling = perGebied.get(pc.slice(0, 4)) ?? perGebied.set(pc.slice(0, 4), new Map()).get(pc.slice(0, 4))!;
    for (const id of ids) telling.set(id, (telling.get(id) ?? 0) + 1);
  }

  const postcodes4: Record<string, string[]> = {};
  const uitzonderingen: Record<string, string> = {};
  for (const [pc4, telling] of [...perGebied].sort((a, b) => a[0].localeCompare(b[0]))) {
    const lijst = bestaand.get(pc4);
    let hoofd: string;
    if (lijst?.length) {
      // Operator per existing postcode; where ranges of two operators overlap, the larger one in this area wins.
      const van = new Map([...lijst].sort().map((pc) => {
        const ids = [...(perPostcode.get(pc) ?? [])];
        return [pc, ids.sort((a, b) => (telling.get(b) ?? 0) - (telling.get(a) ?? 0) || a.localeCompare(b))[0]] as const;
      }));
      const tel = (mee: (pc: string, id: string | undefined) => boolean) => {
        const n = new Map<string, number>();
        for (const [pc, id] of van) if (mee(pc, id)) n.set(id ?? standaard, (n.get(id ?? standaard) ?? 0) + 1);
        return n;
      };
      const bekend = meest(tel((_, id) => !!id));
      // Next to Enexis: missing postcodes in a long run are the default operator's.
      const postcodes = [...van.keys()];
      const inReeks = new Set<string>();
      for (let i = 0; bekend && grens.has(bekend) && i < postcodes.length; ) {
        let j = i;
        while (j < postcodes.length && !van.get(postcodes[j])) j++;
        if (j - i >= reeks) postcodes.slice(i, j).forEach((pc) => inReeks.add(pc));
        i = Math.max(j, i + 1);
      }
      hoofd = meest(tel((pc, id) => !!id || inReeks.has(pc))) ?? standaard;
      for (const [pc, id] of van) {
        const wordt = id ?? (inReeks.has(pc) ? standaard : hoofd);
        if (wordt === hoofd || (id && !zeker.get(pc)?.has(id))) continue;
        uitzonderingen[pc] = wordt;
      }
    } else hoofd = meest(telling)!;
    if (hoofd !== standaard) (postcodes4[hoofd] ??= []).push(pc4);
  }
  return { postcodes4, uitzonderingen };
}

/** Grid operator for a postcode: a six-character postcode uses the exceptions, four digits only the area. */
export function netbeheerderVoor(tabel: Pick<PostcodesBestand, "standaard" | "postcodes4" | "uitzonderingen">, postcode: string): string | undefined {
  const pc = postcode.trim().toUpperCase().replace(/\s/g, "");
  if (!/^[1-9]\d{3}([A-Z]{2})?$/.test(pc)) return undefined;
  if (pc.length === 6 && tabel.uitzonderingen[pc]) return tabel.uitzonderingen[pc];
  for (const [id, lijst] of Object.entries(tabel.postcodes4)) if (lijst.includes(pc.slice(0, 4))) return id;
  return tabel.standaard;
}

/** Published tariff file: the config without the internal fields. */
export function bouwNetbeheer(cfg: NetbeheerConfig, nu: string): NetbeheerBestand {
  for (const n of cfg.netbeheerders) {
    for (const c of CATEGORIEEN) {
      const b = n.tarieven[c];
      if (!b) throw new Error(`${n.id}: tarief ${c} ontbreekt`);
      const verhouding = b.bedragInclBtw / b.bedragExclBtw;
      if (Math.abs(verhouding - 1.21) > 0.002) throw new Error(`${n.id} ${c}: incl. en excl. btw verschillen geen 21% (${verhouding.toFixed(4)})`);
    }
    if (!(n.tarieven.tm1x10.bedragInclBtw < n.tarieven.tm3x25.bedragInclBtw && n.tarieven.tm3x25.bedragInclBtw < n.tarieven["3x35"].bedragInclBtw)) {
      throw new Error(`${n.id}: tarieven lopen niet op met de aansluiting`);
    }
  }
  if (!cfg.netbeheerders.some((n) => n.id === cfg.standaard)) throw new Error(`standaard "${cfg.standaard}" is geen netbeheerder`);
  return {
    gegenereerdOp: nu,
    categorieen: cfg.categorieen,
    standaard: cfg.standaard,
    netbeheerders: cfg.netbeheerders.map(({ openData: _o, notitie: _n, ...rest }) => rest),
  };
}
