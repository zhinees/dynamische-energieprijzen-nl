// Budget Thuis (Budget Energie): read dynamic tariffs from the offer API behind its calculator.
//
// One POST with the test address and a usage profile; the response lists every
// proposition (fixed, variable, dynamic) with its tariffs excl. and incl. btw.
// Nothing is saved on Budget Thuis's side.

import { USER_AGENT } from "../lib/fetch-page.ts";
import type { CalculatorResult, TestAddress } from "./index.ts";

const ENDPOINT = "https://api.budgetthuis.nl/energy/v1/online-offers";
// Public reseller id of the budgetthuis.nl website (from its own page data).
// If Budget Thuis changes it, the run fails loudly and the scraper report shows it.
export const RESELLER_ID = "b393573d-1396-4b94-e177-08dc12b65bff";

export async function fetchBudget(addr: TestAddress): Promise<CalculatorResult> {
  const res = await fetch(ENDPOINT, {
    method: "POST",
    headers: { "content-type": "application/json", "user-agent": USER_AGENT },
    body: JSON.stringify({
      resellerId: RESELLER_ID,
      hasSmartMeter: true,
      address: { postalCode: addr.postcode, houseNumber: addr.houseNumber, extension: addr.houseNumberAddition ?? "" },
      usage: { eacPeak: 1500, eacOffPeak: 1000, eapPeak: 500, eapOffPeak: 500, gas: 1000 },
    }),
    signal: AbortSignal.timeout(30_000),
  });
  if (!res.ok) throw new Error(`Budget Thuis HTTP ${res.status}`);
  return parseBudget(await res.json());
}

/** Pick the dynamic proposition's own tariff lines (excl. btw). */
export function parseBudget(data: any): CalculatorResult {
  const offers: any[] = (data?.salesChannels ?? []).flatMap((c: any) => c.offers ?? []);
  const dyn = offers.find((o) => o?.proposition?.propositionTariffDurationType === "Dynamic");
  if (!dyn) throw new Error("no dynamic proposition in the offer");
  const quote = (type: string) => dyn.quotes?.find((q: any) => q.productType === type);
  const el = quote("Electricity");
  const gas = quote("Gas");
  const out: CalculatorResult = {};
  const set = (k: keyof CalculatorResult, v: unknown, incl?: unknown) => {
    if (typeof v === "number" && Number.isFinite(v))
      out[k] = { value: v, vatIncluded: false, ...(typeof incl === "number" ? { valueInclVat: incl } : {}) };
  };
  set("electricityMarkup", el?.tradingCostsSurcharge?.price?.amountNet, el?.tradingCostsSurcharge?.price?.amountGross);
  set("electricityFixedMonthly", el?.standingChargesSupplyByMonth?.amountNet, el?.standingChargesSupplyByMonth?.amountGross);
  set("gasMarkup", gas?.tradingCostsSurcharge?.price?.amountNet, gas?.tradingCostsSurcharge?.price?.amountGross);
  set("gasFixedMonthly", gas?.standingChargesSupplyByMonth?.amountNet, gas?.standingChargesSupplyByMonth?.amountGross);
  // Feed-in: a production charge would be a cost per kWh. The API reports none (null) for the dynamic contract.
  if (el && "productionCharge" in el) {
    const charge =
      el.productionCharge?.price?.amountNet ?? el.supplyPrices?.post2027ProductionChargeSingle?.amountNet ?? 0;
    set("feedInDelta", -Math.abs(charge) + 0);
  }
  return out;
}
