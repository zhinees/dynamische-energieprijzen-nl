// Zonopnaam Energie: read dynamic tariffs from the monthly tariff sheet (pdf) on its own site.
//
// Zonopnaam has no calculator API. It publishes one "Tarievenblad … Dynamisch" pdf per month on
// its tariff page. We take the sheet for the current month (or the newest older one when the new
// month's sheet is not there yet), read its text with pdf.js and use the rows "Dynamisch tarief"
// and "Vaste leveringskosten per dag", first for electricity, then for gas. The sheet lists the
// amounts excl. btw; for the fixed costs it also gives the total incl. btw.
// No address needed: the sheet applies to every small connection.

import { getDocument, VerbosityLevel } from "pdfjs-dist/legacy/build/pdf.mjs";
import { USER_AGENT } from "../lib/pagina-ophalen.ts";
import { vandaagLokaal } from "../lib/tijd.ts";
import type { Rekentoolresultaat } from "./index.ts";

export const TARIEFPAGINA = "https://www.zonopnaam.nl/tarieven";
const DAGEN_PER_MAAND = 365 / 12;

async function haal(url: string): Promise<Response> {
  const res = await fetch(url, { headers: { "user-agent": USER_AGENT }, signal: AbortSignal.timeout(30_000) });
  if (!res.ok) throw new Error(`Zonopnaam HTTP ${res.status} voor ${url}`);
  return res;
}

/** The dynamic tariff sheet for the month of `vandaag` (YYYY-MM-DD), else the newest older one; highest version wins. */
export function kiesTarievenblad(html: string, vandaag: string): string {
  const huidig = Number(vandaag.slice(0, 4)) * 12 + Number(vandaag.slice(5, 7));
  const bladen = [...html.matchAll(/href="([^"]*ZON_Tarievenblad_(\d{4})M(\d{1,2})_Dynamisch_V(\d+)[^"]*\.pdf)"/gi)]
    .map((m) => ({ url: new URL(m[1], TARIEFPAGINA).href, maand: Number(m[2]) * 12 + Number(m[3]), versie: Number(m[4]) }))
    .filter((b) => b.maand <= huidig)
    .sort((a, b) => b.maand - a.maand || b.versie - a.versie);
  if (!bladen.length) throw new Error("geen tarievenblad Dynamisch gevonden op de tariefpagina");
  return bladen[0].url;
}

/** The pdf's text as lines (items on the same height, left to right), page by page. */
export async function pdfRegels(data: Uint8Array): Promise<string[]> {
  // pdf.js takes over (detaches) the buffer it gets, so give it a copy.
  const doc = await getDocument({ data: data.slice(), verbosity: VerbosityLevel.ERRORS }).promise;
  const regels: string[] = [];
  for (let i = 1; i <= doc.numPages; i++) {
    const inhoud = await (await doc.getPage(i)).getTextContent();
    const perHoogte = new Map<number, { x: number; tekst: string }[]>();
    for (const item of inhoud.items) {
      if (!("str" in item) || !item.str) continue;
      const y = Math.round(item.transform[5]);
      if (!perHoogte.has(y)) perHoogte.set(y, []);
      perHoogte.get(y)!.push({ x: item.transform[4], tekst: item.str });
    }
    for (const [, delen] of [...perHoogte].sort((a, b) => b[0] - a[0]))
      regels.push(delen.sort((a, b) => a.x - b.x).map((d) => d.tekst).join(" ").replace(/\s+/g, " ").trim());
  }
  await doc.loadingTask.destroy();
  return regels;
}

/** Euro amounts in a line. The pdf splits numbers into pieces ("€ 0, 21736"), so join the digits. */
export function bedragen(regel: string): number[] {
  return regel
    .split("€")
    .slice(1)
    .map((deel) => Number(deel.match(/^[\s\d,]*/)![0].replace(/\s/g, "").replace(",", ".")))
    .filter((n) => Number.isFinite(n) && n > 0);
}

function binnen(n: number | undefined, min: number, max: number, wat: string): number {
  if (n === undefined || !(n >= min && n <= max)) throw new Error(`${wat} niet gevonden of onwaarschijnlijk (${n})`);
  return n;
}

const r6 = (n: number) => Math.round(n * 1e6) / 1e6;

export function leesZonopnaam(regels: string[]): Rekentoolresultaat {
  const tarief = regels.filter((r) => /^Dynamisch tarief\b/i.test(r)).map(bedragen);
  const vast = regels.filter((r) => /^Vaste leveringskosten per dag\b/i.test(r)).map(bedragen);
  if (tarief.length < 2 || vast.length < 2) throw new Error("rijen 'Dynamisch tarief' en 'Vaste leveringskosten per dag' niet gevonden voor stroom en gas");

  const uit: Rekentoolresultaat = {};
  uit.stroomInkoopopslag = { waarde: binnen(tarief[0][0], 0.001, 0.1, "inkoopvergoeding stroom"), inclBtw: false };
  uit.gasInkoopopslag = { waarde: binnen(tarief[1][0], 0.001, 0.3, "inkoopvergoeding gas"), inclBtw: false };
  for (const [veld, rij, wat] of [["stroomVastPerMaand", vast[0], "vaste kosten stroom"], ["gasVastPerMaand", vast[1], "vaste kosten gas"]] as const) {
    const excl = binnen(rij[0], 0.05, 1, `${wat} per dag`);
    const incl = binnen(rij.at(-1), 0.05, 1.3, `${wat} per dag incl. btw`);
    // The last amount is the total incl. btw; check it really is excl. × 1.21.
    if (Math.abs(excl * 1.21 - incl) > 0.001) throw new Error(`${wat}: € ${excl} excl. en € ${incl} incl. btw passen niet bij 21% btw`);
    uit[veld] = { waarde: r6(excl * DAGEN_PER_MAAND), inclBtw: false, waardeInclBtw: r6(incl * DAGEN_PER_MAAND) };
  }
  return uit;
}

export async function haalZonopnaam(nu = Date.now()): Promise<Rekentoolresultaat> {
  const url = kiesTarievenblad(await (await haal(TARIEFPAGINA)).text(), vandaagLokaal(nu));
  const pdf = new Uint8Array(await (await haal(url)).arrayBuffer());
  return leesZonopnaam(await pdfRegels(pdf));
}
