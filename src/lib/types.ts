// Shared types. All money is EUR, excluding VAT (btw) and energy tax (energiebelasting).

export type FieldKey =
  | "electricityFixedMonthly" // vaste leveringskosten stroom, EUR/month
  | "electricityMarkup"       // inkoopopslag stroom, EUR/kWh
  | "gasFixedMonthly"         // vaste leveringskosten gas, EUR/month
  | "gasMarkup"               // inkoopopslag gas, EUR/m3
  | "feedInDelta";            // teruglevering: EUR/kWh added to the hourly price (negative = cost, positive = bonus)

export const FIELD_KEYS: FieldKey[] = [
  "electricityFixedMonthly",
  "electricityMarkup",
  "gasFixedMonthly",
  "gasMarkup",
  "feedInDelta",
];

export const FIELD_UNITS: Record<FieldKey, string> = {
  electricityFixedMonthly: "EUR/month",
  electricityMarkup: "EUR/kWh",
  gasFixedMonthly: "EUR/month",
  gasMarkup: "EUR/m3",
  feedInDelta: "EUR/kWh",
};

/** How to find one number on a supplier page. */
export interface FieldRule {
  /** Case-insensitive regexes for the text right before the number. Tried in order. */
  labels: string[];
  /** Values outside [min, max] are rejected (after `negate`). */
  range: [number, number];
  /** Characters after the label to search for the amount. Default 160. */
  window?: number;
  /** Regex for the heading/text where the search starts. Defaults: stroom/elektriciteit or gas heading. */
  section?: string;
  /** Page states a cost (e.g. terugleverkosten 0,02) that must be stored negative. */
  negate?: boolean;
  /** Override the supplier's tariff URL for this field. */
  url?: string;
  /** The amount appears BEFORE the label ("€ 5,99 vaste kosten"). Nearest amount wins. */
  before?: boolean;
  /** The page states this amount including 21% VAT; it is converted to excl. VAT. */
  vatIncluded?: boolean;
}

/** One file per supplier in /suppliers. This is what contributors edit. */
export interface SupplierConfig {
  $schema?: string;
  $comment?: string;
  id: string;
  name: string;
  website: string;
  /** Page with the dynamic tariffs. */
  tariffUrl: string;
  /** "http" (plain fetch, default) or "browser" (headless Chromium, for JS-rendered pages). */
  render?: "http" | "browser";
  products: { electricity: boolean; gas: boolean };
  features: {
    /** Supplier can automatically stop feed-in / curtail inverters at negative prices. null = not verified. */
    autoCurtailment: boolean | null;
    notes?: string;
  };
  /**
   * Read tariffs from the supplier's own price calculator (see src/calculators/).
   * Takes priority over page rules. Uses a public test address, never a private home.
   */
  calculator?: {
    adapter: string;
    testAddress: { postcode: string; houseNumber: number; houseNumberAddition?: string; city: string; label: string };
  };
  /** Scrape rules. One rule or a list tried in order. Leave a field out to rely on `manual` only. */
  fields: Partial<Record<FieldKey, FieldRule | FieldRule[]>>;
  /** Hand-checked values, used when scraping fails or no rule exists. One entry per field. */
  manual: Partial<Record<FieldKey, ManualValue>>;
}

export interface ManualValue {
  /** The number as shown on the source (see vatIncluded). */
  value: number;
  /** true when `value` includes 21% VAT; it is converted to excl. VAT in the output. */
  vatIncluded: boolean;
  /** Must be true: read on the supplier's own site on checkedAt. Unverified values are not allowed. */
  verified: true;
  checkedAt: string; // YYYY-MM-DD
  source: string;
  note?: string;
}

export interface FieldValue {
  /** Excluding VAT. */
  value: number | null;
  /** value * 1.21, for convenience. */
  valueInclVat: number | null;
  unit: string;
  /** scraped = read from the supplier's web page; calculator = from the supplier's price calculator; manual = from the supplier config. */
  source: "scraped" | "calculator" | "manual";
  /** false when the value was never confirmed on the supplier's own site. */
  verified: boolean;
  /** When this value first appeared (scraped) or was hand-checked (manual). Changes only when the value changes. */
  since: string | null;
  /** Last time the scraper confirmed this value on the site. Absent for manual values. */
  lastChecked?: string;
  sourceUrl: string | null;
  /** Set when the last scrape attempt for this field failed. */
  lastError?: string;
}

export interface SupplierData {
  id: string;
  name: string;
  website: string;
  tariffUrl: string;
  products: SupplierConfig["products"];
  features: SupplierConfig["features"];
  tariffs: Partial<Record<FieldKey, FieldValue>>;
  lastRun: string;
  fetchError?: string;
}

export interface SuppliersFile {
  $schema?: string;
  version: 1;
  generatedAt: string;
  currency: "EUR";
  vat: "excluded";
  suppliers: SupplierData[];
}

export interface PricePoint {
  /** Local time with offset, e.g. 2026-09-24T18:00:00+02:00 */
  start: string;
  /** Same moment in UTC, e.g. 2026-09-24T16:00:00Z */
  startUtc: string;
  price: number;
}

export interface DayPrices {
  $schema?: string;
  version: 1;
  date: string; // YYYY-MM-DD (Europe/Amsterdam)
  timezone: "Europe/Amsterdam";
  currency: "EUR";
  vat: "excluded";
  fetchedAt: string;
  electricity: null | {
    unit: "EUR/kWh";
    source: "entsoe" | "energyzero";
    /** Hourly prices (average of the quarter-hours when the market is 15-min). */
    hourly: PricePoint[];
    /** Quarter-hour prices, when the source provides them. */
    quarterHourly?: PricePoint[];
  };
  gas: null | {
    unit: "EUR/m3";
    source: "energyzero";
    hourly: PricePoint[];
  };
}
