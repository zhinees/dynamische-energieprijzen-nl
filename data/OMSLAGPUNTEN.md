# Omslagpunten

Berekend op 2026-09-24 uit [`leveranciers.json`](leveranciers.json), bij elke nieuwe tariefwijziging opnieuw. Alle bedragen zijn inclusief btw.

Alleen het deel van de rekening dat per leverancier verschilt telt mee: **vaste kosten × 12 + verbruik × inkoopopslag** (met zonnepanelen ook **− teruglevering × terugleverCorrectie**, zie onderaan). Marktprijs, energiebelasting en netbeheerkosten zijn bij iedereen gelijk en veranderen een omslagpunt dus niet. Leveranciers die hun vaste kosten of opslag niet publiceren, tellen niet mee.

Reken je eigen situatie door met `npm run rekenhulp -- --stroom 2500 --gas 1000`.

## Stroom

- Vaste kosten: € 71,88 – € 84,00 per jaar (verschil € 12,12)
- Inkoopopslag: € 0,0168 – € 0,0242 per kWh (verschil € 0,0074)
- **Omslagpunt: 1.642 kWh per jaar**. Onder dit verbruik wegen de verschillen in vaste kosten zwaarder, erboven de verschillen in opslag.

Goedkoopste leverancier per jaarverbruik:

| Verbruik (kWh/jaar) | Goedkoopste |
| --- | --- |
| 0 en meer | Budget Thuis (Budget Energie) |

Omslagpunt per paar (onder het omslagpunt is de eerste goedkoper, erboven de tweede):

| Lagere vaste kosten | Lagere opslag | Omslagpunt (kWh/jaar) |
| --- | --- | --- |
| Vandebron | Frank Energie | 15 |
| NextEnergy | Pure Energie | 239 |
| Live Energy | Zonneplan | 571 |
| Live Energy | Tibber | 1.819 |
| Live Energy | Frank Energie | 1.884 |
| NextEnergy | Zonneplan | 3.120 |
| NextEnergy | Tibber | 4.000 |
| NextEnergy | Frank Energie | 4.253 |
| Zonneplan | Tibber | 4.440 |
| Zonneplan | Frank Energie | 4.865 |
| Live Energy | Vandebron | 5.349 |

## Gas

- Vaste kosten: € 71,88 – € 84,00 per jaar (verschil € 12,12)
- Inkoopopslag: € 0,0598 – € 0,0990 per m³ (verschil € 0,0392)
- **Omslagpunt: 309 m³ per jaar**. Onder dit verbruik wegen de verschillen in vaste kosten zwaarder, erboven de verschillen in opslag.

Goedkoopste leverancier per jaarverbruik:

| Verbruik (m³/jaar) | Goedkoopste |
| --- | --- |
| 0 – 2.805 | Budget Thuis (Budget Energie) |
| 2.805 en meer | Vandebron |

Omslagpunt per paar (onder het omslagpunt is de eerste goedkoper, erboven de tweede):

| Lagere vaste kosten | Lagere opslag | Omslagpunt (m³/jaar) |
| --- | --- | --- |
| Pure Energie | Zonneplan | 126 |
| Tibber | Live Energy | 197 |
| Pure Energie | Vandebron | 290 |
| Tibber | Zonneplan | 374 |
| Tibber | Vandebron | 423 |
| Zonneplan | Vandebron | 443 |
| Live Energy | Vandebron | 456 |
| Live Energy | Zonneplan | 511 |
| Pure Energie | Frank Energie | 596 |
| NextEnergy | Vandebron | 629 |
| Tibber | Frank Energie | 1.428 |
| Live Energy | Frank Energie | 2.355 |
| Budget Thuis (Budget Energie) | Vandebron | 2.805 |
| Zonneplan | Frank Energie | 64.286 |

## Teruglevering (zonnepanelen)

Met zonnepanelen telt ook de `terugleverCorrectie` mee: per jaar betaal je *teruglevering × correctie* (negatief = kosten, positief = bonus). Bij een vaste hoeveelheid teruglevering werkt dat als een extra vast bedrag per jaar, dus het verschuift de omslagpunten van stroom.

- terugleverCorrectie: € -0,0242 – € 0,0200 per kWh (verschil € 0,0442)
- **Omslagpunt: 274 kWh teruglevering per jaar**. Lever je meer terug, dan wegen de verschillen in terugleverCorrectie zwaarder dan de verschillen in vaste kosten.

Goedkoopste stroomleverancier per verbruik, bij deze hoeveelheden teruglevering:

| Teruglevering (kWh/jaar) | Verbruik (kWh/jaar) | Goedkoopste |
| --- | --- | --- |
| 1.000 | 0 – 5.308 | Zonneplan |
| 1.000 | 5.308 en meer | Budget Thuis (Budget Energie) |
| 2.000 | 0 – 11.597 | Zonneplan |
| 2.000 | 11.597 en meer | Budget Thuis (Budget Energie) |
| 4.000 | 0 – 24.176 | Zonneplan |
| 4.000 | 24.176 en meer | Budget Thuis (Budget Energie) |
