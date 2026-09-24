# Data license

The data in `data/` and the supplier files in `suppliers/` are available under the
[Creative Commons Attribution 4.0 International license (CC BY 4.0)](https://creativecommons.org/licenses/by/4.0/).

Please credit: **"dynamische-energieprijzen-nl"**, with a link to this repository.

## Underlying sources

The files combine data from these sources. Their terms apply to that part of the data:

| Data | Source | Notes |
| --- | --- | --- |
| Electricity day-ahead prices (`"source": "entsoe"`) | [ENTSO-E Transparency Platform](https://transparency.entsoe.eu) | Credit ENTSO-E as the source. See their terms and conditions. |
| Electricity (`"source": "energyzero"`) and gas prices | [EnergyZero](https://www.energyzero.nl) public API | Check EnergyZero's terms before any commercial reuse. Where possible, the project uses ENTSO-E for electricity. |
| Supplier tariffs | The suppliers' public websites (URL in each value's `sourceUrl` / `source`) | Tariffs are facts collected from public pages. Trademarks belong to their owners. |

Maintainers: re-check these terms before promoting the dataset widely. This file is not legal advice.
