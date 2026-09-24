<!-- Thanks! Most PRs update one file in suppliers/. -->

**Supplier:** 
**What changed:** (new tariff / fixed scrape rule / new supplier)
**Source:** (URL on the supplier's own site, and the date you checked it)

- [ ] Every value was read on the supplier's own site or calculator (`verified: true`, `source` = that URL, `checkedAt` updated)
- [ ] `vatIncluded` matches how the site shows the amount
- [ ] `npm run debug -- <id>` shows OK for every rule I touched (if any)
- [ ] `npm run validate` passes
