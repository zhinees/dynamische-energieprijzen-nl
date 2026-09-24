// Rank suppliers for your own yearly usage and estimate the year's bill. All amounts incl. btw.
//
//   node src/rekenhulp.ts --stroom 2500 --gas 1000
//   node src/rekenhulp.ts --stroom 3000 --teruglevering 2000   # with solar panels, no gas

import { readdir } from "node:fs/promises";
import { join } from "node:path";
import { DATA, leesJson } from "./lib/bestanden.ts";
import { berekenOmslagpunten, berekenTerugleveromslag, goedkoopstePerVerbruik, leverancierdelen, productkosten, type Product, type Verbruik } from "./lib/jaarkosten.ts";
import { plusDagen, vandaagLokaal } from "./lib/tijd.ts";
import type { Dagprijzen, EnergiebelastingBestand, LeveranciersBestand } from "./lib/typen.ts";

const args = process.argv.slice(2);
const optie = (naam: string) => {
  const i = args.indexOf(`--${naam}`);
  if (i === -1) return 0;
  const n = Number(String(args[i + 1] ?? "").replace(/\./g, "").replace(",", "."));
  if (!Number.isFinite(n) || n < 0) throw new Error(`--${naam} verwacht een getal, bijv. --${naam} 2500`);
  return n;
};
const verbruik: Verbruik = { stroom: optie("stroom"), gas: optie("gas"), teruglevering: optie("teruglevering") };
if (!verbruik.stroom && !verbruik.gas && !verbruik.teruglevering) {
  console.error("Gebruik: npm run rekenhulp -- --stroom <kWh per jaar> [--gas <m³ per jaar>] [--teruglevering <kWh per jaar>]");
  console.error("Voorbeeld: npm run rekenhulp -- --stroom 2500 --gas 1000");
  process.exit(1);
}

const lev = await leesJson<LeveranciersBestand>(join(DATA, "leveranciers.json"));
if (!lev) throw new Error("data/leveranciers.json ontbreekt; draai eerst npm run leveranciers");
const belasting = await leesJson<EnergiebelastingBestand>(join(DATA, "energiebelasting.json"));

const eur = (n: number | null, dec = 2) =>
  n === null ? "–" : `€ ${(Math.round(n * 10 ** dec) / 10 ** dec + 0).toLocaleString("nl-NL", { minimumFractionDigits: dec, maximumFractionDigits: dec })}`;
const getal = (n: number) => n.toLocaleString("nl-NL");

/** Average market price incl. btw over the stored days of the past year (unweighted: same usage every hour). */
async function gemiddeldeMarktprijs(): Promise<{ stroom: number | null; gas: number | null; dagen: number }> {
  const vanaf = plusDagen(vandaagLokaal(), -365);
  const stroom: number[] = [];
  const gas: number[] = [];
  let dagen = 0;
  for (const j of (await readdir(join(DATA, "prijzen")).catch(() => [] as string[])).filter((d) => /^\d{4}$/.test(d))) {
    for (const f of (await readdir(join(DATA, "prijzen", j))).filter((f) => f.endsWith(".json") && f.slice(0, 10) >= vanaf)) {
      const d = await leesJson<Dagprijzen>(join(DATA, "prijzen", j, f));
      if (!d) continue;
      dagen++;
      stroom.push(...(d.stroom?.perUur.map((p) => p.prijsInclBtw) ?? []));
      gas.push(...(d.gas?.perUur.map((p) => p.prijsInclBtw) ?? []));
    }
  }
  const gem = (a: number[]) => (a.length ? a.reduce((x, y) => x + y, 0) / a.length : null);
  return { stroom: gem(stroom), gas: gem(gas), dagen };
}

// 1. Ranking: only the part that differs per supplier.
const delen = leverancierdelen(lev.leveranciers, verbruik);
const volledig = delen.filter((d) => d.totaal !== null);
console.log(
  `\nJouw verbruik per jaar: ${[
    verbruik.stroom && `${getal(verbruik.stroom)} kWh stroom`,
    verbruik.gas && `${getal(verbruik.gas)} m³ gas`,
    verbruik.teruglevering && `${getal(verbruik.teruglevering)} kWh teruglevering`,
  ]
    .filter(Boolean)
    .join(", ")}\n`,
);
console.log("Wat je per jaar aan de leverancier kwijt bent bovenop de marktprijs (incl. btw):\n");
console.log(
  "  #  " + "leverancier".padEnd(31),
  "vaste kosten".padStart(12),
  "opslag stroom".padStart(13),
  "opslag gas".padStart(11),
  ...(verbruik.teruglevering ? ["teruglevering".padStart(13)] : []),
  "totaal".padStart(10),
  "verschil".padStart(9),
);
const goedkoopste = volledig[0]?.totaal ?? 0;
delen.forEach((d, i) => {
  const plek = d.totaal === null ? "   " : String(i + 1).padStart(3);
  console.log(
    `${plek}  ${d.naam.padEnd(31)}`,
    eur(d.vasteKosten).padStart(12),
    (verbruik.stroom ? eur(d.opslagStroom) : "").padStart(13),
    (verbruik.gas ? eur(d.opslagGas) : "").padStart(11),
    ...(verbruik.teruglevering ? [eur(d.teruglevering === null ? null : -d.teruglevering).padStart(13)] : []),
    (d.totaal === null ? "onvolledig" : eur(d.totaal)).padStart(10),
    (d.totaal === null ? "" : i === 0 ? "" : `+${eur(d.totaal - goedkoopste).slice(2)}`).padStart(9),
  );
});
const onvolledig = delen.filter((d) => d.totaal === null);
if (onvolledig.length) console.log(`\n  onvolledig = de leverancier publiceert niet alles wat nodig is: ${onvolledig.map((d) => `${d.naam} (${d.ontbreekt.join(", ")})`).join("; ")}`);
if (verbruik.teruglevering) console.log("  teruglevering = wat de leverancier rekent voor stroom die je teruglevert; negatief is een bonus. De marktwaarde van die stroom is bij iedereen gelijk.");

// 2. Where you are relative to the omslagpunten.
console.log("\nOmslagpunten:");
for (const [product, hoeveel, e] of [["stroom", verbruik.stroom, "kWh"], ["gas", verbruik.gas, "m³"]] as [Product, number, string][]) {
  if (!hoeveel) continue;
  const o = berekenOmslagpunten(productkosten(lev.leveranciers, product));
  if (o.omslagpunt !== null) {
    const kant = hoeveel < o.omslagpunt ? "onder" : "boven";
    const advies = hoeveel < o.omslagpunt ? "de vaste kosten wegen voor jou het zwaarst" : "de inkoopopslag weegt voor jou het zwaarst";
    console.log(`  ${product}: omslagpunt ${getal(o.omslagpunt)} ${e}. Je zit er ${kant}: ${advies}.`);
  }
  // For stroom, your own feed-in is part of the comparison: it acts as a fixed amount per year.
  const metTerug = product === "stroom" && verbruik.teruglevering > 0;
  const trajecten = metTerug ? goedkoopstePerVerbruik(productkosten(lev.leveranciers, product, verbruik.teruglevering)) : o.goedkoopstePerVerbruik;
  const t = trajecten.find((t) => hoeveel >= t.vanaf && (t.tot === null || hoeveel < t.tot));
  const volgende = t && trajecten[trajecten.indexOf(t) + 1];
  if (t) {
    console.log(
      `  ${product} los${metTerug ? ` (met ${getal(verbruik.teruglevering)} kWh teruglevering)` : ""}: ${t.naam} is het goedkoopst bij jouw verbruik` +
        (volgende ? `; vanaf ${getal(volgende.vanaf)} ${e} wordt ${volgende.naam} goedkoper.` : "."),
    );
  }
}
if (verbruik.teruglevering) {
  const tr = berekenTerugleveromslag(lev.leveranciers);
  if (tr.omslagpunt !== null) {
    const boven = verbruik.teruglevering >= tr.omslagpunt;
    console.log(
      `  teruglevering: omslagpunt ${getal(tr.omslagpunt)} kWh. Je zit er ${boven ? "boven" : "onder"}: ` +
        (boven ? "de terugleverkosten of -bonus wegen voor jou zwaarder dan de vaste kosten." : "de vaste kosten wegen voor jou zwaarder dan de terugleverkosten of -bonus."),
    );
  }
}

// 3. Estimated bill: market price, energy tax and the tax reduction added (no grid costs).
const markt = await gemiddeldeMarktprijs();
const jaar = vandaagLokaal().slice(0, 4);
const eb = belasting?.jaren[jaar];
const beste = volledig[0];
if (beste && eb && markt.dagen) {
  const stroomMarkt = verbruik.stroom && markt.stroom !== null ? verbruik.stroom * markt.stroom : 0;
  const gasMarkt = verbruik.gas && markt.gas !== null ? verbruik.gas * markt.gas : 0;
  const ebStroom = verbruik.stroom * eb.stroomPerKwh.bedragInclBtw;
  const ebGas = verbruik.gas * eb.gasPerM3.bedragInclBtw;
  const vermindering = verbruik.stroom || verbruik.teruglevering ? eb.verminderingPerAansluitingPerJaar.bedragInclBtw : 0;
  const totaal = beste.totaal! + stroomMarkt + gasMarkt + ebStroom + ebGas - vermindering;
  console.log(`\nGeschatte jaarrekening bij ${beste.naam} (incl. btw, zonder netbeheerkosten):`);
  if (verbruik.stroom) console.log(`  stroom marktprijs    ${eur(stroomMarkt).padStart(12)}   (gemiddeld ${eur(markt.stroom, 4)} per kWh)`);
  if (verbruik.gas) console.log(`  gas marktprijs       ${eur(gasMarkt).padStart(12)}   (gemiddeld ${eur(markt.gas, 4)} per m³)`);
  console.log(`  leverancier          ${eur(beste.totaal).padStart(12)}   (vaste kosten en opslag, zie boven)`);
  if (verbruik.stroom) console.log(`  energiebelasting     ${eur(ebStroom).padStart(12)}   (stroom, ${eur(eb.stroomPerKwh.bedragInclBtw, 5)} per kWh in ${jaar})`);
  if (verbruik.gas) console.log(`  energiebelasting     ${eur(ebGas).padStart(12)}   (gas, ${eur(eb.gasPerM3.bedragInclBtw, 5)} per m³ in ${jaar})`);
  if (vermindering) console.log(`  belastingvermindering ${eur(-vermindering).padStart(11)}   (per aansluiting van een woning)`);
  console.log(`  totaal               ${eur(totaal).padStart(12)}   ≈ ${eur(totaal / 12)} per maand`);
  console.log(
    `\n  De marktprijs is het gewone gemiddelde over de ${markt.dagen} dag(en) met prijzen in deze repo van het afgelopen jaar,` +
      `\n  alsof je elk uur evenveel gebruikt. Met weinig dagen is dat een ruwe schatting. Netbeheerkosten en de` +
      `\n  opbrengst van teruglevering (salderen tot 2027) zitten er niet in. Een negatief totaal kan: de belastingvermindering\n  wordt ook uitbetaald als die hoger is dan je energiebelasting.`,
  );
}
console.log("");
