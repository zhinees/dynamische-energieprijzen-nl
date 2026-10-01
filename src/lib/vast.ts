// Average fixed (and variable) contract for households: what the average household pays for electricity per kWh and
// per year with a fixed or variable contract, per month, from CBS StatLine table 85592NED ("Gemiddelde energietarieven
// voor consumenten"). Used as a default for whoever does not know their own fixed tariff.

export const CBS_TABEL = "85592NED";
export const CBS_URL = `https://opendata.cbs.nl/ODataApi/odata/${CBS_TABEL}/TypedDataSet?$select=Btw,Perioden,VastLeveringstariefVasteEnVar_8,VariabelLeveringstariefContractprijs_9,Energiebelasting_14&$filter=Btw%20eq%20'A048944'`;
const INCL_BTW = "A048944";

export type CbsRij = {
  Btw: string;
  Perioden: string;
  VastLeveringstariefVasteEnVar_8: number | null;
  VariabelLeveringstariefContractprijs_9: number | null;
  Energiebelasting_14: number | null;
};

export type VastMaand = {
  /** YYYY-MM */
  maand: string;
  /** Supply price per kWh, incl. VAT, excl. energy tax. */
  leveringPerKwh: number;
  /** Energy tax per kWh, incl. VAT, in that month. */
  energiebelastingPerKwh: number;
  /** Supply plus energy tax per kWh, incl. VAT: what a consumer sees as 'price per kWh'. */
  totaalPerKwh: number;
  /** Fixed supply costs per year and per month, incl. VAT. */
  vastPerJaar: number;
  vastPerMaand: number;
};

export type VastBestand = {
  gegenereerdOp: string;
  valuta: "EUR";
  inclBtw: true;
  omschrijving: string;
  bron: { naam: string; tabel: string; url: string; licentie: string };
  /** The latest month CBS published. */
  laatste: VastMaand;
  /** The last (up to) twelve months, oldest first. */
  maanden: VastMaand[];
};

const r4 = (v: number) => Math.round(v * 10000) / 10000;
const r2 = (v: number) => Math.round(v * 100) / 100;

/** Monthly rows (YYYYMMnn, not the year totals YYYYJJ00) incl. VAT with all three values, oldest first. */
export function leesCbs(rijen: CbsRij[]): VastMaand[] {
  const uit: VastMaand[] = [];
  for (const r of rijen) {
    const m = /^(\d{4})MM(\d{2})$/.exec(r.Perioden.trim());
    if (!m || r.Btw.trim() !== INCL_BTW) continue;
    const lev = r.VariabelLeveringstariefContractprijs_9, eb = r.Energiebelasting_14, vast = r.VastLeveringstariefVasteEnVar_8;
    if (lev == null || eb == null || vast == null) continue;
    uit.push({
      maand: `${m[1]}-${m[2]}`, leveringPerKwh: r4(lev), energiebelastingPerKwh: r4(eb), totaalPerKwh: r4(lev + eb),
      vastPerJaar: r2(vast), vastPerMaand: r2(vast / 12),
    });
  }
  return uit.sort((a, b) => a.maand.localeCompare(b.maand));
}

export function bouwVast(maanden: VastMaand[], nu: string): VastBestand {
  if (!maanden.length) throw new Error("vast: geen maanden van het CBS");
  for (const m of maanden) {
    if (!(m.leveringPerKwh > 0 && m.leveringPerKwh < 2)) throw new Error(`vast ${m.maand}: leveringstarief ${m.leveringPerKwh} €/kWh is onmogelijk`);
    if (!(m.vastPerJaar >= 0 && m.vastPerJaar < 1000)) throw new Error(`vast ${m.maand}: vaste leveringskosten ${m.vastPerJaar} €/jaar is onmogelijk`);
  }
  const reeks = maanden.slice(-12);
  return {
    gegenereerdOp: nu,
    valuta: "EUR",
    inclBtw: true,
    omschrijving: "Gemiddeld vast of variabel stroomcontract voor huishoudens (CBS), per kWh en per jaar, incl. btw. Het leveringstarief is zonder energiebelasting; totaalPerKwh telt de energiebelasting van die maand erbij.",
    bron: {
      naam: "CBS StatLine, Gemiddelde energietarieven voor consumenten",
      tabel: CBS_TABEL,
      url: `https://opendata.cbs.nl/#/CBS/nl/dataset/${CBS_TABEL}/table`,
      licentie: "CC BY 4.0",
    },
    laatste: reeks[reeks.length - 1],
    maanden: reeks,
  };
}
