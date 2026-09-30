// Watch pages and pdfs of suppliers that have no automatic source, so a maintainer only has
// to look when something actually changed.
//
// For each watched URL we keep its visible text, one sentence per line, in data/bewaakt/.
// On the next run we compare: lines that disappeared or appeared are reported.

import { USER_AGENT } from "./pagina-ophalen.ts";
import { pdfRegels } from "./pdf.ts";
import type { Bewaking, LeverancierConfig } from "./typen.ts";
import { htmlNaarTekst } from "./uitlezen.ts";

/** Visible text as sentences, one per line, without blank lines. */
export function zinnen(tekst: string): string[] {
  return tekst
    .replace(/##/g, "\n")
    .split(/\n|(?<=[.!?])\s+(?=[A-Z0-9€(])/)
    .map((z) => z.replace(/\s+/g, " ").trim())
    .filter(Boolean);
}

/** The text to compare: sentences, optionally only those matching the filter. */
export function bewaakteTekst(regels: string[], filter?: string): string {
  const re = filter ? new RegExp(filter, "i") : undefined;
  return regels.flatMap(zinnen).filter((z) => !re || re.test(z)).join("\n") + "\n";
}

export interface Verschil {
  weg: string[];
  erbij: string[];
}

/** Lines that disappeared and appeared (order kept, duplicates counted). */
export function verschil(oud: string, nieuw: string): Verschil {
  const tel = (tekst: string) => {
    const m = new Map<string, number>();
    for (const r of tekst.split("\n").filter(Boolean)) m.set(r, (m.get(r) ?? 0) + 1);
    return m;
  };
  const alleenIn = (a: string, b: Map<string, number>) => {
    const over = new Map(b);
    return a.split("\n").filter(Boolean).filter((r) => {
      const n = over.get(r) ?? 0;
      if (n > 0) {
        over.set(r, n - 1);
        return false;
      }
      return true;
    });
  };
  return { weg: alleenIn(oud, tel(nieuw)), erbij: alleenIn(nieuw, tel(oud)) };
}

/** File name under data/bewaakt/ for a watched URL. */
export function bestandsnaam(id: string, url: string): string {
  const u = new URL(url);
  const pad = decodeURIComponent(u.pathname).replace(/\.[a-z]+$/i, "").replace(/[^a-z0-9]+/gi, "-").replace(/^-|-$/g, "").toLowerCase();
  return `${id}--${pad || "home"}.txt`;
}

async function haalRegels(url: string): Promise<string[]> {
  const res = await fetch(url, { headers: { "user-agent": USER_AGENT, "accept-language": "nl-NL,nl;q=0.9" }, redirect: "follow", signal: AbortSignal.timeout(30_000) });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const pdf = /pdf/i.test(res.headers.get("content-type") ?? "") || /\.pdf($|\?)/i.test(url);
  return pdf ? pdfRegels(new Uint8Array(await res.arrayBuffer())) : [htmlNaarTekst(await res.text())];
}

export interface Uitkomst {
  id: string;
  naam: string;
  bewaking: Bewaking;
  bestand: string;
  status: "gelijk" | "gewijzigd" | "nieuw" | "fout";
  verschil?: Verschil;
  fout?: string;
  tekst?: string;
}

/** Fetch every watched URL and compare with the saved text. `vorige` maps file name -> saved text. */
export async function bewaak(configs: LeverancierConfig[], vorige: Map<string, string>): Promise<Uitkomst[]> {
  const uit: Uitkomst[] = [];
  for (const cfg of configs) {
    for (const bewaking of cfg.bewaken ?? []) {
      const bestand = bestandsnaam(cfg.id, bewaking.url);
      const basis = { id: cfg.id, naam: cfg.naam, bewaking, bestand };
      try {
        const tekst = bewaakteTekst(await haalRegels(bewaking.url), bewaking.filter);
        if (tekst.trim() === "") throw new Error("geen tekst gevonden (pagina leeg of filter te streng)");
        const oud = vorige.get(bestand);
        if (oud === undefined) uit.push({ ...basis, status: "nieuw", tekst });
        else if (oud === tekst) uit.push({ ...basis, status: "gelijk", tekst });
        else uit.push({ ...basis, status: "gewijzigd", tekst, verschil: verschil(oud, tekst) });
      } catch (e) {
        uit.push({ ...basis, status: "fout", fout: (e as Error).message });
      }
    }
  }
  return uit;
}

/** Markdown report. A heading starting with "## 🔔" means something changed (the workflow opens an issue on that). */
export function rapport(uitkomsten: Uitkomst[], datum: string): string {
  const regels = [
    "# Bewaking",
    "",
    `Gemaakt door \`npm run bewaken\` op ${datum}. Bewaakt pagina's en pdf's van leveranciers zonder automatische bron (zie \`bewaken\` in \`leveranciers/<id>.json\`). 🔔 gewijzigd: controleer de tarieven en werk \`handmatig\` bij · ✓ ongewijzigd · 🆕 voor het eerst opgeslagen · ⚠️ ophalen mislukt.`,
    "",
  ];
  for (const u of uitkomsten) {
    const teken = { gelijk: "✓", gewijzigd: "🔔", nieuw: "🆕", fout: "⚠️" }[u.status];
    regels.push(`## ${teken} ${u.naam}: ${u.bewaking.omschrijving}`, "", `<${u.bewaking.url}> · opgeslagen in \`data/bewaakt/${u.bestand}\``, "");
    if (u.fout) regels.push(`Fout: ${u.fout}`, "");
    if (u.verschil) {
      regels.push("```diff", ...u.verschil.weg.map((r) => `- ${r}`), ...u.verschil.erbij.map((r) => `+ ${r}`), "```", "");
    }
  }
  if (!uitkomsten.length) regels.push("Geen leveranciers met `bewaken`.", "");
  return regels.join("\n");
}
