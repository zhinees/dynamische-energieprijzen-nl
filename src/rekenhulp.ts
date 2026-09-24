// Rank suppliers for your own yearly usage and estimate the year's bill. All amounts incl. btw.
//
//   node src/rekenhulp.ts --stroom 2500 --gas 1000
//   node src/rekenhulp.ts --stroom 3000 --teruglevering 2000   # with solar panels, no gas

import { join } from "node:path";
import { DATA, leesJson } from "./lib/bestanden.ts";
import { berekenOmslagpunten, berekenTerugleveromslag, goedkoopstePerVerbruik, leverancierdelen, productkosten, type Product, type Verbruik } from "./lib/jaarkosten.ts";
import { haalJaargemiddelde, type Jaargemiddelde } from "./lib/bronnen.ts";
import { vandaagLokaal } from "./lib/tijd.ts";
import type { EnergiebelastingBestand, LeveranciersBestand } from "./lib/typen.ts";

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
// The market price is the average of the last 365 days, fetched live from EnergyZero.
const haal = async (soort: "stroom" | "gas") => haalJaargemiddelde(soort).catch((e: Error) => (console.error(`\n  marktprijs ${soort}: ${e.message}`), null));
const markt: { stroom: Jaargemiddelde | null; gas: Jaargemiddelde | null } = {
  stroom: verbruik.stroom ? await haal("stroom") : null,
  gas: verbruik.gas ? await haal("gas") : null,
};
const jaar = vandaagLokaal().slice(0, 4);
const eb = belasting?.jaren[jaar];
const beste = volledig[0];
const marktCompleet = (!verbruik.stroom || markt.stroom) && (!verbruik.gas || markt.gas);
if (!marktCompleet) console.log("\nGeen jaarrekening: de marktprijs kon niet bij EnergyZero worden opgehaald.");
if (beste && eb && marktCompleet) {
  const stroomMarkt = verbruik.stroom * (markt.stroom?.prijsInclBtw ?? 0);
  const gasMarkt = verbruik.gas * (markt.gas?.prijsInclBtw ?? 0);
  const ebStroom = verbruik.stroom * eb.stroomPerKwh.bedragInclBtw;
  const ebGas = verbruik.gas * eb.gasPerM3.bedragInclBtw;
  const vermindering = verbruik.stroom || verbruik.teruglevering ? eb.verminderingPerAansluitingPerJaar.bedragInclBtw : 0;
  const totaal = beste.totaal! + stroomMarkt + gasMarkt + ebStroom + ebGas - vermindering;
  console.log(`\nGeschatte jaarrekening bij ${beste.naam} (incl. btw, zonder netbeheerkosten):`);
  if (verbruik.stroom) console.log(`  stroom marktprijs    ${eur(stroomMarkt).padStart(12)}   (gemiddeld ${eur(markt.stroom!.prijsInclBtw, 4)} per kWh)`);
  if (verbruik.gas) console.log(`  gas marktprijs       ${eur(gasMarkt).padStart(12)}   (gemiddeld ${eur(markt.gas!.prijsInclBtw, 4)} per m³)`);
  console.log(`  leverancier          ${eur(beste.totaal).padStart(12)}   (vaste kosten en opslag, zie boven)`);
  if (verbruik.stroom) console.log(`  energiebelasting     ${eur(ebStroom).padStart(12)}   (stroom, ${eur(eb.stroomPerKwh.bedragInclBtw, 5)} per kWh in ${jaar})`);
  if (verbruik.gas) console.log(`  energiebelasting     ${eur(ebGas).padStart(12)}   (gas, ${eur(eb.gasPerM3.bedragInclBtw, 5)} per m³ in ${jaar})`);
  if (vermindering) console.log(`  belastingvermindering ${eur(-vermindering).padStart(11)}   (per aansluiting van een woning)`);
  console.log(`  totaal               ${eur(totaal).padStart(12)}   ≈ ${eur(totaal / 12)} per maand`);
  const periode = markt.stroom ?? markt.gas;
  console.log(
    (periode
      ? `\n  Marktprijs: gemiddelde van de dagprijzen van ${periode.van} t/m ${periode.tot} (${periode.dagen} dagen, EnergyZero),` +
        `\n  alsof je elke dag evenveel gebruikt. Met zonnepanelen of een warmtepomp wijkt jouw echte gemiddelde af.`
      : "") +
      `\n  Netbeheerkosten en de opbrengst van teruglevering (salderen tot 2027) zitten er niet in. Een negatief totaal` +
      `\n  kan: de belastingvermindering wordt ook uitbetaald als die hoger is dan je energiebelasting.`,
  );
}
console.log("");
