// Vandebron: read dynamic tariffs from the price-breakdown API behind its calculator.
//
// Flow (same as the website): address -> grid operator -> price breakdown for the
// dynamic proposition ("MarketPriceVariable"). Two requests, nothing is saved on
// Vandebron's side. The API returns every tariff both incl. and excl. btw.

import { USER_AGENT } from "../lib/pagina-ophalen.ts";
import { plusDagen, vandaagLokaal } from "../lib/tijd.ts";
import type { Rekentoolresultaat, Testadres } from "./index.ts";

const BASIS = "https://vandebron.nl/api";

// Standard capacity-tariff codes for a household connection (electricity <= 3x25A, gas G4/G6).
const CAP_TAR_STROOM = "10211";
const CAP_TAR_GAS = "20211";

async function haalJson(url: string, init?: RequestInit): Promise<any> {
  const res = await fetch(url, {
    ...init,
    headers: { "content-type": "application/json", "user-agent": USER_AGENT, ...(init?.headers ?? {}) },
    signal: AbortSignal.timeout(30_000),
  });
  if (!res.ok) throw new Error(`Vandebron HTTP ${res.status} voor ${url.replace(BASIS, "")}`);
  return res.json();
}

/** First day of the month after `vandaag + 30 days`, like the website's earliest start date. */
export function startdatumVoor(vandaag: string): string {
  const d = plusDagen(vandaag, 30);
  const [j, m] = d.split("-").map(Number);
  return new Date(Date.UTC(j, m, 1)).toISOString().slice(0, 10);
}

export async function haalVandebron(adres: Testadres): Promise<Rekentoolresultaat> {
  const a = await haalJson(`${BASIS}/validate/edsn/address?houseNr=${adres.huisnummer}&zipcode=${adres.postcode}`);
  if (!a?.electricityGridOperatorEan) throw new Error("geen netbeheerder gevonden voor het testadres");
  const vandaag = vandaagLokaal();
  const body = {
    agreementDate: vandaag,
    startDate: startdatumVoor(vandaag),
    isResidential: true,
    campaignCode: "everyone",
    electricity: {
      contractDuration: { durationType: "MarketPriceVariable" },
      gridOperatorEan: a.electricityGridOperatorEan,
      capTarCode: CAP_TAR_STROOM,
      usage: { yearlyConsumptionKWh: 2500, yearlyProductionKWh: 1000 },
    },
    gas: {
      contractDuration: { durationType: "MarketPriceVariable" },
      gridOperatorEan: a.gasGridOperatorEan ?? a.electricityGridOperatorEan,
      capTarCode: CAP_TAR_GAS,
      usage: { yearlyConsumptionM3: 1000 },
    },
  };
  const data = await haalJson(`${BASIS}/v2/pricing/priceBreakdown`, { method: "POST", body: JSON.stringify(body) });
  return leesVandebron(data);
}

/** "0,02208" -> 0.02208 */
const getal = (s: unknown) => (typeof s === "string" ? Number(s.replace(/\./g, "").replace(",", ".")) : NaN);

/** Pick Vandebron's own tariff lines (excl. btw, as returned by the API). */
export function leesVandebron(data: any): Rekentoolresultaat {
  const uit: Rekentoolresultaat = {};
  const regel = (sectie: any, soort: string) => sectie?.costBreakdown?.find((c: any) => c.type === soort)?.tariff;
  const tarief = (sectie: any, soort: string) => regel(sectie, soort)?.excludingVat;
  const tariefIncl = (sectie: any, soort: string) => getal(regel(sectie, soort)?.includingVat);
  const zet = (k: keyof Rekentoolresultaat, v: number, incl?: number) => {
    if (Number.isFinite(v)) uit[k] = { waarde: v, inclBtw: false, ...(Number.isFinite(incl) ? { waardeInclBtw: incl } : {}) };
  };
  // Use the period without salderen (from 2027): that is the lasting situation.
  const perioden: any[] = data?.electricity ?? [];
  const stroom = (perioden.find((p) => p.nettingAllowed === false) ?? perioden.at(-1))?.breakdown;

  const perMaand = (perDag: number) => Math.round(perDag * (365 / 12) * 1e6) / 1e6;
  zet("stroomInkoopopslag", getal(tarief(stroom?.delivery, "SurchargesDeliveryCost")), tariefIncl(stroom?.delivery, "SurchargesDeliveryCost"));
  // A positive surcharge on redelivery is a cost for you -> negative terugleverCorrectie.
  zet(
    "terugleverCorrectie",
    -getal(tarief(stroom?.redelivery, "SurchargesExcessRedeliveryCost")),
    -tariefIncl(stroom?.redelivery, "SurchargesExcessRedeliveryCost"),
  );
  // Fixed costs are per day; convert to per month (365 / 12 days).
  zet("stroomVastPerMaand", perMaand(getal(tarief(stroom?.fixedCosts, "FixedCost"))), perMaand(tariefIncl(stroom?.fixedCosts, "FixedCost")));
  zet("gasInkoopopslag", getal(tarief(data?.gas?.delivery, "SurchargesDeliveryCost")), tariefIncl(data?.gas?.delivery, "SurchargesDeliveryCost"));
  zet("gasVastPerMaand", perMaand(getal(tarief(data?.gas?.fixedCosts, "FixedCost"))), perMaand(tariefIncl(data?.gas?.fixedCosts, "FixedCost")));
  return uit;
}
