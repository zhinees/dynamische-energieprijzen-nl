<!-- Thanks! Most PRs update one file in suppliers/. -->

**Supplier:** 
**What changed:** (new tariff / fixed scrape rule / new supplier)
**Source:** (URL on the supplier's own site, and the date you checked it)

- [ ] `checkedAt` updated, `verified: true` only if I read it on the supplier's own site
- [ ] `vatIncluded` matches how the site shows the amount
- [ ] `npm run debug -- <id>` shows OK for every rule I touched (if any)
- [ ] `npm run validate` passes
