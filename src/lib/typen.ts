// Shared types. All money is EUR. Published amounts come in pairs: ...InclBtw (what a
// consumer pays, the main value) and ...ExclBtw.

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
  /** What a consumer pays, incl. 21% btw: the supplier's own number when published, else bedragExclBtw * 1.21. null = not known. */
  bedragInclBtw: number | null;
  bedragExclBtw: number | null;
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
  leveranciers: Leverancier[];
}

/** Energy tax (energiebelasting) for households, first bracket. Belastingdienst states it excl. btw. */
export interface Belastingbedrag {
  bedragInclBtw: number;
  bedragExclBtw: number;
}

export interface BelastingJaar {
  /** 0 t/m 10.000 kWh */
  stroomPerKwh: Belastingbedrag;
  /** 0 t/m 170.000 m3 */
  gasPerM3: Belastingbedrag;
  /** Belastingvermindering per elektriciteitsaansluiting (verblijfsfunctie), per year. */
  verminderingPerAansluitingPerJaar: Belastingbedrag;
  bron: "website" | "handmatig";
  bronUrl: string;
  geverifieerd: true;
  sinds: string;
  laatstGecontroleerd?: string;
}

export interface EnergiebelastingBestand {
  $schema?: string;
  versie: 1;
  gegenereerdOp: string;
  valuta: "EUR";
  jaren: Record<string, BelastingJaar>;
  ophaalfout?: string;
}

/** belastingen/energiebelasting.json: where to read the rates, plus hand-checked fallback values. */
export interface EnergiebelastingConfig {
  $schema?: string;
  $comment?: string;
  tariefUrl: string;
  /** Per year, amounts as the Belastingdienst states them: excl. btw. */
  handmatig: Record<
    string,
    {
      stroomPerKwh: number;
      gasPerM3: number;
      verminderingPerAansluitingPerJaar: number;
      geverifieerd: true;
      gecontroleerdOp: string;
      bron: string;
      notitie?: string;
    }
  >;
}
