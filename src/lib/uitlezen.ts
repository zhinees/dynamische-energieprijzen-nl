import type { Regel, Veld } from "./typen.ts";

/** Turn an HTML page into one line of visible text. Headings become "## Title ##". */
export function htmlNaarTekst(html: string): string {
  return html
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<noscript[\s\S]*?<\/noscript>/gi, " ")
    .replace(/<h[1-6][^>]*>([\s\S]*?)<\/h[1-6]>/gi, " ## $1 ## ")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;|&#160;|&#xa0;/gi, " ")
    .replace(/&euro;|&#8364;|&#x20ac;/gi, "€")
    .replace(/&amp;/gi, "&")
    .replace(/&#(\d+);/g, (_, n) => String.fromCharCode(Number(n)))
    .replace(/\s+/g, " ")
    .trim();
}

/** "0,0182" / "0.0182" / "€ 7,25" / "1.234,56" -> number */
export function leesEuro(ruw: string): number | null {
  let s = ruw.replace(/[€\s]/g, "");
  if (s.includes(",") && s.includes(".")) s = s.replace(/\./g, "").replace(",", ".");
  else s = s.replace(",", ".");
  const n = Number(s);
  return Number.isFinite(n) ? n : null;
}

// Optional minus and €, digits, decimal separator, 1–5 decimals, optional "cent".
// "€ 0" (euro sign, no decimals) is allowed; bare integers like "2026" are not.
const BEDRAG = /(-?\s*€\s*\d{1,4}(?:[.,]\d{1,5})?|-?\d{1,4}[.,]\d{1,5})\s*(cent|ct)?/gi;

const STROOM = [/## [^#]*(stroom|elektriciteit)[^#]*##/i, /stroom|elektriciteit/i];
const GAS = [/## [^#]*\bgas\b[^#]*##/i, /\bgas\b/i];
const STANDAARD_SECTIE: Record<Veld, RegExp[] | null> = {
  stroomVastPerMaand: STROOM,
  stroomInkoopopslag: STROOM,
  gasVastPerMaand: GAS,
  gasInkoopopslag: GAS,
  terugleverCorrectie: null,
};

export interface Uitleesresultaat {
  ok: boolean;
  waarde: number | null;
  reden?: string;
  /** Text around the match, so a contributor can see what was read. */
  context?: string;
  /** Out-of-range candidates that were skipped (helps tune `bereik`). */
  afgewezen?: number[];
}

/** Try one rule or a list of rules; first success wins. */
export function leesVeldMetRegels(tekst: string, veld: Veld, regels: Regel | Regel[]): Uitleesresultaat & { regelIndex?: number } {
  const lijst = Array.isArray(regels) ? regels : [regels];
  let laatste: Uitleesresultaat = { ok: false, waarde: null, reden: "geen regels" };
  for (let i = 0; i < lijst.length; i++) {
    const r = leesVeld(tekst, veld, lijst[i]);
    if (r.ok) return { ...r, regelIndex: i };
    laatste = r;
  }
  return laatste;
}

export function leesVeld(tekst: string, veld: Veld, regel: Regel): Uitleesresultaat {
  const venster = regel.venster ?? 160;
  const ankers = regel.sectie ? [new RegExp(regel.sectie, "i")] : STANDAARD_SECTIE[veld];
  let start = 0;
  for (const re of ankers ?? []) {
    const m = re.exec(tekst);
    if (m) {
      start = m.index;
      break;
    }
  }
  // "ervoor" rules look left of the label, so keep `venster` characters before the section start.
  if (regel.ervoor) start = Math.max(0, start - venster);
  const bereikTekst = tekst.slice(start);
  const afgewezen: number[] = [];

  for (const label of regel.labels) {
    const re = new RegExp(label, "gi");
    let m: RegExpExecArray | null;
    while ((m = re.exec(bereikTekst))) {
      const vanaf = m.index + m[0].length;
      const kandidaten: { ruw: string; cent: boolean; op: number; lengte: number }[] = [];
      const gebied = regel.ervoor
        ? bereikTekst.slice(Math.max(0, m.index - venster), m.index)
        : bereikTekst.slice(vanaf, vanaf + venster);
      BEDRAG.lastIndex = 0;
      let a: RegExpExecArray | null;
      while ((a = BEDRAG.exec(gebied))) kandidaten.push({ ruw: a[1], cent: !!a[2], op: a.index, lengte: a[0].length });
      // Nearest to the label first.
      if (regel.ervoor) kandidaten.reverse();
      for (const k of kandidaten) {
        let waarde = leesEuro(k.ruw);
        if (waarde === null) continue;
        if (k.cent) waarde = waarde / 100; // "1,82 cent" -> 0.0182
        if (regel.negatief) waarde = -Math.abs(waarde);
        waarde = Math.round(waarde * 1e6) / 1e6 + 0; // + 0 turns -0 into 0
        const [min, max] = regel.bereik;
        if (waarde < min || waarde > max) {
          afgewezen.push(waarde);
          continue;
        }
        const ctxVan = regel.ervoor ? Math.max(0, m.index - venster) + k.op - 20 : m.index - 40;
        const ctxTot = regel.ervoor ? vanaf + 20 : vanaf + k.op + k.lengte + 20;
        return { ok: true, waarde, context: bereikTekst.slice(Math.max(0, ctxVan), ctxTot) };
      }
    }
  }
  return {
    ok: false,
    waarde: null,
    reden: afgewezen.length ? "alleen bedragen buiten het bereik gevonden" : "label niet gevonden of geen bedrag erna",
    afgewezen: afgewezen.length ? afgewezen.slice(0, 10) : undefined,
  };
}
