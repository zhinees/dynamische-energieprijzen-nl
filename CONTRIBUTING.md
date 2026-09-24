# Contributing

Thanks for helping keep the tariffs correct. Almost every contribution is an edit to one file in `suppliers/`.

## 1. Update a tariff (most common)

A supplier changed its prices, or a value in [`data/REPORT.md`](data/REPORT.md) is marked ❔ unverified.

1. Find the number on the **supplier's own website**. For suppliers that only show tariffs after entering a postcode, use their tariff calculator or tarievenblad.
2. Edit `manual` in `suppliers/<id>.json`:

```json
"electricityMarkup": {
  "value": 0.018,
  "vatIncluded": true,
  "verified": true,
  "checkedAt": "2026-09-24",
  "source": "https://tibber.com/nl/energiecontract",
  "note": "'inkoopvergoeding van €0,0180 per kWh'"
}
```

Field notes:
- **`value`**: copy the number exactly as the site shows it. Set `vatIncluded` to match how the site shows it; the conversion to excl. btw happens automatically.
- **`verified: true`**: only when you read the number on the supplier's own site. Numbers from comparison sites, news articles or forums get `verified: false`, and `source` names where they came from.
- **`feedInDelta`**: this is what gets added to the hourly price for power you feed back. For "uurprijs minus € 0,02 terugleverkosten", enter `-0.02`. For "uurprijs + € 0,02 bonus", enter `0.02`.
- **Fixed costs**: use the monthly amount per connection (per aansluiting).

3. Run `npm run validate` and open a PR with the source URL.

## 2. Add or fix a scrape rule

If a supplier shows a tariff in the page itself, a rule lets the bot check it every day.

```json
"fields": {
  "electricityMarkup": {
    "section": "kostenplaatje",
    "labels": ["inkoopvergoeding van"],
    "range": [0, 0.1],
    "vatIncluded": true
  }
}
```

How a rule works: the page is turned into plain text, with headings kept as `## Heading ##`. The scraper:
1. jumps to the first match of `section`,
2. finds each `labels` match (case-insensitive regex),
3. takes the nearest euro amount within `window` characters after it,
4. rejects any amount outside `range`.

Options:
- **`before: true`**: the amount comes *before* the label ("€ 5,99 vaste kosten").
- **`negate: true`**: the page shows a cost as a positive number, but it must be stored negative (terugleverkosten).
- **`"1,82 cent"`**: amounts in cents are converted to euros automatically.
- **Several rules**: give a list of rules; the first one that succeeds wins. Useful for "€ 0,059 (€ 0,077 vanaf 1 september)".
- **`"render": "browser"`**: set this on the supplier when prices are loaded by JavaScript. The page is then loaded in headless Chromium, which is slower, so use it only when needed.

Test your rule:

```sh
npm run debug -- tibber                     # live page
npm run debug -- tibber --grep inkoop       # show text around a word
npm run debug -- tibber --file saved.html   # a page you saved from your browser
```

Also keep the `manual` values in the same file up to date, because they are the fallback when the site changes. If you add a rule, a fixture in `test/fixtures/` plus a test in `test/extract.test.ts` protects it from regressions.

## 3. Add a calculator adapter

Many suppliers only show prices after you enter an address. Their calculator usually loads a JSON response with every tariff line separately, which is more reliable than reading a web page. `src/calculators/frank.ts` is the example to copy.

1. Open the supplier's calculator in your browser, open DevTools (F12) → **Network**, and enter the test address **2584 RZ, huisnummer 1** (Madurodam). Don't use your own address.
2. Find the request that returns the offer. Save its response as `test/fixtures/<id>-<what>-<date>.json`, with no personal data in it.
3. Write `src/calculators/<id>.ts`. It repeats the same requests and returns only the supplier's own lines: fixed monthly costs, markup and feed-in. Ignore market price, grid costs and taxes. Check whether amounts are incl. btw: the energy tax line is a good tell (€ 0,0916/kWh excl., € 0,1108 incl. in 2026).
4. Register it in `src/calculators/index.ts`, add a `calculator` block to the supplier file, and add a test that parses your fixture.

Use plain headers with the project's user agent. Don't imitate the supplier's own app, don't log in, and never submit a signup.

## 4. Add a supplier

Copy an existing file (for example `suppliers/frank.json`) to `suppliers/<new-id>.json`. The `id` must match the file name. Fill in:
- `products`,
- `features.autoCurtailment` (whether it can automatically stop feed-in at negative prices),
- `manual` values with sources,
- and rules if the site allows it.

## Ground rules

- **Be polite to supplier sites**: the schedule (weekly plus the 1st and 2nd of the month) is plenty. Don't add rules that hit calculators or APIs in bulk, or that ignore a site's terms.
- **No personal data**: never commit private addresses, connection codes (EAN) or account details. The only address in this repo is the public test address (Madurodam).
- **Keep PRs small**: one supplier per PR is easiest to review.
