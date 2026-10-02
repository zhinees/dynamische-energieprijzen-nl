# Dynamische energieprijzen NL

Een onafhankelijk, open overzicht van wat Nederlandse leveranciers rekenen voor een dynamisch energiecontract, automatisch bijgewerkt door GitHub Actions:

- **Tarieven van leveranciers**: vaste kosten per maand, inkoopopslag en teruglevering, per leverancier, met bron en controledatum per getal.
- **Energiebelasting** per jaar, rechtstreeks van de Belastingdienst.
- **Aanschafprijzen van thuisbatterijen** per type en capaciteit (bandbreedte), met de prijs per kWh en de levensduur, om een terugverdientijd te kunnen schatten.
- **Vaste contracten van leveranciers**: het modelcontract met vast tarief per leverancier (leveringstarief per kWh, vaste kosten, terugleververgoeding en terugleverkosten, ook als staffel), met bron per getal. Bewust het modelcontract, dat elke leverancier moet publiceren, en geen actieprijzen, welkomstbonussen of cashback: zo is het eerlijk en controleerbaar te vergelijken. Nog niet alle leveranciers; de lijst wordt aangevuld.
- **Gemiddeld vast contract**: wat een huishouden gemiddeld betaalt met een vast of variabel stroomcontract (per kWh en vaste leveringskosten, CBS), als standaard voor wie het eigen tarief niet weet.
- **Thuis laden**: de ERE-vergoeding per thuis geladen kWh (richtwaarde en bandbreedte) en de aanschafprijs van een laadpaal, om te schatten wat een laadpaal oplevert.
- **Batterijmodellen**: technische gegevens van veelverkochte thuisbatterijen (capaciteit, bruikbare capaciteit, laad- en ontlaadvermogen, verlies, stand-by), met bronnen, om met een echt model te kunnen rekenen.
- **Omslagpunten en een rekenhulp**: vanaf welk jaarverbruik de inkoopopslag zwaarder weegt dan de vaste kosten, en welke leverancier bij jouw verbruik het goedkoopst is. Bij elke tariefwijziging opnieuw berekend.

Zie het als een filterlijst van een adblocker. De data staat als gewone JSON- en CSV-bestanden in deze repo, en een geplande taak houdt die actueel. Iedereen mag de bestanden gebruiken voor vergelijkingssites, domotica of onderzoek. Correcties gaan via pull requests.

**Marktprijzen staan hier bewust niet in.** Die haal je met één verzoek zelf op bij [EnergyZero](https://www.energyzero.nl) of het [ENTSO-E Transparency Platform](https://transparency.entsoe.eu). Tel daar de tarieven uit deze repo bij op; zie [`voorbeelden/prijs-op-uur.mjs`](voorbeelden/prijs-op-uur.mjs).

> **Gericht op consumenten: de hoofdbedragen zijn inclusief 21% btw.** Elk bedrag heeft `InclBtw` of `ExclBtw` in de veldnaam, zodat je nooit hoeft te raden. Netbeheerkosten zitten niet in de leverancierstarieven, want die verschillen per regio; ze staan apart in `data/netbeheer.json`, met in `data/netbeheer-postcodes.json` de netbeheerder per postcode.
>
> **Alleen echte data wordt gepubliceerd.** Elk tarief is gelezen op de eigen website of in de eigen prijsrekentool van de leverancier. Waarden die niet te controleren zijn, blijven weg; ze worden nooit geschat of overgenomen van andere sites.

## De data gebruiken

Haal elk bestand direct van GitHub op. `raw.githubusercontent.com` staat verzoeken van andere domeinen toe, dus dit werkt zowel in de browser als op een server.

```
https://raw.githubusercontent.com/zhinees/dynamische-energieprijzen-nl/main/data/<bestand>
```

Een CDN-alternatief is `https://cdn.jsdelivr.net/gh/zhinees/dynamische-energieprijzen-nl@main/data/<bestand>`. Let op: jsDelivr bewaart branch-URL's tot 12 uur in de cache, dus gebruik raw GitHub als je de nieuwste data nodig hebt.

| Bestand | Inhoud | Bijgewerkt |
| --- | --- | --- |
| `data/leveranciers.json` / `.csv` | Huidige tarieven per leverancier, met bron en controle per waarde | wekelijks + op de 1e en 2e van de maand |
| `data/energiebelasting.json` | Energiebelasting voor huishoudens per jaar (vanaf 2023), incl. en excl. btw | wekelijks + op de 1e en 2e van de maand |
| `data/netbeheer.json` | Periodieke netbeheerkosten stroom per jaar per netbeheerder, voor drie aansluitcategorieën (t/m 1x10A; t/m 3x25A, ook 1x35A; 3x35A), incl. en excl. btw | met de hand, december en juli |
| `data/netbeheer-postcodes.json` | Netbeheerder stroom per postcode (per viercijferig gebied, met uitzonderingen op zes posities) | jaarlijks, januari |
| `data/thuisbatterijen.json` | Aanschafprijs van thuisbatterijen (vast met installatie, en stekkerbatterij) per capaciteit, als bandbreedte incl. btw, met de prijs per kWh, levensduur en bronnen | met de hand, januari en juli |
| `data/laden.json` | Thuis laden: ERE-vergoeding per thuis geladen kWh (richtwaarde en bandbreedte, na de kosten van de inboeker) en de prijs van een laadpaal met installatie, incl. btw, met bronnen | met de hand, januari en juli |
| `data/vast.json` | Gemiddeld vast of variabel stroomcontract voor huishoudens: leveringstarief per kWh, energiebelasting, totaal per kWh en vaste leveringskosten, incl. btw, per maand (laatste twaalf maanden) | wekelijks (CBS publiceert maandelijks) |
| `data/vaste-contracten.json` | Modelcontract met vast tarief per leverancier: leveringstarief per kWh zonder energiebelasting, vaste leveringskosten, terugleververgoeding en terugleverkosten per kWh of als staffel (bedrag per maand per band van de teruglevering per jaar), incl. en excl. btw, met bron en controledatum per waarde. Geen acties of bonussen; nog niet alle leveranciers | met de hand, bij tariefwijzigingen (meestal 1 januari en 1 juli) |
| `data/batterijmodellen.json` | Technische gegevens van thuisbatterijen per model (capaciteit, bruikbaar, laad- en ontlaadvermogen, verlies, stand-by), met bronnen; onbekend = null | met de hand, januari en juli |
| `data/omslagpunten.json` / [`OMSLAGPUNTEN.md`](data/OMSLAGPUNTEN.md) | Omslagpunten voor stroom, gas en teruglevering, en de goedkoopste leverancier per jaarverbruik | na elke update |
| `data/omslagpunten-geschiedenis.json` | Elke keer dat een omslagpunt of de goedkoopste leverancier verandert | als dat verandert |
| `data/tariefwijzigingen.json` | Logboek van elke tariefwijziging | als tarieven veranderen |
| `data/RAPPORT.md` | Waar elke waarde vandaan komt, en welke leveranciers nog niet gepubliceerd zijn | samen met leveranciers.json |
| `data/BEWAKING.md` / `data/bewaakt/` | Bewaakte pagina's van leveranciers zonder automatische bron, en wat daar veranderde | samen met leveranciers.json |

### Voorbeeld: wat kost een kWh per leverancier?

```js
const BASIS = "https://raw.githubusercontent.com/zhinees/dynamische-energieprijzen-nl/main/data";
const { leveranciers } = await (await fetch(`${BASIS}/leveranciers.json`)).json();
const { jaren } = await (await fetch(`${BASIS}/energiebelasting.json`)).json();

const marktInclBtw = 0.2676; // zelf ophalen, bijv. bij EnergyZero (× 1,21 voor btw)
const belasting = jaren["2026"].stroomPerKwh.bedragInclBtw;
for (const l of leveranciers) {
  const opslag = l.tarieven.stroomInkoopopslag?.bedragInclBtw;
  if (opslag != null) console.log(l.naam, marktInclBtw + opslag + belasting);
}
```

Meer in [`voorbeelden/`](voorbeelden): een Node-script dat de marktprijs zelf ophaalt (`prijs-op-uur.mjs`) en een Astro-component met een tarieventabel (`astro/Tarieven.astro`).

### Dataformaat

Elk bestand heeft een JSON Schema in [`schema/`](schema) en een veld `$schema` dat ernaar verwijst. Een paar afspraken:

- **Btw**: bedragen voor consumenten zijn inclusief 21% btw. Bij tarieven van leveranciers is `bedragInclBtw` het bedrag dat de leverancier zelf noemt.
- **Tariefvelden**:
  - `stroomVastPerMaand`, `gasVastPerMaand`: EUR per maand.
  - `stroomInkoopopslag`: EUR/kWh bovenop de marktprijs.
  - `gasInkoopopslag`: EUR/m³ bovenop de marktprijs.
  - `terugleverCorrectie`: EUR/kWh die *bij* de uurprijs wordt opgeteld voor stroom die je teruglevert. Negatief bij kosten (terugleverkosten), positief bij een bonus (bijv. Zonneplan).
- **Per tariefwaarde**:
  - `bedragInclBtw`: wat een consument betaalt, inclusief btw; het eigen bedrag van de leverancier als die er een publiceert (anders `bedragExclBtw` × 1,21).
  - `bedragExclBtw`: hetzelfde bedrag zonder btw.
  - `bron`: `website` (door de bot gelezen op de webpagina van de leverancier), `rekentool` (uit de eigen prijsrekentool van de leverancier) of `handmatig` (uit het leveranciersbestand).
  - `geverifieerd`: altijd `true`. Ongecontroleerde waarden worden door de validator geweigerd.
  - `sinds`: sinds wanneer deze waarde geldt.
  - `laatstGecontroleerd`: de laatste bevestiging door de bot.
- **Energiebelasting** (`data/energiebelasting.json`, per jaar): `stroomPerKwh` (0 t/m 10.000 kWh), `gasPerM3` (0 t/m 170.000 m³) en `verminderingPerAansluitingPerJaar` (de belastingvermindering per stroomaansluiting van een woning), elk met `bedragInclBtw` en `bedragExclBtw`. De vermindering is een vast bedrag per jaar en hoort niet bij de prijs per kWh. Jaren vóór 2023 staan er niet in, omdat de ODE toen nog een aparte heffing was.
- **Afronding**: bedragen zijn afgerond op 6 decimalen.

## Omslagpunten en rekenhulp

Tussen leveranciers verschilt alleen hun eigen deel van de rekening: **vaste kosten × 12 + verbruik × inkoopopslag − teruglevering × terugleverCorrectie**. Marktprijs, energiebelasting en netbeheerkosten zijn bij iedereen gelijk.

- **Omslagpunt**: het jaarverbruik waarbij het grootste verschil in opslag even zwaar weegt als het grootste verschil in vaste kosten. Gebruik je minder, let dan vooral op de vaste kosten; gebruik je meer, dan op de opslag.
- **Teruglevering**: met zonnepanelen werkt *teruglevering × terugleverCorrectie* als een extra vast bedrag per jaar. Dat verschuift het omslagpunt voor stroom, vaak flink: omdat de correcties onderling meer verschillen dan de vaste kosten, is bij een paar honderd kWh teruglevering de correctie al belangrijker dan de vaste kosten.
- Na elke update van de data worden de omslagpunten opnieuw berekend. [`data/OMSLAGPUNTEN.md`](data/OMSLAGPUNTEN.md) toont de actuele stand en wat het was; de commit van de bot noemt de nieuwe waarden.

Reken je eigen situatie door:

```sh
npm run rekenhulp -- --stroom 2500 --gas 1000
npm run rekenhulp -- --stroom 1200 --teruglevering 2000   # zonnepanelen, geen gas
```

Je krijgt een ranglijst van leveranciers voor jouw verbruik, waar je zit ten opzichte van de omslagpunten, en een geschatte jaarrekening (marktprijs, leverancier, energiebelasting en belastingvermindering; zonder netbeheerkosten). De marktprijs daarin is het gemiddelde van de afgelopen 365 dagen, op het moment zelf opgehaald bij EnergyZero.

## Waar de data vandaan komt

- **Tarieven van leveranciers**: elke leverancier heeft een bestand in [`leveranciers/`](leveranciers). Daarin staan:
  - **een rekentool-adapter** (optioneel): de bot vraagt de eigen prijsrekentool van de leverancier om een aanbod voor een vast, openbaar testadres, het Eise Eisinga Planetarium (Eise Eisingastraat 3, Franeker), en bewaart alleen de eigen tariefregels van de leverancier. De opslagen van leveranciers zijn in heel Nederland gelijk; netbeheerkosten, die wel van het adres afhangen, worden genegeerd.
  - **scraperregels**: waar op de website van de leverancier elk getal te vinden is.
  - **handmatige waarden**: met de hand gecontroleerd op de eigen site van de leverancier, met bron-URL en datum. Die worden gebruikt als er geen regel is, of als een regel niet meer werkt. Ongecontroleerde waarden worden niet geaccepteerd.

  Leveranciers worden elke maandag gecontroleerd en op de 1e en 2e van elke maand (tarieven veranderen meestal op de 1e). Dat zijn een handvol verzoeken per leverancier per maand. Zie [`data/RAPPORT.md`](data/RAPPORT.md) voor de huidige stand. Hulp bij meer rekentool-adapters is welkom.

  Hoe elke leverancier wordt bijgehouden (stand 26 september 2026):

  | Leverancier | Hoe | Opmerking |
  | --- | --- | --- |
  | ANWB Energie | rekentool (vaste kosten) + website (opslag) | offerte-API; de opslag uit de API wisselt per aanroep, de tarievenpagina niet |
  | Budget Thuis | rekentool | aanbod-API |
  | Frank Energie | rekentool | de API laat soms het stroomdeel leeg; dan gelden de handmatige waarden |
  | NextEnergy, Tibber | website | |
  | Vandebron | rekentool | prijsopbouw-API |
  | Vattenfall | rekentool (+ website voor teruglevering) | aanbod-API; de openbare API-sleutels leest de adapter elke run uit het script van de rekentool |
  | Eneco | handmatig | de API vraagt een sessietoken en werkt met een winkelmandje op de server |
  | Zonneplan | handmatig | de rekentool slaat bij elke berekening een aanvraag op |
  | Live Energy | handmatig | de rekentool loopt via een WordPress-formulier met een sessie |
  | Pure Energie | handmatig | de rekentool houdt een sessie bij op de server |
- **Energiebelasting**: de tarieventabellen op de [site van de Belastingdienst](https://www.belastingdienst.nl/wps/wcm/connect/bldcontentnl/belastingdienst/zakelijk/overige_belastingen/belastingen_op_milieugrondslag/energiebelasting/energiebelasting). De bot leest die op dezelfde momenten; nieuwe tarieven verschijnen meestal rond 1 januari. Als reserve staan met de hand gecontroleerde waarden in [`belastingen/energiebelasting.json`](belastingen/energiebelasting.json).
- **Netbeheerkosten**: met de hand overgenomen uit de tariefbladen van de zes regionale netbeheerders, in [`netbeheer/netbeheerders.json`](netbeheer/netbeheerders.json) (bron-URL en datum per netbeheerder). Het bedrag per jaar is aansluitdienst + vastrecht transport + capaciteitstarief + meterhuur. Controleren in december (nieuwe tarieven per 1 januari) en in juli: Rendo wijzigde zijn tarieven per 1 juli 2026.
- **Netbeheerder per postcode**: uit de open kleinverbruiksbestanden van Liander, Stedin, Coteq, Rendo en Westland Infra (stroom). Enexis publiceert dat bestand niet meer en krijgt alle postcodes die in geen ander bestand staan. De bestanden voegen postcodes samen tot bereiken; alleen het begin en eind van een bereik geldt als zeker. Postcodes die in geen bestand staan (vooral nieuwe straten en bedrijventerreinen) volgen hun gebied; alleen naast Coteq en Rendo, waar het verschil met Enexis € 20–30 per jaar is, gaat een lange reeks ervan (10 of meer) naar Enexis. Welke postcodes er per gebied bestaan komt van de [PDOK Locatieserver](https://www.pdok.nl). Een steekproef van 78 postcodes tegen het EAN-codeboek gaf 76 goed; de 2 fouten waren Liander/Stedin, die € 1–2 per jaar verschillen.
- **Thuisbatterijen**: met de hand overgenomen uit openbare prijsoverzichten, in [`thuisbatterijen/thuisbatterijen.json`](thuisbatterijen/thuisbatterijen.json) (bron-URL en datum per prijs, plus controlebronnen). Het zijn bandbreedtes van vergelijkers en verkopers, geen offertes; de enige onafhankelijke bron (Milieu Centraal) noemt geen prijs per kWh. De prijs per kWh daalt met de capaciteit, omdat installatie en omvormer bij elke vaste batterij terugkomen. Controleren in januari en juli.
- **Gemiddeld vast contract**: automatisch uit [CBS StatLine 85592NED](https://opendata.cbs.nl/#/CBS/nl/dataset/85592NED/table) (Gemiddelde energietarieven voor consumenten, CC BY 4.0): het variabele leveringstarief en het vaste leveringstarief voor vaste en variabele contracten, incl. btw. Is het CBS niet bereikbaar, dan blijft het vorige bestand staan.
- **Vaste contracten**: met de hand overgenomen in [`vaste-contracten/contracten.json`](vaste-contracten/contracten.json), alleen van de eigen site of het tariefblad van de leverancier (de controle weigert een bron op een ander domein), met per waarde de URL en de datum. Het leveringstarief zonder energiebelasting, zodat je zelf de belasting van het juiste jaar optelt. We nemen het modelcontract met vast tarief, niet de actieprijzen of welkomstbonussen waar vergelijkingssites mee werken. Controleren bij elke tariefwijziging.
- **Thuis laden**: met de hand overgenomen in [`laden/laden.json`](laden/laden.json), met per waarde de bronnen en de datum. De ERE-vergoeding (emissiereductie-eenheden) krijgt de bezitter van een laadpaal met geijkte MID-meter via een inboeker; de prijs wisselt met de markt. De laadpaalprijs is incl. installatie; Milieu Centraal staat als onafhankelijke controlebron. Controleren in januari en juli.
- **Batterijmodellen**: met de hand overgenomen in [`thuisbatterijen/modellen.json`](thuisbatterijen/modellen.json), met per model de bronnen en per bron het soort (fabrikant, datasheet, verkoper, review). Liefst de datasheet van de fabrikant. Wat een bron niet noemt of wat bronnen verschillend noemen, blijft `null`. Het rondeverlies is laden en weer ontladen samen, inclusief omvormer; een piekrendement van alleen de batterij hoort daar niet. `vermogenKw` is het laagste van laad- en ontlaadvermogen, voor rekenhulpen die die twee niet apart kennen. Controleren in januari en juli.
- **Marktprijzen** (alleen in de rekenhulp en het voorbeeld, niet opgeslagen): de openbare API van EnergyZero.

## Zelf draaien

Vereist Node 22.18+ (draait TypeScript direct, zonder bouwstap).

```sh
npm ci
npm run belasting                        # energiebelasting → data/energiebelasting.json
npm run netbeheer                        # netbeheer/netbeheerders.json → data/netbeheer.json
npm run netbeheer:postcodes              # ook data/netbeheer-postcodes.json (januari; downloadt ± 40 MB, vraagt PDOK ± 3.000 keer)
npm run laden                            # laden/laden.json → data/laden.json
npm run vaste-contracten                 # vaste-contracten/contracten.json → data/vaste-contracten.json
npm run thuisbatterijen                  # thuisbatterijen/thuisbatterijen.json → data/thuisbatterijen.json, modellen.json → data/batterijmodellen.json
npm run leveranciers                     # tarieven uitlezen → data/leveranciers.json
npm run afleiden                         # omslagpunten → data/omslagpunten.json en OMSLAGPUNTEN.md
npm run rekenhulp -- --stroom 2500       # ranglijst en jaarrekening voor jouw verbruik
npm run controleer                       # typecontrole + tests + validatie
npm run debug -- tibber                  # laat zien wat de scraper leest voor één leverancier
```

### Een eigen kopie op GitHub

1. Fork de repo en vervang `zhinees` door je eigen GitHub-gebruiker of organisatie:
   `grep -rl zhinees --exclude-dir=node_modules . | xargs sed -i 's/zhinees/jouw-naam/g'`
2. Start de workflow `leveranciers.yml` één keer vanaf het tabblad **Actions** (*Run workflow*).

De workflows vragen zelf schrijfrechten voor hun commits, dus je hoeft de standaardrechten voor Actions niet aan te passen.

De workflows:

- `leveranciers.yml`: draait om 04:17 UTC op elke maandag en op de 1e en 2e van de maand. Werkt de energiebelasting, de tarieven van leveranciers en de omslagpunten bij. Houdt één issue open zolang een scraperregel, rekentool of het uitlezen van de energiebelasting kapot is, en sluit het weer als alles werkt. Opent ook een issue (of reageert erop) als een bewaakte pagina van een leverancier zonder automatische bron is veranderd; sluit dat issue zelf als je de tarieven hebt gecontroleerd.
- `ci.yml`: draait bij elke PR. Controleert types, tests, schema's en elk leveranciersbestand.

## Bijdragen

De nuttigste hulp is de huidige tarieven van een leverancier controleren en het bestand in `leveranciers/` bijwerken. Zie [CONTRIBUTING.md](CONTRIBUTING.md).

## Licentie

- Code: [MIT](LICENSE).
- Data in `data/`, `leveranciers/`, `belastingen/`, `netbeheer/`, `thuisbatterijen/`, `laden/` en `vaste-contracten/`: [CC BY 4.0](DATA-LICENTIE.md). Vermeld "dynamische-energieprijzen-nl" en de onderliggende bronnen die daar staan.

Dit project is niet verbonden aan een energieleverancier, en niets hier is financieel advies. Controleer altijd de voorwaarden van de leverancier zelf voordat je overstapt.
