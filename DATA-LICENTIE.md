# Datalicentie

De data in `data/`, de leveranciersbestanden in `leveranciers/`, `belastingen/`, `netbeheer/` en `thuisbatterijen/` zijn beschikbaar onder de
[Creative Commons Naamsvermelding 4.0 Internationaal-licentie (CC BY 4.0)](https://creativecommons.org/licenses/by/4.0/deed.nl).

Vermeld graag: **"dynamische-energieprijzen-nl"**, met een link naar deze repository.

## Onderliggende bronnen

De bestanden combineren data uit deze bronnen. Hun voorwaarden gelden voor dat deel van de data:

| Data | Bron | Opmerkingen |
| --- | --- | --- |
| Energiebelasting (`data/energiebelasting.json`) | [Belastingdienst](https://www.belastingdienst.nl) | Tarieven uit wet- en regelgeving (Wet belastingen op milieugrondslag); de overheid publiceert ze openbaar. |
| Netbeheerkosten (`data/netbeheer.json`) | De tariefbladen van de netbeheerders (URL in `bron` per netbeheerder) | Door de ACM gereguleerde tarieven, openbaar gepubliceerd. |
| Netbeheerder per postcode (`data/netbeheer-postcodes.json`) | Open kleinverbruiksgegevens van Liander, Stedin, Coteq, Rendo en Westland Infra; bestaande postcodes uit de PDOK Locatieserver | Alleen de afgeleide netbeheerder per postcode wordt gepubliceerd, geen verbruik. Stedin, Coteq en Westland Infra publiceren hun bestanden onder CC BY 4.0 (data.overheid.nl); bij Liander en Rendo staat geen licentie vermeld. |
| Tarieven van leveranciers | De openbare websites van de leveranciers (URL in `bronUrl` / `bron` van elke waarde) | Tarieven zijn feiten, verzameld van openbare pagina's. Merknamen zijn van hun eigenaars. |

Marktprijzen worden niet in deze repo opgeslagen of verspreid. De rekenhulp en het voorbeeld halen ze op het moment zelf op bij EnergyZero; daarvoor gelden de voorwaarden van EnergyZero.

Beheerders: controleer deze voorwaarden opnieuw voordat je de dataset breed promoot. Dit bestand is geen juridisch advies.
