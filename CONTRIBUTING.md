# Bijdragen

Bedankt dat je helpt de tarieven correct te houden. Bijna elke bijdrage is een aanpassing van één bestand in `leveranciers/`.

## 1. Een tarief bijwerken (meest voorkomend)

Een leverancier heeft zijn prijzen veranderd, of een leverancier staat in [`data/RAPPORT.md`](data/RAPPORT.md) als nog niet gepubliceerd.

1. Zoek het getal op de **eigen website van de leverancier**. Toont een leverancier tarieven pas na het invullen van een postcode, gebruik dan de rekentool of het tarievenblad.
2. Pas `handmatig` aan in `leveranciers/<id>.json`:

```json
"stroomInkoopopslag": {
  "waarde": 0.018,
  "inclBtw": true,
  "geverifieerd": true,
  "gecontroleerdOp": "2026-09-24",
  "bron": "https://tibber.com/nl/energiecontract",
  "notitie": "'inkoopvergoeding van €0,0180 per kWh'"
}
```

Uitleg per veld:
- **`waarde`**: neem het getal precies over zoals de site het toont. Zet `inclBtw` passend bij hoe de site het toont; het project publiceert automatisch het bedrag inclusief én exclusief btw. Noemt de site beide, zet het andere bedrag dan in `waardeInclBtw`, zodat er niets wordt afgerond.
- **`geverifieerd: true`**: verplicht. Voeg alleen een getal toe dat je op de eigen site of rekentool van de leverancier hebt gelezen, en zet die URL in `bron`. Getallen van vergelijkingssites, nieuwsartikelen of forums worden niet geaccepteerd; de validator weigert alles wat niet gecontroleerd is.
- **`terugleverCorrectie`**: dit wordt bij de uurprijs opgeteld voor stroom die je teruglevert. Bij "uurprijs min € 0,02 terugleverkosten" vul je `-0.02` in. Bij "uurprijs + € 0,02 bonus" vul je `0.02` in.
- **Vaste kosten**: gebruik het bedrag per maand per aansluiting.

3. Draai `npm run valideer` en open een PR met de bron-URL.

## 2. Een scraperregel toevoegen of repareren

Als een leverancier een tarief op de pagina zelf toont, kan de bot het met een regel elke dag controleren.

```json
"regels": {
  "stroomInkoopopslag": {
    "sectie": "kostenplaatje",
    "labels": ["inkoopvergoeding van"],
    "bereik": [0, 0.1],
    "inclBtw": true
  }
}
```

Zo werkt een regel: de pagina wordt omgezet naar platte tekst, waarbij koppen bewaard blijven als `## Kop ##`. De scraper:
1. springt naar de eerste match van `sectie`,
2. zoekt elke match van `labels` (regex, hoofdletterongevoelig),
3. neemt het dichtstbijzijnde eurobedrag binnen `venster` tekens erna,
4. weigert elk bedrag buiten `bereik`.

Opties:
- **`ervoor: true`**: het bedrag staat *vóór* het label ("€ 5,99 vaste kosten").
- **`negatief: true`**: de pagina toont kosten als positief getal, maar ze moeten negatief worden opgeslagen (terugleverkosten).
- **`"1,82 cent"`**: bedragen in centen worden automatisch omgerekend naar euro's.
- **Meerdere regels**: geef een lijst met regels; de eerste die slaagt wint. Handig bij "€ 0,059 (€ 0,077 vanaf 1 september)".
- **`"ophalen": "browser"`**: zet dit bij de leverancier als prijzen met JavaScript worden geladen. De pagina wordt dan in headless Chromium geladen. Dat is trager, dus gebruik het alleen als het nodig is.

Test je regel:

```sh
npm run debug -- tibber                          # live pagina
npm run debug -- tibber --zoek inkoop            # toon tekst rond een woord
npm run debug -- tibber --bestand opgeslagen.html # een pagina die je uit je browser hebt opgeslagen
```

Houd ook de `handmatig`-waarden in hetzelfde bestand bij, want die zijn de reserve als de site verandert. Voeg je een regel toe, dan beschermt een fixture in `test/fixtures/` plus een test in `test/uitlezen.test.ts` die tegen fouten in de toekomst.

## 3. Een rekentool-adapter toevoegen

Veel leveranciers tonen prijzen pas nadat je een adres invult. Hun rekentool laadt meestal een JSON-antwoord met elke tariefregel apart, en dat is betrouwbaarder dan een webpagina uitlezen. `src/rekentools/frank.ts` is het voorbeeld om na te maken.

1. Open de rekentool van de leverancier in je browser, open DevTools (F12) → **Network**, en vul het testadres in: **2584 RZ, huisnummer 1** (Madurodam). Gebruik niet je eigen adres.
2. Zoek het verzoek dat het aanbod teruggeeft. Bewaar het antwoord als `test/fixtures/<id>-<wat>-<datum>.json`, zonder persoonsgegevens.
3. Schrijf `src/rekentools/<id>.ts`. Die doet dezelfde verzoeken en geeft alleen de eigen regels van de leverancier terug: vaste kosten per maand, opslag en teruglevering. Negeer marktprijs, netbeheerkosten en belastingen. Controleer of bedragen incl. btw zijn: de regel voor energiebelasting verraadt het (€ 0,0916/kWh excl., € 0,1108 incl. in 2026).
4. Registreer de adapter in `src/rekentools/index.ts`, voeg een `rekentool`-blok toe aan het leveranciersbestand, en voeg een test toe die je fixture uitleest.

Gebruik gewone headers met de user agent van het project. Doe je niet voor als de app van de leverancier, log niet in, en verstuur nooit een aanmelding.

## 4. Een leverancier toevoegen

Kopieer een bestaand bestand (bijvoorbeeld `leveranciers/frank.json`) naar `leveranciers/<nieuw-id>.json`. De `id` moet gelijk zijn aan de bestandsnaam. Vul in:
- `producten`,
- `kenmerken.automatischAfschakelen` (of de leverancier teruglevering automatisch kan stoppen bij negatieve prijzen),
- `handmatig`-waarden met bronnen (alleen gecontroleerd; een leverancier zonder waarden wordt gewoon nog niet gepubliceerd),
- en regels als de site dat toelaat.

## 5. Energiebelasting

De bot leest de energiebelasting zelf van de site van de Belastingdienst. Je hoeft alleen iets te doen als [`data/RAPPORT.md`](data/RAPPORT.md) onder "Energiebelasting" een ⚠️ toont, bijvoorbeeld omdat de pagina anders is opgebouwd.

- Pas dan de reader aan in `src/lib/energiebelasting.ts`, sla een nieuwe kopie van de pagina op in `test/fixtures/` en werk `test/energiebelasting.test.ts` bij.
- Of voeg het nieuwe jaar met de hand toe onder `handmatig` in `belastingen/energiebelasting.json`. Neem de bedragen over zoals de Belastingdienst ze noemt: exclusief btw.

## Spelregels

- **Wees netjes tegen de sites van leveranciers**: het schema (wekelijks plus de 1e en 2e van de maand) is ruim voldoende. Voeg geen regels toe die rekentools of API's massaal bevragen, of die de voorwaarden van een site negeren.
- **Geen persoonsgegevens**: commit nooit privéadressen, aansluitcodes (EAN) of accountgegevens. Het enige adres in deze repo is het openbare testadres (Madurodam).
- **Houd PR's klein**: één leverancier per PR is het makkelijkst te beoordelen.
