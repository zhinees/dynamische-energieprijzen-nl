// Vandebron: read dynamic tariffs from the price-breakdown API behind its calculator.
//
// Flow (same as the website): address -> grid operator -> price breakdown for the
// dynamic proposition ("MarketPriceVariable"). Two requests, nothing is saved on
// Vandebron's side. The API returns every tariff both incl. and excl. btw.

import { USER_AGENT } from "../lib/fetch-page.ts";
import { addDays, todayLocal } from "../lib/time.ts";
import type { CalculatorResult, TestAddress } from "./index.ts";

const BASE = "https://vandebron.nl/api";

// Standard capacity-tariff codes for a household connection (electricity <= 3x25A, gas G4/G6).
const CAP_TAR_ELECTRICITY = "10211";
const CAP_TAR_GAS = "20211";

async function getJson(url: string, init?: RequestInit): Promise<any> {
  const res = await fetch(url, {
    ...init,
    headers: { "content-type": "application/json", "user-agent": USER_AGENT, ...(init?.headers ?? {}) },
    signal: AbortSignal.timeout(30_000),
  });
  if (!res.ok) throw new Error(`Vandebron HTTP ${res.status} for ${url.replace(BASE, "")}`);
  return res.json();
}

/** First day of the month after `date + 30 days`, like the website's earliest start date. */
export function startDateFor(today: string): string {
  const d = addDays(today, 30);
  const [y, m] = d.split("-").map(Number);
  return new Date(Date.UTC(y, m, 1)).toISOString().slice(0, 10);
}

export async function fetchVandebron(addr: TestAddress): Promise<CalculatorResult> {
  const a = await getJson(`${BASE}/validate/edsn/address?houseNr=${addr.houseNumber}&zipcode=${addr.postcode}`);
  if (!a?.electricityGridOperatorEan) throw new Error("no grid operator found for the test address");
  const today = todayLocal();
  const body = {
    agreementDate: today,
    startDate: startDateFor(today),
    isResidential: true,
    campaignCode: "everyone",
    electricity: {
      contractDuration: { durationType: "MarketPriceVariable" },
      gridOperatorEan: a.electricityGridOperatorEan,
      capTarCode: CAP_TAR_ELECTRICITY,
      usage: { yearlyConsumptionKWh: 2500, yearlyProductionKWh: 1000 },
    },
    gas: {
      contractDuration: { durationType: "MarketPriceVariable" },
      gridOperatorEan: a.gasGridOperatorEan ?? a.electricityGridOperatorEan,
      capTarCode: CAP_TAR_GAS,
      usage: { yearlyConsumptionM3: 1000 },
    },
  };
  const data = await getJson(`${BASE}/v2/pricing/priceBreakdown`, { method: "POST", body: JSON.stringify(body) });
  return parseVandebron(data);
}

/** "0,02208" -> 0.02208 */
const num = (s: unknown) => (typeof s === "string" ? Number(s.replace(/\./g, "").replace(",", ".")) : NaN);

/** Pick Vandebron's own tariff lines (excl. btw, as returned by the API). */
export function parseVandebron(data: any): CalculatorResult {
  const out: CalculatorResult = {};
  const line = (section: any, type: string) => section?.costBreakdown?.find((c: any) => c.type === type)?.tariff;
  const tariff = (section: any, type: string) => line(section, type)?.excludingVat;
  const tariffIncl = (section: any, type: string) => num(line(section, type)?.includingVat);
  const set = (k: keyof CalculatorResult, v: number, incl?: number) => {
    if (Number.isFinite(v)) out[k] = { value: v, vatIncluded: false, ...(Number.isFinite(incl) ? { valueInclVat: incl } : {}) };
  };
  // Use the period without salderen (from 2027): that is the lasting situation.
  const periods: any[] = data?.electricity ?? [];
  const el = (periods.find((p) => p.nettingAllowed === false) ?? periods.at(-1))?.breakdown;

  const perMonth = (perDay: number) => Math.round(perDay * (365 / 12) * 1e6) / 1e6;
  set("electricityMarkup", num(tariff(el?.delivery, "SurchargesDeliveryCost")), tariffIncl(el?.delivery, "SurchargesDeliveryCost"));
  // A positive surcharge on redelivery is a cost for you -> negative feed-in delta.
  set(
    "feedInDelta",
    -num(tariff(el?.redelivery, "SurchargesExcessRedeliveryCost")),
    -tariffIncl(el?.redelivery, "SurchargesExcessRedeliveryCost"),
  );
  // Fixed costs are per day; convert to per month (365 / 12 days).
  set("electricityFixedMonthly", perMonth(num(tariff(el?.fixedCosts, "FixedCost"))), perMonth(tariffIncl(el?.fixedCosts, "FixedCost")));
  set("gasMarkup", num(tariff(data?.gas?.delivery, "SurchargesDeliveryCost")), tariffIncl(data?.gas?.delivery, "SurchargesDeliveryCost"));
  set("gasFixedMonthly", perMonth(num(tariff(data?.gas?.fixedCosts, "FixedCost"))), perMonth(tariffIncl(data?.gas?.fixedCosts, "FixedCost")));
  return out;
}
