// Shared types. All money is EUR, excluding VAT (btw) and energy tax (energiebelasting).

export type Veld =
  | "stroomVastPerMaand"   // vaste leveringskosten stroom, EUR/maand
  | "stroomInkoopopslag"   // inkoopopslag stroom, EUR/kWh
  | "gasVastPerMaand"      // vaste leveringskosten gas, EUR/maand
  | "gasInkoopopslag"      // inkoopopslag gas, EUR/m3
  | "terugleverCorrectie"; // teruglevering: EUR/kWh added to the hourly price (negative = cost, positive = bonus)

export const VELDEN: Veld[] = [
  "stroomVastPerMaand",
  "stroomInkoopopslag",
  "gasVastPerMaand",
  "gasInkoopopslag",
  "terugleverCorrectie",
];

export const EENHEDEN: Record<Veld, string> = {
  stroomVastPerMaand: "EUR/maand",
  stroomInkoopopslag: "EUR/kWh",
  gasVastPerMaand: "EUR/maand",
  gasInkoopopslag: "EUR/m3",
  terugleverCorrectie: "EUR/kWh",
};

/** How to find one number on a supplier page. */
export interface Regel {
  /** Case-insensitive regexes for the text right before the number. Tried in order. */
  labels: string[];
  /** Values outside [min, max] are rejected (after `negatief`). */
  bereik: [number, number];
  /** Characters after the label to search for the amount. Default 160. */
  venster?: number;
  /** Regex for the heading/text where the search starts. Defaults: stroom/elektriciteit or gas heading. */
  sectie?: string;
  /** Page states a cost (e.g. terugleverkosten 0,02) that must be stored negative. */
  negatief?: boolean;
  /** Override the supplier's tariefUrl for this field. */
  url?: string;
  /** The amount appears BEFORE the label ("€ 5,99 vaste kosten"). Nearest amount wins. */
  ervoor?: boolean;
  /** The page states this amount including 21% VAT; it is converted to excl. VAT. */
  inclBtw?: boolean;
}

/** One file per supplier in /leveranciers. This is what contributors edit. */
export interface LeverancierConfig {
  $schema?: string;
  $comment?: string;
  id: string;
  naam: string;
  website: string;
  /** Page with the dynamic tariffs. */
  tariefUrl: string;
  /** "http" (plain fetch, default) or "browser" (headless Chromium, for JS-rendered pages). */
  ophalen?: "http" | "browser";
  producten: { stroom: boolean; gas: boolean };
  kenmerken: {
    /** Supplier can automatically stop feed-in / curtail inverters at negative prices. null = not verified. */
    automatischAfschakelen: boolean | null;
    notities?: string;
  };
  /**
   * Read tariffs from the supplier's own price calculator (see src/rekentools/).
   * Takes priority over page rules. Uses a public test address, never a private home.
   */
  rekentool?: {
    adapter: string;
    testadres: Testadres;
  };
  /** Scrape rules. One rule or a list tried in order. Leave a field out to rely on `handmatig` only. */
  regels: Partial<Record<Veld, Regel | Regel[]>>;
  /** Hand-checked values, used when scraping fails or no rule exists. One entry per field. */
  handmatig: Partial<Record<Veld, HandmatigeWaarde>>;
}

export interface Testadres {
  postcode: string; // "2584RZ"
  huisnummer: number;
  huisnummerToevoeging?: string;
  plaats: string;
  /** What this address is, e.g. "Madurodam, Den Haag". */
  omschrijving: string;
}

export interface HandmatigeWaarde {
  /** The number as shown on the source (see inclBtw). */
  waarde: number;
  /** true when `waarde` includes 21% VAT; it is converted to excl. VAT in the output. */
  inclBtw: boolean;
  /**
   * Optional: the other side as published by the supplier (incl. btw when `waarde` is excl.).
   * Use it when the source states both, so no rounded conversion is published.
   * null = the supplier doesn't say whether btw applies (the incl. value is left empty).
   */
  waardeInclBtw?: number | null;
  /** Must be true: read on the supplier's own site on gecontroleerdOp. Unverified values are not allowed. */
  geverifieerd: true;
  gecontroleerdOp: string; // YYYY-MM-DD
  bron: string;
  notitie?: string;
}

export type Bron = "website" | "rekentool" | "handmatig";

export interface Tariefwaarde {
  /** Excluding VAT. */
  waarde: number | null;
  /** Incl. 21% btw: the supplier's own number when published, else waarde * 1.21. null = not known. */
  waardeInclBtw: number | null;
  eenheid: string;
  /** website = read from the supplier's web page; rekentool = from the supplier's price calculator; handmatig = from the supplier config. */
  bron: Bron;
  /** false when the value was never confirmed on the supplier's own site. */
  geverifieerd: boolean;
  /** When this value first appeared (scraped) or was hand-checked (handmatig). Changes only when the value changes. */
  sinds: string | null;
  /** Last time the scraper confirmed this value on the site. Absent for handmatig values. */
  laatstGecontroleerd?: string;
  bronUrl: string | null;
  /** Set when the last scrape attempt for this field failed. */
  laatsteFout?: string;
}

export interface Leverancier {
  id: string;
  naam: string;
  website: string;
  tariefUrl: string;
  producten: LeverancierConfig["producten"];
  kenmerken: LeverancierConfig["kenmerken"];
  tarieven: Partial<Record<Veld, Tariefwaarde>>;
  laatstUitgevoerd: string;
  ophaalfout?: string;
}

export interface LeveranciersBestand {
  $schema?: string;
  versie: 1;
  gegenereerdOp: string;
  valuta: "EUR";
  btw: "exclusief";
  leveranciers: Leverancier[];
}

export interface Prijspunt {
  /** Local time with offset, e.g. 2026-09-24T18:00:00+02:00 */
  start: string;
  /** Same moment in UTC, e.g. 2026-09-24T16:00:00Z */
  startUtc: string;
  prijs: number;
}

export interface Dagprijzen {
  $schema?: string;
  versie: 1;
  datum: string; // YYYY-MM-DD (Europe/Amsterdam)
  tijdzone: "Europe/Amsterdam";
  valuta: "EUR";
  btw: "exclusief";
  opgehaaldOp: string;
  stroom: null | {
    eenheid: "EUR/kWh";
    bron: "entsoe" | "energyzero";
    /** Hourly prices (average of the quarter-hours when the market is 15-min). */
    perUur: Prijspunt[];
    /** Quarter-hour prices, when the source provides them. */
    perKwartier?: Prijspunt[];
  };
  gas: null | {
    eenheid: "EUR/m3";
    bron: "energyzero";
    perUur: Prijspunt[];
  };
}
