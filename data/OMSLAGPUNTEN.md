# Omslagpunten

Berekend op 2026-09-30 uit [`leveranciers.json`](leveranciers.json), bij elke nieuwe tariefwijziging opnieuw. Alle bedragen zijn inclusief btw.

Alleen het deel van de rekening dat per leverancier verschilt telt mee: **vaste kosten × 12 + verbruik × inkoopopslag** (met zonnepanelen ook **− teruglevering × terugleverCorrectie**, zie onderaan). Marktprijs, energiebelasting en netbeheerkosten zijn bij iedereen gelijk en veranderen een omslagpunt dus niet. Leveranciers die hun vaste kosten of opslag niet publiceren, tellen niet mee.

Reken je eigen situatie door met `npm run rekenhulp -- --stroom 2500 --gas 1000`.

## Stroom

- Vaste kosten: € 71,87 – € 102,85 per jaar (verschil € 30,98)
- Inkoopopslag: € 0,0100 – € 0,0253 per kWh (verschil € 0,0153)
- **Omslagpunt: 2.027 kWh per jaar** (was 3.297 kWh op 2026-09-26). Onder dit verbruik wegen de verschillen in vaste kosten zwaarder, erboven de verschillen in opslag.

Goedkoopste leverancier per jaarverbruik:

| Verbruik (kWh/jaar) | Goedkoopste |
| --- | --- |
| 0 – 3 | Energiek |
| 3 – 625 | Vattenfall (FlexPrijs) |
| 625 en meer | Powerpeers |

Omslagpunt per paar (onder het omslagpunt is de eerste goedkoper, erboven de tweede):

| Lagere vaste kosten | Lagere opslag | Omslagpunt (kWh/jaar) |
| --- | --- | --- |
| Energiek | Vattenfall (FlexPrijs) | 3 |
| Energiek | Budget Thuis (Budget Energie) | 8 |
| Vandebron | Frank Energie | 15 |
| Essent | EnergyZero | 42 |
| Essent | Greenchoice | 42 |
| Energiedirect | Frank Energie | 51 |
| Live Energy | Powerpeers | 169 |
| Vandebron | easyEnergy | 200 |
| NextEnergy | Pure Energie | 239 |
| NextEnergy | Mega | 253 |
| NextEnergy | Powerpeers | 284 |
| Mega | Powerpeers | 294 |
| Pure Energie | Powerpeers | 300 |
| Energiek | Powerpeers | 390 |
| Budget Thuis (Budget Energie) | Powerpeers | 457 |
| Live Energy | Zonneplan | 571 |
| Vattenfall (FlexPrijs) | Powerpeers | 625 |
| Essent | Zonopnaam Energie | 1.150 |
| Essent | ANWB Energie | 1.698 |
| Live Energy | Tibber | 1.819 |
| Live Energy | Frank Energie | 1.884 |
| EnergyZero | Zonopnaam Energie | 2.440 |
| Greenchoice | Zonopnaam Energie | 2.440 |
| EnergyZero | ANWB Energie | 2.769 |
| Greenchoice | ANWB Energie | 2.769 |
| Live Energy | Energiedirect | 3.049 |
| NextEnergy | Zonneplan | 3.120 |
| Zonopnaam Energie | ANWB Energie | 3.181 |
| Eneco | ANWB Energie | 3.670 |
| Eneco | Zonopnaam Energie | 3.990 |
| NextEnergy | Tibber | 4.000 |
| NextEnergy | Frank Energie | 4.253 |
| Zonneplan | Tibber | 4.440 |
| Vandebron | ANWB Energie | 4.485 |
| Live Energy | easyEnergy | 4.711 |
| Live Energy | ANWB Energie | 4.781 |
| easyEnergy | ANWB Energie | 4.825 |
| Zonneplan | Frank Energie | 4.865 |
| Live Energy | Vandebron | 5.349 |
| Live Energy | Zonopnaam Energie | 5.523 |
| Vandebron | Zonopnaam Energie | 5.697 |
| easyEnergy | Zonopnaam Energie | 6.606 |
| Energiedirect | ANWB Energie | 7.344 |
| Live Energy | Eneco | 9.268 |
| Live Energy | EnergyZero | 9.775 |
| Live Energy | Greenchoice | 9.775 |
| NextEnergy | ANWB Energie | 10.120 |
| Eneco | EnergyZero | 10.909 |
| Eneco | Greenchoice | 10.909 |
| Zonneplan | ANWB Energie | 13.620 |
| Energiek | Pure Energie | 18.718 |
| Energiedirect | Zonopnaam Energie | 22.636 |
| NextEnergy | Zonopnaam Energie | 23.295 |
| NextEnergy | Energiedirect | 24.000 |
| Essent | OM | nieuwe energie | 46.321 |
| Mega | Tibber | 75.200 |
| Frank Energie | ANWB Energie | 121.600 |
| Mega | ANWB Energie | 197.600 |
| Energiek | Tibber | 414.138 |
| Zonneplan | Zonopnaam Energie | 599.714 |
| Energiek | ANWB Energie | 1.047.241 |

## Gas

- Vaste kosten: € 65,88 – € 117,00 per jaar (verschil € 51,12)
- Inkoopopslag: € 0,0598 – € 0,1298 per m³ (verschil € 0,0700)
- **Omslagpunt: 731 m³ per jaar** (was 1.005 m³ op 2026-09-26). Onder dit verbruik wegen de verschillen in vaste kosten zwaarder, erboven de verschillen in opslag.

Goedkoopste leverancier per jaarverbruik:

| Verbruik (m³/jaar) | Goedkoopste |
| --- | --- |
| 0 – 399 | Energiedirect |
| 399 – 69.368 | Energiek |
| 69.368 en meer | Vandebron |

Omslagpunt per paar (onder het omslagpunt is de eerste goedkoper, erboven de tweede):

| Lagere vaste kosten | Lagere opslag | Omslagpunt (m³/jaar) |
| --- | --- | --- |
| easyEnergy | EnergyZero | 109 |
| easyEnergy | Greenchoice | 109 |
| easyEnergy | Zonopnaam Energie | 120 |
| Pure Energie | Zonneplan | 126 |
| Pure Energie | Powerpeers | 142 |
| Tibber | Live Energy | 197 |
| Eneco | EnergyZero | 202 |
| Eneco | Greenchoice | 202 |
| Eneco | Zonopnaam Energie | 242 |
| Pure Energie | Vandebron | 290 |
| Tibber | Zonneplan | 374 |
| easyEnergy | OM | nieuwe energie | 379 |
| Energiedirect | Energiek | 399 |
| Powerpeers | Vandebron | 401 |
| Tibber | Vandebron | 423 |
| Zonneplan | Vandebron | 443 |
| Live Energy | Vandebron | 456 |
| Tibber | Powerpeers | 499 |
| Live Energy | Zonneplan | 511 |
| Energiedirect | Budget Thuis (Budget Energie) | 552 |
| Pure Energie | Frank Energie | 596 |
| easyEnergy | ANWB Energie | 623 |
| NextEnergy | Vandebron | 629 |
| Essent | Vandebron | 638 |
| Pure Energie | EnergyZero | 723 |
| Pure Energie | Greenchoice | 723 |
| Eneco | OM | nieuwe energie | 763 |
| Vattenfall (FlexPrijs) | Vandebron | 795 |
| Pure Energie | Zonopnaam Energie | 910 |
| Live Energy | Powerpeers | 923 |
| Eneco | ANWB Energie | 1.182 |
| Energiedirect | Vandebron | 1.191 |
| Frank Energie | EnergyZero | 1.222 |
| Frank Energie | Greenchoice | 1.222 |
| Tibber | EnergyZero | 1.352 |
| Tibber | Greenchoice | 1.352 |
| Tibber | Frank Energie | 1.428 |
| Pure Energie | OM | nieuwe energie | 1.592 |
| Live Energy | EnergyZero | 1.785 |
| Live Energy | Greenchoice | 1.785 |
| Pure Energie | ANWB Energie | 2.000 |
| Powerpeers | EnergyZero | 2.098 |
| Powerpeers | Greenchoice | 2.098 |
| Tibber | Zonopnaam Energie | 2.135 |
| Live Energy | Frank Energie | 2.355 |
| Budget Thuis (Budget Energie) | Vandebron | 2.805 |
| Zonneplan | EnergyZero | 2.970 |
| Zonneplan | Greenchoice | 2.970 |
| Live Energy | Zonopnaam Energie | 3.597 |
| Tibber | OM | nieuwe energie | 3.709 |
| Tibber | ANWB Energie | 3.906 |
| Powerpeers | Frank Energie | 4.018 |
| OM | nieuwe energie | ANWB Energie | 4.422 |
| NextEnergy | EnergyZero | 4.474 |
| NextEnergy | Greenchoice | 4.474 |
| Essent | EnergyZero | 4.806 |
| Essent | Greenchoice | 4.806 |
| Live Energy | ANWB Energie | 5.620 |
| Live Energy | OM | nieuwe energie | 6.436 |
| Powerpeers | Zonopnaam Energie | 6.701 |
| Powerpeers | ANWB Energie | 7.925 |
| Zonopnaam Energie | ANWB Energie | 8.820 |
| Frank Energie | ANWB Energie | 10.784 |
| Zonneplan | ANWB Energie | 13.125 |
| Powerpeers | OM | nieuwe energie | 13.262 |
| NextEnergy | ANWB Energie | 20.509 |
| Essent | ANWB Energie | 23.500 |
| Zonneplan | Frank Energie | 64.286 |
| Energiek | Vandebron | 69.368 |
| Zonneplan | Zonopnaam Energie | 107.214 |
| Vattenfall (FlexPrijs) | EnergyZero | 393.913 |
| Vattenfall (FlexPrijs) | Greenchoice | 393.913 |
| Energiedirect | EnergyZero | 482.400 |
| Energiedirect | Greenchoice | 482.400 |
| Energiedirect | Vattenfall (FlexPrijs) | 1.500.000 |

## Teruglevering (zonnepanelen)

Met zonnepanelen telt ook de `terugleverCorrectie` mee: per jaar betaal je *teruglevering × correctie* (negatief = kosten, positief = bonus). Bij een vaste hoeveelheid teruglevering werkt dat als een extra vast bedrag per jaar, dus het verschuift de omslagpunten van stroom.

- terugleverCorrectie: € -0,0303 – € 0,0200 per kWh (verschil € 0,0503)
- **Omslagpunt: 616 kWh teruglevering per jaar** (was 687 kWh op 2026-09-26). Lever je meer terug, dan wegen de verschillen in terugleverCorrectie zwaarder dan de verschillen in vaste kosten.

Goedkoopste stroomleverancier per verbruik, bij deze hoeveelheden teruglevering:

| Teruglevering (kWh/jaar) | Verbruik (kWh/jaar) | Goedkoopste |
| --- | --- | --- |
| 1.000 | 0 – 3.000 | Zonneplan |
| 1.000 | 3.000 en meer | Powerpeers |
| 2.000 | 0 – 6.000 | Zonneplan |
| 2.000 | 6.000 en meer | Powerpeers |
| 4.000 | 0 – 12.000 | Zonneplan |
| 4.000 | 12.000 en meer | Powerpeers |

## Geschiedenis

| Datum | Omslagpunt stroom | Omslagpunt gas | Omslagpunt teruglevering |
| --- | --- | --- | --- |
| 2026-09-30 | 2.027 kWh | 731 m³ | 616 kWh |
| 2026-09-26 | 3.297 kWh | 1.005 m³ | 687 kWh |
| 2026-09-26 | 3.297 kWh | 1.152 m³ | 687 kWh |
| 2026-09-24 | 1.642 kWh | 309 m³ | 274 kWh |
