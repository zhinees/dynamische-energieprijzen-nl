// Scrape supplier tariffs and write data/leveranciers.json (+ .csv, report, change log).
//
//   node src/leveranciers-scrapen.ts            # all suppliers
//   node src/leveranciers-scrapen.ts --offline  # no network: rebuild from handmatig values (used in CI)

import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { sluitBrowser, haalPaginaTekst } from "./lib/pagina-ophalen.ts";
import { DATA, laadLeverancierConfigs, leesJson, schrijfJsonAlsGewijzigd, schrijfTekst } from "./lib/bestanden.ts";
import { bouwLeverancier, regelsVoor, urlsVoor } from "./lib/tarieven.ts";
import { REKENTOOLS, type Rekentoolresultaat } from "./rekentools/index.ts";
import { VELDEN, type Bron, type Leverancier, type LeverancierConfig, type LeveranciersBestand, type Veld } from "./lib/typen.ts";

const LEVERANCIERS_JSON = join(DATA, "leveranciers.json");
const WIJZIGINGEN_JSON = join(DATA, "tariefwijzigingen.json");

interface Wijziging {
  datum: string;
  leverancier: string;
  veld: Veld;
  vanInclBtw: number | null;
  naarInclBtw: number | null;
  bron: Bron;
}

function naarCsv(bestand: LeveranciersBestand): string {
  const kop = ["id", "naam", ...VELDEN.flatMap((k) => [`${k}_incl_btw`, `${k}_excl_btw`, `${k}_bron`, `${k}_geverifieerd`]), "automatisch_afschakelen", "tarief_url"];
  const esc = (v: unknown) => (/[",\n]/.test(String(v)) ? `"${String(v).replace(/"/g, '""')}"` : String(v ?? ""));
  const rijen = bestand.leveranciers.map((l) =>
    [
      l.id,
      l.naam,
      ...VELDEN.flatMap((k) => {
        const t = l.tarieven[k];
        return [t?.bedragInclBtw ?? "", t?.bedragExclBtw ?? "", t?.bron ?? "", t?.geverifieerd ?? ""];
      }),
      l.kenmerken.automatischAfschakelen,
      l.tariefUrl,
    ].map(esc).join(","),
  );
  return [kop.join(","), ...rijen].join("\n") + "\n";
}

function rapport(bestand: LeveranciersBestand, wachtend: string[] = []): string {
  const icoon = (l: Leverancier, k: Veld) => {
    const v = l.tarieven[k];
    if (!v) return "–";
    if (v.bron === "website") return "✅ website";
    if (v.bron === "rekentool") return "🧮 rekentool";
    if (v.laatsteFout) return "⚠️ uitlezen mislukt, handmatig";
    return "☑️ handmatig gecontroleerd";
  };
  const regels = [
    "# Scraperapport",
    "",
    "Gemaakt door `npm run leveranciers`. ✅ uitgelezen van de site van de leverancier · 🧮 uit de prijsrekentool van de leverancier (testadres) · ☑️ met de hand gecontroleerd op de site van de leverancier · ⚠️ uitlezen mislukt, de laatste handmatig gecontroleerde waarde wordt gebruikt · – niet beschikbaar. Alleen geverifieerde data wordt gepubliceerd.",
    "",
    `| Leverancier | ${VELDEN.join(" | ")} |`,
    `| --- | ${VELDEN.map(() => "---").join(" | ")} |`,
    ...bestand.leveranciers.map((l) => `| ${l.naam} | ${VELDEN.map((k) => icoon(l, k)).join(" | ")} |`),
    "",
  ];
  if (wachtend.length) {
    regels.push("## Nog niet gepubliceerd", "", "Nog geen geverifieerde tarieven (de reden staat in \$comment van het leveranciersbestand):", "", ...wachtend.map((n) => `- ${n}`), "");
  }
  const fouten = bestand.leveranciers.filter((l) => l.ophaalfout);
  if (fouten.length) {
    regels.push("## Ophaalfouten", "", ...fouten.map((l) => `- **${l.naam}**: ${l.ophaalfout}`), "");
  }
  return regels.join("\n");
}

async function main() {
  const offline = process.argv.includes("--offline");
  const configs = await laadLeverancierConfigs();
  const vorigBestand = await leesJson<LeveranciersBestand>(LEVERANCIERS_JSON);
  const vorigePerId = new Map(vorigBestand?.leveranciers.map((l) => [l.id, l]) ?? []);
  const nu = new Date().toISOString();

  const leveranciers: Leverancier[] = [];
  for (const cfg of configs) {
    const teksten = new Map<string, string>();
    const fouten: string[] = [];
    if (!offline) {
      for (const url of urlsVoor(cfg)) {
        try {
          teksten.set(url, await haalPaginaTekst(url, cfg.ophalen ?? "http"));
        } catch (e) {
          fouten.push((e as Error).message);
        }
      }
    }
    let rekentool: Rekentoolresultaat = {};
    if (!offline && cfg.rekentool) {
      const haal = REKENTOOLS[cfg.rekentool.adapter];
      try {
        if (!haal) throw new Error(`onbekende rekentool-adapter "${cfg.rekentool.adapter}"`);
        rekentool = await haal(cfg.rekentool.testadres);
      } catch (e) {
        fouten.push(`rekentool: ${(e as Error).message}`);
      }
    }
    // Offline: ignore scrape rules so no "fetch failed" errors are recorded.
    const rec = bouwLeverancier(offline ? { ...cfg, regels: {}, rekentool: undefined } : cfg, teksten, vorigePerId.get(cfg.id), nu, fouten, rekentool);
    const vanSite = Object.values(rec.tarieven).filter((v) => v?.bron === "website").length;
    const vanRekentool = Object.values(rec.tarieven).filter((v) => v?.bron === "rekentool").length;
    console.log(
      `${cfg.id.padEnd(12)} website ${vanSite}/${aantalMetRegels(cfg)}` +
        (cfg.rekentool ? `, rekentool ${vanRekentool}` : "") +
        (fouten.length ? "  FOUT " + fouten.join("; ") : ""),
    );
    leveranciers.push(rec);
  }
  await sluitBrowser();

  // Only publish suppliers with at least one real value.
  const wachtend = leveranciers.filter((l) => Object.keys(l.tarieven).length === 0);
  for (const l of wachtend) leveranciers.splice(leveranciers.indexOf(l), 1);

  const bestand: LeveranciersBestand = {
    $schema: "../schema/leveranciers.schema.json",
    versie: 1,
    gegenereerdOp: nu,
    valuta: "EUR",
    leveranciers,
  };

  // Change log: one entry each time a published value changes.
  const wijzigingen = (await leesJson<Wijziging[]>(WIJZIGINGEN_JSON)) ?? [];
  const eerder = wijzigingen.length;
  for (const l of leveranciers) {
    const vorige = vorigePerId.get(l.id);
    if (!vorige) continue;
    for (const k of VELDEN) {
      const a = vorige.tarieven[k]?.bedragInclBtw ?? null;
      const b = l.tarieven[k]?.bedragInclBtw ?? null;
      if (a !== b) wijzigingen.push({ datum: nu.slice(0, 10), leverancier: l.id, veld: k, vanInclBtw: a, naarInclBtw: b, bron: l.tarieven[k]?.bron ?? "handmatig" });
    }
  }

  const geschreven = await schrijfJsonAlsGewijzigd(LEVERANCIERS_JSON, bestand);
  if (geschreven) await schrijfTekst(join(DATA, "leveranciers.csv"), naarCsv(bestand));
  if (wijzigingen.length !== eerder) await schrijfTekst(WIJZIGINGEN_JSON, JSON.stringify(wijzigingen, null, 2) + "\n");

  const rap = rapport(bestand, wachtend.map((l) => l.naam));
  const oudRap = await readFile(join(DATA, "RAPPORT.md"), "utf8").catch(() => "");
  if (rap !== oudRap) await schrijfTekst(join(DATA, "RAPPORT.md"), rap);

  console.log(geschreven ? "leveranciers.json geschreven" : "leveranciers.json ongewijzigd");
}

function aantalMetRegels(cfg: LeverancierConfig) {
  return VELDEN.filter((k) => regelsVoor(cfg, k).length).length;
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
