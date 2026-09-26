# Omslagpunten

Berekend op 2026-09-26 uit [`leveranciers.json`](leveranciers.json), bij elke nieuwe tariefwijziging opnieuw. Alle bedragen zijn inclusief btw.

Alleen het deel van de rekening dat per leverancier verschilt telt mee: **vaste kosten × 12 + verbruik × inkoopopslag** (met zonnepanelen ook **− teruglevering × terugleverCorrectie**, zie onderaan). Marktprijs, energiebelasting en netbeheerkosten zijn bij iedereen gelijk en veranderen een omslagpunt dus niet. Leveranciers die hun vaste kosten of opslag niet publiceren, tellen niet mee.

Reken je eigen situatie door met `npm run rekenhulp -- --stroom 2500 --gas 1000`.

## Stroom

- Vaste kosten: € 71,88 – € 102,24 per jaar (verschil € 30,36)
- Inkoopopslag: € 0,0150 – € 0,0242 per kWh (verschil € 0,0092)
- **Omslagpunt: 3.297 kWh per jaar**. Onder dit verbruik wegen de verschillen in vaste kosten zwaarder, erboven de verschillen in opslag.

Goedkoopste leverancier per jaarverbruik:

| Verbruik (kWh/jaar) | Goedkoopste |
| --- | --- |
| 0 en meer | Vattenfall (FlexPrijs) |

Omslagpunt per paar (onder het omslagpunt is de eerste goedkoper, erboven de tweede):

| Lagere vaste kosten | Lagere opslag | Omslagpunt (kWh/jaar) |
| --- | --- | --- |
| Vandebron | Frank Energie | 15 |
| NextEnergy | Pure Energie | 239 |
| Live Energy | Zonneplan | 571 |
| Live Energy | Tibber | 1.819 |
| Live Energy | Frank Energie | 1.884 |
| NextEnergy | Zonneplan | 3.120 |
| Eneco | ANWB Energie | 3.670 |
| NextEnergy | Tibber | 4.000 |
| NextEnergy | Frank Energie | 4.253 |
| Zonneplan | Tibber | 4.440 |
| Vandebron | ANWB Energie | 4.485 |
| Live Energy | ANWB Energie | 4.781 |
| Zonneplan | Frank Energie | 4.865 |
| Live Energy | Vandebron | 5.349 |
| Live Energy | Eneco | 9.268 |
| NextEnergy | ANWB Energie | 10.120 |
| Zonneplan | ANWB Energie | 13.620 |
| Frank Energie | ANWB Energie | 121.600 |

## Gas

- Vaste kosten: € 71,88 – € 117,00 per jaar (verschil € 45,12)
- Inkoopopslag: € 0,0598 – € 0,1047 per m³ (verschil € 0,0449)
- **Omslagpunt: 1.005 m³ per jaar** (was 1.152 m³ op 2026-09-26). Onder dit verbruik wegen de verschillen in vaste kosten zwaarder, erboven de verschillen in opslag.

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
| Vattenfall (FlexPrijs) | Vandebron | 795 |
| Eneco | ANWB Energie | 1.182 |
| Tibber | Frank Energie | 1.428 |
| Pure Energie | ANWB Energie | 2.000 |
| Live Energy | Frank Energie | 2.355 |
| Budget Thuis (Budget Energie) | Vandebron | 2.805 |
| Tibber | ANWB Energie | 3.906 |
| Live Energy | ANWB Energie | 5.620 |
| Frank Energie | ANWB Energie | 10.784 |
| Zonneplan | ANWB Energie | 13.125 |
| NextEnergy | ANWB Energie | 20.509 |
| Zonneplan | Frank Energie | 64.286 |

## Teruglevering (zonnepanelen)

Met zonnepanelen telt ook de `terugleverCorrectie` mee: per jaar betaal je *teruglevering × correctie* (negatief = kosten, positief = bonus). Bij een vaste hoeveelheid teruglevering werkt dat als een extra vast bedrag per jaar, dus het verschuift de omslagpunten van stroom.

- terugleverCorrectie: € -0,0242 – € 0,0200 per kWh (verschil € 0,0442)
- **Omslagpunt: 687 kWh teruglevering per jaar**. Lever je meer terug, dan wegen de verschillen in terugleverCorrectie zwaarder dan de verschillen in vaste kosten.

Goedkoopste stroomleverancier per verbruik, bij deze hoeveelheden teruglevering:

| Teruglevering (kWh/jaar) | Verbruik (kWh/jaar) | Goedkoopste |
| --- | --- | --- |
| 1.000 | 0 – 3.371 | Zonneplan |
| 1.000 | 3.371 en meer | Vattenfall (FlexPrijs) |
| 2.000 | 0 – 7.364 | Zonneplan |
| 2.000 | 7.364 en meer | Vattenfall (FlexPrijs) |
| 4.000 | 0 – 15.351 | Zonneplan |
| 4.000 | 15.351 en meer | Vattenfall (FlexPrijs) |

## Geschiedenis

| Datum | Omslagpunt stroom | Omslagpunt gas | Omslagpunt teruglevering |
| --- | --- | --- | --- |
| 2026-09-26 | 3.297 kWh | 1.005 m³ | 687 kWh |
| 2026-09-26 | 3.297 kWh | 1.152 m³ | 687 kWh |
| 2026-09-24 | 1.642 kWh | 309 m³ | 274 kWh |
