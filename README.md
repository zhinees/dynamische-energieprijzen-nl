# Dynamische energieprijzen NL

Een onafhankelijk, open overzicht van Nederlandse dynamische energiecontracten, automatisch bijgewerkt door GitHub Actions:

- **Day-aheadmarktprijzen**: stroom per uur (en per kwartier als die beschikbaar is), plus gas, per dag.
- **Tarieven van leveranciers** met een dynamisch contract: vaste kosten per maand, inkoopopslag en teruglevering, per leverancier.
- **Energiebelasting** per jaar, rechtstreeks van de Belastingdienst.
- **Kant-en-klare vergelijkingen**: de afname- en terugleverprijs per uur voor elke leverancier, voor vandaag en morgen, ook met energiebelasting erbij.
- **Omslagpunten en een rekenhulp**: vanaf welk jaarverbruik de inkoopopslag zwaarder weegt dan de vaste kosten, en welke leverancier bij jouw verbruik het goedkoopst is. Bij elke tariefwijziging opnieuw berekend.

Zie het als een filterlijst van een adblocker. De data staat als gewone JSON- en CSV-bestanden in deze repo, en een geplande taak houdt die actueel. Iedereen mag de bestanden gebruiken voor grafieken, vergelijkingssites, domotica of onderzoek. Correcties gaan via pull requests.

> **Gericht op consumenten: de hoofdbedragen zijn inclusief 21% btw.** Elk bedrag heeft `InclBtw` of `ExclBtw` in de veldnaam, zodat je nooit hoeft te raden. Velden met `MetEnergiebelasting` in de naam tellen ook de energiebelasting mee. Netbeheerkosten zitten er nooit in, want die verschillen per regio.
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
| `data/prijzen/actueel.json` | Volledige prijsbestanden voor `vandaag` en `morgen` (morgen is `null` tot ongeveer 13:00) | een paar keer per dag |
| `data/prijzen/JJJJ/JJJJ-MM-DD.json` / `.csv` | De prijzen van één dag (geschiedenis) | één keer per dag, zodra ze gepubliceerd zijn |
| `data/prijzen/index.json` | Lijst van beschikbare dagen | dagelijks |
| `data/leveranciers.json` / `.csv` | Huidige tarieven per leverancier, met bron en controle per waarde | wekelijks + op de 1e en 2e van de maand |
| `data/vergelijking/actueel.json` | Per uur, inclusief btw: de marktprijs, plus `afnameInclBtw` en `terugleveringInclBtw` per leverancier, voor vandaag en morgen | een paar keer per dag |
| `data/energiebelasting.json` | Energiebelasting voor huishoudens per jaar (vanaf 2023), incl. en excl. btw | wekelijks + op de 1e en 2e van de maand |
| `data/omslagpunten.json` / [`OMSLAGPUNTEN.md`](data/OMSLAGPUNTEN.md) | Omslagpunten voor stroom, gas en teruglevering, en de goedkoopste leverancier per jaarverbruik | na elke update |
| `data/omslagpunten-geschiedenis.json` | Elke keer dat een omslagpunt of de goedkoopste leverancier verandert | als dat verandert |
| `data/tariefwijzigingen.json` | Logboek van elke tariefwijziging | als tarieven veranderen |
| `data/RAPPORT.md` | Waar elke waarde vandaan komt, en welke leveranciers nog niet gepubliceerd zijn | samen met leveranciers.json |

### Voorbeeld: de prijs vandaag om 18:00

```js
const BASIS = "https://raw.githubusercontent.com/zhinees/dynamische-energieprijzen-nl/main/data";
const { vandaag } = await (await fetch(`${BASIS}/vergelijking/actueel.json`)).json();

const om18 = vandaag.uren.find((u) => u.start.slice(11, 13) === "18"); // start is lokale tijd
console.log(om18.marktInclBtw);                   // bijv. 0.267628  (EUR/kWh, marktprijs incl. btw)
console.log(om18.afnameInclBtw.tibber);           // marktprijs + inkoopopslag van Tibber, incl. btw
console.log(om18.terugleveringInclBtw.zonneplan); // wat Zonneplan dat uur per teruggeleverde kWh betaalt, incl. btw
console.log(om18.afnameMetEnergiebelastingInclBtw.tibber); // wat een kWh bij Tibber echt kost, zonder netbeheerkosten
```

Meer in [`voorbeelden/`](voorbeelden): een Node-script (`prijs-op-uur.mjs`) en een Astro-component (`astro/Energieprijzen.astro`).

### Dataformaat

Elk bestand heeft een JSON Schema in [`schema/`](schema) en een veld `$schema` dat ernaar verwijst. Een paar afspraken:

- **Tijden**: `start` is de lokale tijd in Amsterdam met tijdverschil (`2026-09-24T18:00:00+02:00`), en `startUtc` is hetzelfde moment in UTC. Dagen met een zomertijdwissel hebben 23 of 25 uur.
- **Per uur en per kwartier**: de day-aheadmarkt werkt met blokken van 15 minuten. `perUur` is er altijd; met ENTSO-E als bron staan de kwartierprijzen in `perKwartier`, en is `perUur` daar het gemiddelde van. Elk punt heeft `prijsInclBtw` en `prijsExclBtw`.
- **Btw**: bedragen voor consumenten zijn inclusief 21% btw. De marktbronnen leveren prijzen zonder btw; `prijsInclBtw` is die prijs × 1,21. Bij tarieven van leveranciers is `bedragInclBtw` het bedrag dat de leverancier zelf noemt.
- **Tariefvelden**:
  - `stroomVastPerMaand`, `gasVastPerMaand`: EUR per maand.
  - `stroomInkoopopslag`: EUR/kWh.
  - `gasInkoopopslag`: EUR/m³.
  - `terugleverCorrectie`: EUR/kWh die *bij* de uurprijs wordt opgeteld voor stroom die je teruglevert. Negatief bij kosten (terugleverkosten), positief bij een bonus (bijv. Zonneplan).
  - In de vergelijking: `afnameInclBtw` = marktprijs incl. btw + `stroomInkoopopslag` incl. btw, en `terugleveringInclBtw` = marktprijs incl. btw + `terugleverCorrectie` incl. btw.
  - `afnameMetEnergiebelastingInclBtw` = `afnameInclBtw` + energiebelasting per kWh incl. btw. Voor gas is er `gasPrijsMetEnergiebelastingInclBtw`. Ontbreekt de energiebelasting voor het jaar van die dag nog (bijv. vlak na 1 januari), dan is dit `null`.
- **Energiebelasting** (`data/energiebelasting.json`, per jaar): `stroomPerKwh` (0 t/m 10.000 kWh), `gasPerM3` (0 t/m 170.000 m³) en `verminderingPerAansluitingPerJaar` (de belastingvermindering per stroomaansluiting van een woning), elk met `bedragInclBtw` en `bedragExclBtw`. De vermindering is een vast bedrag per jaar en zit daarom niet in de prijs per kWh. Jaren vóór 2023 staan er niet in, omdat de ODE toen nog een aparte heffing was.
- **Teruglevering en energiebelasting**: `terugleveringInclBtw` bevat geen energiebelasting. Tot 1 januari 2027 geldt de salderingsregeling, waardoor stroom die je teruglevert tegen je verbruik wegvalt, inclusief de belasting daarover. Hoeveel dat oplevert hangt af van je eigen verbruik, dus dat rekent het project niet voor je uit.
- **Per tariefwaarde**:
  - `bedragInclBtw`: wat een consument betaalt, inclusief btw; het eigen bedrag van de leverancier als die er een publiceert (anders `bedragExclBtw` × 1,21). `null` als de leverancier niet zegt of er btw over gaat; dan staat die leverancier in de vergelijking als onbekend.
  - `bedragExclBtw`: hetzelfde bedrag zonder btw.
  - `bron`: `website` (door de bot gelezen op de webpagina van de leverancier), `rekentool` (uit de eigen prijsrekentool van de leverancier) of `handmatig` (uit het leveranciersbestand).
  - `geverifieerd`: altijd `true`. Ongecontroleerde waarden worden door de validator geweigerd.
  - `sinds`: sinds wanneer deze waarde geldt.
  - `laatstGecontroleerd`: de laatste bevestiging door de bot.
- **Afronding**: prijzen zijn afgerond op 6 decimalen.

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

Je krijgt een ranglijst van leveranciers voor jouw verbruik, waar je zit ten opzichte van de omslagpunten, en een geschatte jaarrekening (marktprijs, leverancier, energiebelasting en belastingvermindering; zonder netbeheerkosten). De marktprijs in die schatting is het gemiddelde van de dagen die in deze repo staan, dus in het begin is het een ruwe schatting.

## Waar de data vandaan komt

- **Stroom**: [ENTSO-E Transparency Platform](https://transparency.entsoe.eu), de officiële bron (vraagt een gratis API-token). De openbare API van [EnergyZero](https://www.energyzero.nl) is de reserve. Elk dagbestand vermeldt welke bron is gebruikt.
- **Gas**: de openbare API van EnergyZero.
- **Energiebelasting**: de tarieventabellen op de [site van de Belastingdienst](https://www.belastingdienst.nl/wps/wcm/connect/bldcontentnl/belastingdienst/zakelijk/overige_belastingen/belastingen_op_milieugrondslag/energiebelasting/energiebelasting). De bot leest die elke week; nieuwe tarieven verschijnen meestal rond 1 januari. Als reserve staan met de hand gecontroleerde waarden in [`belastingen/energiebelasting.json`](belastingen/energiebelasting.json).
- **Tarieven van leveranciers**: elke leverancier heeft een bestand in [`leveranciers/`](leveranciers). Daarin staan:
  - **een rekentool-adapter** (optioneel): de bot vraagt de eigen prijsrekentool van de leverancier om een aanbod voor een vast, openbaar testadres, Madurodam (George Maduroplein 1, Den Haag), en bewaart alleen de eigen tariefregels van de leverancier. De opslagen van leveranciers zijn in heel Nederland gelijk; netbeheerkosten, die wel van het adres afhangen, worden genegeerd.
  - **scraperregels**: waar op de website van de leverancier elk getal te vinden is.
  - **handmatige waarden**: met de hand gecontroleerd op de eigen site van de leverancier, met bron-URL en datum. Die worden gebruikt als er geen regel is, of als een regel niet meer werkt. Ongecontroleerde waarden worden niet geaccepteerd.

  Leveranciers worden elke maandag gecontroleerd en op de 1e en 2e van elke maand (tarieven veranderen meestal op de 1e). Dat zijn een handvol verzoeken per leverancier per maand. Zie [`data/RAPPORT.md`](data/RAPPORT.md) voor de huidige stand. Hulp bij meer rekentool-adapters is welkom.

## Zelf draaien

Vereist Node 22.18+ (draait TypeScript direct, zonder bouwstap).

```sh
npm ci
npm run prijzen                          # vandaag + morgen → data/prijzen/
npm run prijzen -- 2026-01-01 2026-01-31 # een periode aanvullen
npm run belasting                        # energiebelasting → data/energiebelasting.json
npm run leveranciers                     # tarieven uitlezen → data/leveranciers.json
npm run afleiden                         # index.json, vergelijking/actueel.json en de omslagpunten
npm run rekenhulp -- --stroom 2500       # ranglijst en jaarrekening voor jouw verbruik
npm run controleer                       # typecontrole + tests + validatie
npm run debug -- tibber                  # laat zien wat de scraper leest voor één leverancier
```

### Een eigen kopie op GitHub

1. Fork de repo en vervang `zhinees` door je eigen GitHub-gebruiker of organisatie:
   `grep -rl zhinees --exclude-dir=node_modules . | xargs sed -i 's/zhinees/jouw-naam/g'`
2. Optioneel, aanbevolen: vraag een gratis ENTSO-E API-token aan. Registreer je op transparency.entsoe.eu en vraag API-toegang aan; de API-handleiding van het platform beschrijft de actuele procedure (vroeger ging dat via een e-mail aan transparency@entsoe.eu met als onderwerp "Restful API access"). Zet het token als repository-secret `ENTSOE_TOKEN`. Zonder token komen de stroomprijzen van EnergyZero.
3. Start beide workflows één keer vanaf het tabblad **Actions** (*Run workflow*).

De workflows vragen zelf schrijfrechten voor hun commits, dus je hoeft de standaardrechten voor Actions niet aan te passen.

De workflows:

- `prijzen.yml`: draait om 11:05, 12:05, 13:05, 15:05, 22:05 en 23:05 UTC. Commit alleen als de data veranderd is.
- `leveranciers.yml`: draait om 04:17 UTC op elke maandag en op de 1e en 2e van de maand. Werkt de energiebelasting en de tarieven van leveranciers bij. Houdt één issue open zolang een scraperregel, rekentool of het uitlezen van de energiebelasting kapot is, en sluit het weer als alles werkt.
- `ci.yml`: draait bij elke PR. Controleert types, tests, schema's en elk leveranciersbestand.

## Bijdragen

De nuttigste hulp is de huidige tarieven van een leverancier controleren en het bestand in `leveranciers/` bijwerken. Zie [CONTRIBUTING.md](CONTRIBUTING.md).

## Licentie

- Code: [MIT](LICENSE).
- Data in `data/` en `leveranciers/`: [CC BY 4.0](DATA-LICENTIE.md). Vermeld "dynamische-energieprijzen-nl" en de onderliggende bronnen die daar staan.

Dit project is niet verbonden aan een energieleverancier, en niets hier is financieel advies. Controleer altijd de voorwaarden van de leverancier zelf voordat je overstapt.
