import { extractFieldAny } from "./extract.ts";
import type { CalculatorResult } from "../calculators/index.ts";
import {
  FIELD_KEYS,
  FIELD_UNITS,
  type FieldKey,
  type FieldRule,
  type FieldValue,
  type SupplierConfig,
  type SupplierData,
} from "./types.ts";

export const VAT = 0.21;
const r6 = (n: number) => Math.round(n * 1e6) / 1e6 + 0;
export const exclVat = (n: number) => r6(n / (1 + VAT));
export const inclVat = (n: number) => r6(n * (1 + VAT));

function relevant(cfg: SupplierConfig, key: FieldKey): boolean {
  if (key.startsWith("gas")) return cfg.products.gas;
  return cfg.products.electricity;
}

export function rulesFor(cfg: SupplierConfig, key: FieldKey): FieldRule[] {
  const r = cfg.fields[key];
  return r ? (Array.isArray(r) ? r : [r]) : [];
}

/** Every URL we need to fetch for this supplier (tariffUrl + per-field overrides). */
export function urlsFor(cfg: SupplierConfig): string[] {
  const urls = new Set<string>();
  for (const key of FIELD_KEYS) for (const rule of rulesFor(cfg, key)) urls.add(rule.url ?? cfg.tariffUrl);
  return [...urls];
}

function manualValue(cfg: SupplierConfig, key: FieldKey, prev?: FieldValue): FieldValue | undefined {
  const m = cfg.manual[key];
  if (!m || m.verified !== true) return undefined; // only real, checked data is published
  const value = m.vatIncluded ? exclVat(m.value) : r6(m.value);
  // Keep the exact published amount incl. btw (converting back would drift in the last decimal).
  const valueInclVat =
    m.valueInclVat !== undefined ? (m.valueInclVat === null ? null : r6(m.valueInclVat)) : m.vatIncluded ? r6(m.value) : inclVat(value);
  const checkedAt = `${m.checkedAt}T00:00:00Z`;
  // Keep a newer scraped/calculator value over an older manual one.
  if (prev && prev.source !== "manual" && prev.since && prev.since > checkedAt) return undefined;
  return {
    value,
    valueInclVat,
    unit: FIELD_UNITS[key],
    source: "manual",
    verified: m.verified,
    since: checkedAt,
    sourceUrl: m.source.startsWith("http") ? m.source : null,
  };
}

/**
 * Build one supplier's published record.
 * @param texts    url -> page text (from htmlToText); missing url = fetch failed
 * @param prev     last published record, so values survive a failed scrape
 * @param calc     values from the supplier's price calculator (highest priority)
 */
export function buildSupplier(
  cfg: SupplierConfig,
  texts: Map<string, string>,
  prev: SupplierData | undefined,
  now: string,
  fetchErrors: string[] = [],
  calc: CalculatorResult = {},
): SupplierData {
  const tariffs: SupplierData["tariffs"] = {};

  for (const key of FIELD_KEYS) {
    if (!relevant(cfg, key)) continue;
    const prevVal = prev?.tariffs[key];

    const c = calc[key];
    if (c) {
      const value = c.vatIncluded ? exclVat(c.value) : r6(c.value);
      const unchanged = prevVal?.source === "calculator" && prevVal.value === value;
      tariffs[key] = {
        value,
        valueInclVat: c.valueInclVat !== undefined ? r6(c.valueInclVat) : c.vatIncluded ? r6(c.value) : inclVat(value),
        unit: FIELD_UNITS[key],
        source: "calculator",
        verified: true,
        since: unchanged ? prevVal!.since : now,
        lastChecked: now,
        sourceUrl: cfg.tariffUrl,
      };
      continue;
    }

    const rules = rulesFor(cfg, key);
    let lastError: string | undefined;

    if (rules.length) {
      // All rules of a field use the same URL group; try each rule against its page.
      let scraped: FieldValue | undefined;
      for (const rule of rules) {
        const url = rule.url ?? cfg.tariffUrl;
        const text = texts.get(url);
        if (text === undefined) {
          lastError = "page could not be fetched";
          continue;
        }
        const res = extractFieldAny(text, key, rule);
        if (res.ok && res.value !== null) {
          const value = rule.vatIncluded ? exclVat(res.value) : res.value;
          const unchanged = prevVal?.source === "scraped" && prevVal.value === value;
          scraped = {
            value,
            valueInclVat: rule.vatIncluded ? r6(res.value) : inclVat(value),
            unit: FIELD_UNITS[key],
            source: "scraped",
            verified: true,
            since: unchanged ? prevVal!.since : now,
            lastChecked: now,
            sourceUrl: url,
          };
          break;
        }
        lastError = res.reason;
      }
      if (scraped) {
        tariffs[key] = scraped;
        continue;
      }
    }

    if (cfg.calculator && !lastError) lastError = "calculator returned no value";

    // Scrape failed or no rule: newest of (manual block, previous scraped value).
    const manual = manualValue(cfg, key, prevVal);
    const fallback = manual ?? (prevVal && prevVal.source !== "manual" ? { ...prevVal } : undefined);
    if (fallback) {
      if (lastError) fallback.lastError = lastError;
      else delete fallback.lastError;
      tariffs[key] = fallback;
    }
  }

  return {
    id: cfg.id,
    name: cfg.name,
    website: cfg.website,
    tariffUrl: cfg.tariffUrl,
    products: cfg.products,
    features: cfg.features,
    tariffs,
    lastRun: now,
    ...(fetchErrors.length ? { fetchError: fetchErrors.join("; ") } : {}),
  };
}
