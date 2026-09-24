import { leesVeldMetRegels } from "./uitlezen.ts";
import type { Rekentoolresultaat } from "../rekentools/index.ts";
import {
  EENHEDEN,
  VELDEN,
  type Leverancier,
  type LeverancierConfig,
  type Regel,
  type Tariefwaarde,
  type Veld,
} from "./typen.ts";

export const BTW = 0.21;
const r6 = (n: number) => Math.round(n * 1e6) / 1e6 + 0;
export const exclBtw = (n: number) => r6(n / (1 + BTW));
export const inclBtw = (n: number) => r6(n * (1 + BTW));

function relevant(cfg: LeverancierConfig, veld: Veld): boolean {
  if (veld.startsWith("gas")) return cfg.producten.gas;
  return cfg.producten.stroom;
}

export function regelsVoor(cfg: LeverancierConfig, veld: Veld): Regel[] {
  const r = cfg.regels[veld];
  return r ? (Array.isArray(r) ? r : [r]) : [];
}

/** Every URL we need to fetch for this supplier (tariefUrl + per-field overrides). */
export function urlsVoor(cfg: LeverancierConfig): string[] {
  const urls = new Set<string>();
  for (const veld of VELDEN) for (const regel of regelsVoor(cfg, veld)) urls.add(regel.url ?? cfg.tariefUrl);
  return [...urls];
}

function handmatigeWaarde(cfg: LeverancierConfig, veld: Veld, vorige?: Tariefwaarde): Tariefwaarde | undefined {
  const h = cfg.handmatig[veld];
  if (!h || h.geverifieerd !== true) return undefined; // only real, checked data is published
  const waarde = h.inclBtw ? exclBtw(h.waarde) : r6(h.waarde);
  // Keep the exact published amount incl. btw (converting back would drift in the last decimal).
  const waardeInclBtw =
    h.waardeInclBtw !== undefined ? (h.waardeInclBtw === null ? null : r6(h.waardeInclBtw)) : h.inclBtw ? r6(h.waarde) : inclBtw(waarde);
  const gecontroleerdOp = `${h.gecontroleerdOp}T00:00:00Z`;
  // Keep a newer scraped/rekentool value over an older handmatig one.
  if (vorige && vorige.bron !== "handmatig" && vorige.sinds && vorige.sinds > gecontroleerdOp) return undefined;
  return {
    waarde,
    waardeInclBtw,
    eenheid: EENHEDEN[veld],
    bron: "handmatig",
    geverifieerd: h.geverifieerd,
    sinds: gecontroleerdOp,
    bronUrl: h.bron.startsWith("http") ? h.bron : null,
  };
}

/**
 * Build one supplier's published record.
 * @param teksten   url -> page text (from htmlNaarTekst); missing url = fetch failed
 * @param vorige    last published record, so values survive a failed scrape
 * @param rekentool values from the supplier's price calculator (highest priority)
 */
export function bouwLeverancier(
  cfg: LeverancierConfig,
  teksten: Map<string, string>,
  vorige: Leverancier | undefined,
  nu: string,
  ophaalfouten: string[] = [],
  rekentool: Rekentoolresultaat = {},
): Leverancier {
  const tarieven: Leverancier["tarieven"] = {};

  for (const veld of VELDEN) {
    if (!relevant(cfg, veld)) continue;
    const vorigeWaarde = vorige?.tarieven[veld];

    const r = rekentool[veld];
    if (r) {
      const waarde = r.inclBtw ? exclBtw(r.waarde) : r6(r.waarde);
      const ongewijzigd = vorigeWaarde?.bron === "rekentool" && vorigeWaarde.waarde === waarde;
      tarieven[veld] = {
        waarde,
        waardeInclBtw: r.waardeInclBtw !== undefined ? r6(r.waardeInclBtw) : r.inclBtw ? r6(r.waarde) : inclBtw(waarde),
        eenheid: EENHEDEN[veld],
        bron: "rekentool",
        geverifieerd: true,
        sinds: ongewijzigd ? vorigeWaarde!.sinds : nu,
        laatstGecontroleerd: nu,
        bronUrl: cfg.tariefUrl,
      };
      continue;
    }

    const regels = regelsVoor(cfg, veld);
    let laatsteFout: string | undefined;

    if (regels.length) {
      // All rules of a field use the same URL group; try each rule against its page.
      let gelezen: Tariefwaarde | undefined;
      for (const regel of regels) {
        const url = regel.url ?? cfg.tariefUrl;
        const tekst = teksten.get(url);
        if (tekst === undefined) {
          laatsteFout = "pagina kon niet worden opgehaald";
          continue;
        }
        const res = leesVeldMetRegels(tekst, veld, regel);
        if (res.ok && res.waarde !== null) {
          const waarde = regel.inclBtw ? exclBtw(res.waarde) : res.waarde;
          const ongewijzigd = vorigeWaarde?.bron === "website" && vorigeWaarde.waarde === waarde;
          gelezen = {
            waarde,
            waardeInclBtw: regel.inclBtw ? r6(res.waarde) : inclBtw(waarde),
            eenheid: EENHEDEN[veld],
            bron: "website",
            geverifieerd: true,
            sinds: ongewijzigd ? vorigeWaarde!.sinds : nu,
            laatstGecontroleerd: nu,
            bronUrl: url,
          };
          break;
        }
        laatsteFout = res.reden;
      }
      if (gelezen) {
        tarieven[veld] = gelezen;
        continue;
      }
    }

    if (cfg.rekentool && !laatsteFout) laatsteFout = "rekentool gaf geen waarde";

    // Scrape failed or no rule: newest of (handmatig block, previous scraped value).
    const handmatig = handmatigeWaarde(cfg, veld, vorigeWaarde);
    const terugval = handmatig ?? (vorigeWaarde && vorigeWaarde.bron !== "handmatig" ? { ...vorigeWaarde } : undefined);
    if (terugval) {
      if (laatsteFout) terugval.laatsteFout = laatsteFout;
      else delete terugval.laatsteFout;
      tarieven[veld] = terugval;
    }
  }

  return {
    id: cfg.id,
    naam: cfg.naam,
    website: cfg.website,
    tariefUrl: cfg.tariefUrl,
    producten: cfg.producten,
    kenmerken: cfg.kenmerken,
    tarieven,
    laatstUitgevoerd: nu,
    ...(ophaalfouten.length ? { ophaalfout: ophaalfouten.join("; ") } : {}),
  };
}
