// Publish the omslagpunten (data/omslagpunten.json + OMSLAGPUNTEN.md) and keep a history
// entry each time one of them moves because of new tariffs.

import { join } from "node:path";
import { DATA, leesJson, schrijfJsonAlsGewijzigd, schrijfTekst } from "./bestanden.ts";
import { berekenOmslagpunten, berekenTerugleveromslag, productkosten, type Omslagpunten, type Product, type Terugleveromslag } from "./jaarkosten.ts";
import type { LeveranciersBestand } from "./typen.ts";

const EENHEID: Record<Product, string> = { stroom: "kWh", gas: "m³" };

export interface Geschiedenisregel {
  datum: string;
  stroom: { omslagpunt: number | null; goedkoopste: { vanaf: number; tot: number | null; id: string }[] };
  gas: { omslagpunt: number | null; goedkoopste: { vanaf: number; tot: number | null; id: string }[] };
  teruglevering: { omslagpunt: number | null };
}

const samenvatting = (o: Omslagpunten): Geschiedenisregel["stroom"] => ({
  omslagpunt: o.omslagpunt,
  goedkoopste: o.goedkoopstePerVerbruik.map(({ vanaf, tot, id }) => ({ vanaf, tot, id })),
});

const eur = (n: number, dec = 2) => `€ ${n.toLocaleString("nl-NL", { minimumFractionDigits: dec, maximumFractionDigits: dec })}`;
const getal = (n: number) => n.toLocaleString("nl-NL");

function markdown(
  per: Record<Product, Omslagpunten>,
  terug: Terugleveromslag,
  namen: Map<string, string>,
  geschiedenis: Geschiedenisregel[],
  datum: string,
): string {
  const vorige = geschiedenis.at(-2);
  const regels = [
    "# Omslagpunten",
    "",
    `Berekend op ${datum} uit [\`leveranciers.json\`](leveranciers.json), bij elke nieuwe tariefwijziging opnieuw. Alle bedragen zijn inclusief btw.`,
    "",
    "Alleen het deel van de rekening dat per leverancier verschilt telt mee: **vaste kosten × 12 + verbruik × inkoopopslag** (met zonnepanelen ook **− teruglevering × terugleverCorrectie**, zie onderaan). Marktprijs, energiebelasting en netbeheerkosten zijn bij iedereen gelijk en veranderen een omslagpunt dus niet. Leveranciers die hun vaste kosten of opslag niet publiceren, tellen niet mee.",
    "",
    "Reken je eigen situatie door met `npm run rekenhulp -- --stroom 2500 --gas 1000`.",
    "",
  ];
  for (const product of ["stroom", "gas"] as Product[]) {
    const o = per[product];
    const e = EENHEID[product];
    const was = vorige?.[product].omslagpunt;
    const verandering =
      vorige && was !== o.omslagpunt ? ` (was ${was == null ? "onbekend" : `${getal(was)} ${e}`} op ${vorige.datum})` : "";
    regels.push(
      `## ${product === "stroom" ? "Stroom" : "Gas"}`,
      "",
      `- Vaste kosten: ${eur(o.vastPerJaar.min)} – ${eur(o.vastPerJaar.max)} per jaar (verschil ${eur(o.vastPerJaar.max - o.vastPerJaar.min)})`,
      `- Inkoopopslag: ${eur(o.opslag.min, 4)} – ${eur(o.opslag.max, 4)} per ${e} (verschil ${eur(o.opslag.max - o.opslag.min, 4)})`,
      `- **Omslagpunt: ${o.omslagpunt === null ? "onbekend" : `${getal(o.omslagpunt)} ${e} per jaar`}**${verandering}. Onder dit verbruik wegen de verschillen in vaste kosten zwaarder, erboven de verschillen in opslag.`,
      "",
      "Goedkoopste leverancier per jaarverbruik:",
      "",
      `| Verbruik (${e}/jaar) | Goedkoopste |`,
      "| --- | --- |",
      ...o.goedkoopstePerVerbruik.map((t) => `| ${t.tot === null ? `${getal(t.vanaf)} en meer` : `${getal(t.vanaf)} – ${getal(t.tot)}`} | ${t.naam} |`),
      "",
    );
    if (o.paren.length) {
      regels.push(
        "Omslagpunt per paar (onder het omslagpunt is de eerste goedkoper, erboven de tweede):",
        "",
        `| Lagere vaste kosten | Lagere opslag | Omslagpunt (${e}/jaar) |`,
        "| --- | --- | --- |",
        ...o.paren.map((p) => `| ${namen.get(p.lageVasteKosten)} | ${namen.get(p.lageOpslag)} | ${getal(p.omslagpunt)} |`),
        "",
      );
    }
  }
  const wasT = vorige?.teruglevering?.omslagpunt;
  regels.push(
    "## Teruglevering (zonnepanelen)",
    "",
    "Met zonnepanelen telt ook de `terugleverCorrectie` mee: per jaar betaal je *teruglevering × correctie* (negatief = kosten, positief = bonus). Bij een vaste hoeveelheid teruglevering werkt dat als een extra vast bedrag per jaar, dus het verschuift de omslagpunten van stroom.",
    "",
    `- terugleverCorrectie: ${eur(terug.correctie.min, 4)} – ${eur(terug.correctie.max, 4)} per kWh (verschil ${eur(terug.correctie.max - terug.correctie.min, 4)})`,
    `- **Omslagpunt: ${terug.omslagpunt === null ? "onbekend" : `${getal(terug.omslagpunt)} kWh teruglevering per jaar`}**${
      vorige && wasT !== undefined && wasT !== terug.omslagpunt ? ` (was ${wasT === null ? "onbekend" : `${getal(wasT)} kWh`} op ${vorige.datum})` : ""
    }. Lever je meer terug, dan wegen de verschillen in terugleverCorrectie zwaarder dan de verschillen in vaste kosten.`,
    "",
    "Goedkoopste stroomleverancier per verbruik, bij deze hoeveelheden teruglevering:",
    "",
    "| Teruglevering (kWh/jaar) | Verbruik (kWh/jaar) | Goedkoopste |",
    "| --- | --- | --- |",
    ...terug.scenarios.flatMap((sc) =>
      sc.goedkoopstePerVerbruik.map(
        (t) => `| ${getal(sc.teruglevering)} | ${t.tot === null ? `${getal(t.vanaf)} en meer` : `${getal(t.vanaf)} – ${getal(t.tot)}`} | ${t.naam} |`,
      ),
    ),
    "",
  );
  if (geschiedenis.length > 1) {
    regels.push(
      "## Geschiedenis",
      "",
      "| Datum | Omslagpunt stroom | Omslagpunt gas | Omslagpunt teruglevering |",
      "| --- | --- | --- | --- |",
      ...geschiedenis
        .slice()
        .reverse()
        .map(
          (g) =>
            `| ${g.datum} | ${g.stroom.omslagpunt === null ? "–" : `${getal(g.stroom.omslagpunt)} kWh`} | ${g.gas.omslagpunt === null ? "–" : `${getal(g.gas.omslagpunt)} m³`} | ${g.teruglevering?.omslagpunt == null ? "–" : `${getal(g.teruglevering.omslagpunt)} kWh`} |`,
        ),
      "",
    );
  }
  return regels.join("\n");
}

export async function publiceerOmslagpunten(
  lev: LeveranciersBestand,
  nu = new Date().toISOString(),
): Promise<Record<Product, Omslagpunten> & { teruglevering: Terugleveromslag }> {
  const per = {
    stroom: berekenOmslagpunten(productkosten(lev.leveranciers, "stroom")),
    gas: berekenOmslagpunten(productkosten(lev.leveranciers, "gas")),
  };
  const teruglevering = berekenTerugleveromslag(lev.leveranciers);

  await schrijfJsonAlsGewijzigd(join(DATA, "omslagpunten.json"), {
    $schema: "../schema/omslagpunten.schema.json",
    versie: 1,
    gegenereerdOp: nu,
    valuta: "EUR",
    btw: "inclusief",
    uitleg:
      "Alleen het deel dat per leverancier verschilt: vaste kosten x 12 + verbruik x inkoopopslag - teruglevering x terugleverCorrectie, incl. btw. Omslagpunten zijn in kWh (stroom, teruglevering) of m3 (gas) per jaar.",
    ...per,
    teruglevering,
  });

  // History: one entry each time an omslagpunt or the cheapest-per-usage ranking changes.
  const pad = join(DATA, "omslagpunten-geschiedenis.json");
  const geschiedenis = (await leesJson<Geschiedenisregel[]>(pad)) ?? [];
  const nieuw: Geschiedenisregel = {
    datum: nu.slice(0, 10),
    stroom: samenvatting(per.stroom),
    gas: samenvatting(per.gas),
    teruglevering: { omslagpunt: teruglevering.omslagpunt },
  };
  const laatste = geschiedenis.at(-1);
  if (!laatste || JSON.stringify({ ...laatste, datum: "" }) !== JSON.stringify({ ...nieuw, datum: "" })) {
    geschiedenis.push(nieuw);
    await schrijfTekst(pad, JSON.stringify(geschiedenis, null, 2) + "\n");
  }

  const namen = new Map(lev.leveranciers.map((l) => [l.id, l.naam]));
  await schrijfTekst(join(DATA, "OMSLAGPUNTEN.md"), markdown(per, teruglevering, namen, geschiedenis, geschiedenis.at(-1)!.datum));
  return { ...per, teruglevering };
}
