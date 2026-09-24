# Dynamische energieprijzen NL

Open data for Dutch dynamic energy contracts, updated automatically by GitHub Actions:

- **Day-ahead market prices**: hourly electricity (and quarter-hourly when available), plus gas, per day.
- **Supplier tariffs** for dynamic contracts: fixed monthly costs, inkoopopslag (purchase markup) and teruglevering (feed-in), per supplier.
- **Ready-made comparisons**: each supplier's buy and sell price per hour, for today and tomorrow.

Think of it like an ad-block filter list. The data lives as plain JSON/CSV files in this repo, and a scheduled job keeps it current. Anyone can use the files for charts, comparison sites, home automation or research. Corrections are pull requests.

> **All amounts are in EUR, excluding VAT (btw), energy tax (energiebelasting) and grid costs.**
>
> **Only real data is published.** Every tariff was read from the supplier's own website or price calculator. Values that can't be verified are left out, never estimated or copied from third-party sites.

## Use the data

Fetch any file straight from GitHub. `raw.githubusercontent.com` allows cross-origin requests, so this works in the browser as well as on a server.

```
https://raw.githubusercontent.com/OWNER/dynamische-energieprijzen-nl/main/data/<file>
```

A CDN alternative is `https://cdn.jsdelivr.net/gh/OWNER/dynamische-energieprijzen-nl@main/data/<file>`. Note that jsDelivr caches branch URLs for up to 12 hours, so use raw GitHub if you need freshness.

| File | What | Updated |
| --- | --- | --- |
| `data/prices/latest.json` | Full price files for `today` and `tomorrow` (tomorrow is `null` until ~13:00) | several times a day |
| `data/prices/YYYY/YYYY-MM-DD.json` / `.csv` | One day of prices (history) | once per day, when published |
| `data/prices/index.json` | List of available days | daily |
| `data/suppliers.json` / `.csv` | Current tariffs per supplier, with source and verification per value | weekly + 1st/2nd of the month |
| `data/compare/latest.json` | Per hour: market price, plus `buy` and `sell` per supplier, for today and tomorrow | several times a day |
| `data/tariff-changes.json` | Log of every tariff change | when tariffs change |
| `data/REPORT.md` | Where each value comes from, and which suppliers aren't published yet | with suppliers.json |

### Example: the price today at 18:00

```js
const BASE = "https://raw.githubusercontent.com/OWNER/dynamische-energieprijzen-nl/main/data";
const { today } = await (await fetch(`${BASE}/compare/latest.json`)).json();

const at18 = today.hours.find((h) => h.start.slice(11, 13) === "18"); // start is local time
console.log(at18.market);        // e.g. 0.22118  (EUR/kWh, market price)
console.log(at18.buy.tibber);    // market + Tibber's inkoopopslag
console.log(at18.sell.zonneplan); // what Zonneplan pays per kWh fed back at that hour
```

More in [`examples/`](examples): a Node script (`price-at-hour.mjs`) and an Astro component (`astro/EnergyPrices.astro`).

### Data format

Every file has a JSON Schema in [`schema/`](schema) and a `$schema` field pointing to it. A few conventions:

- **Times**: `start` is local Amsterdam time with offset (`2026-09-24T18:00:00+02:00`), and `startUtc` is the same moment in UTC. DST days have 23 or 25 hours.
- **Hourly and quarter-hourly**: The day-ahead market uses 15-minute slots. `hourly` is always present; with ENTSO-E as the source, `quarterHourly` holds the 15-minute prices, and `hourly` is their average.
- **Tariff fields**:
  - `electricityFixedMonthly`, `gasFixedMonthly`: EUR per month.
  - `electricityMarkup`: EUR/kWh.
  - `gasMarkup`: EUR/m³.
  - `feedInDelta`: EUR/kWh *added* to the hourly price for power you feed back. It is negative for a cost (terugleverkosten) and positive for a bonus (e.g. Zonneplan).
- **Per tariff value**:
  - `value`: excl. btw. `valueInclVat`: incl. btw, the supplier's own number when it publishes one (otherwise `value` × 1.21; `null` when it's unknown whether btw applies).
  - `source`: `scraped` (read from the supplier's web page by the bot), `calculator` (from the supplier's own price calculator) or `manual` (from the supplier's config file).
  - `verified`: always `true`. Unverified values are rejected by the validator.
  - `since`: when this value started.
  - `lastChecked`: the bot's last confirmation.
- **Rounding**: prices are rounded to 6 decimals.

## Where the data comes from

- **Electricity**: [ENTSO-E Transparency Platform](https://transparency.entsoe.eu), the official source (needs a free API token). The [EnergyZero](https://www.energyzero.nl) public API is the fallback. Each day file records which one was used.
- **Gas**: EnergyZero public API.
- **Supplier tariffs**: each supplier has a config file in [`suppliers/`](suppliers). It holds:
  - **a calculator adapter** (optional): the bot asks the supplier's own price calculator for an offer at a fixed public test address, Madurodam (George Maduroplein 1, Den Haag), and keeps only the supplier's own tariff lines. Supplier markups are the same nationwide; grid costs, which do depend on the address, are ignored.
  - **scrape rules**: where on the supplier's website each number is found.
  - **manual values**: hand-checked on the supplier's own site, with source URL and date. They are used when there is no rule, or a rule breaks. Unverified values are not accepted.

  Suppliers are checked every Monday and on the 1st and 2nd of each month (tariffs usually change on the 1st). That is a handful of requests per supplier per month. See [`data/REPORT.md`](data/REPORT.md) for the current state. Help with more calculator adapters is welcome.

## Run it yourself

Requires Node 22.18+ (runs TypeScript directly, no build step).

```sh
npm ci
npm run prices                    # today + tomorrow → data/prices/
npm run prices -- 2026-01-01 2026-01-31   # backfill a range
npm run suppliers                 # scrape tariffs → data/suppliers.json
npm run derive                    # index.json + compare/latest.json
npm run check                     # typecheck + tests + validate
npm run debug -- tibber           # show what the scraper reads for one supplier
```

### Setting up the repo on GitHub

1. Push this repo and replace `OWNER` with your GitHub user or org:
   `grep -rl OWNER --exclude-dir=node_modules . | xargs sed -i 's/OWNER/your-name/g'`
2. **Settings → Actions → General → Workflow permissions**: choose *Read and write*, so the bot can commit data.
3. Optional, recommended: get a free ENTSO-E API token. Register at transparency.entsoe.eu and request API access; the platform's API guide describes the current procedure (it used to be an email to transparency@entsoe.eu with the subject "Restful API access"). Add the token as the repository secret `ENTSOE_TOKEN`. Without it, electricity prices come from EnergyZero.
4. Run both workflows once from the **Actions** tab (*Run workflow*).

The workflows:

- `prices.yml`: runs at 11:05, 12:05, 13:05, 15:05, 22:05 and 23:05 UTC. It commits only when data changed.
- `suppliers.yml`: runs at 04:17 UTC every Monday and on the 1st and 2nd of the month. It keeps one issue open while a scrape rule or calculator is broken, and closes it again when all of them work.
- `ci.yml`: runs on every PR. It checks types, tests, schemas and every supplier config.

## Contributing

The most useful help is checking a supplier's current tariffs and updating its file in `suppliers/`. See [CONTRIBUTING.md](CONTRIBUTING.md).

## License

- Code: [MIT](LICENSE).
- Data in `data/` and `suppliers/`: [CC BY 4.0](DATA-LICENSE.md). Credit "dynamische-energieprijzen-nl" and the underlying sources listed there.

This project is not affiliated with any energy supplier, and nothing here is financial advice. Always check the supplier's own terms before switching.
