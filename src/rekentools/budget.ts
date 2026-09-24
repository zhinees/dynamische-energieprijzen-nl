// Budget Thuis (Budget Energie): read dynamic tariffs from the offer API behind its calculator.
//
// One POST with the test address and a usage profile; the response lists every
// proposition (fixed, variable, dynamic) with its tariffs excl. and incl. btw.
// Nothing is saved on Budget Thuis's side.

import { USER_AGENT } from "../lib/pagina-ophalen.ts";
import type { Rekentoolresultaat, Testadres } from "./index.ts";

const ENDPOINT = "https://api.budgetthuis.nl/energy/v1/online-offers";
// Public reseller id of the budgetthuis.nl website (from its own page data).
// If Budget Thuis changes it, the run fails loudly and the scraper report shows it.
export const RESELLER_ID = "b393573d-1396-4b94-e177-08dc12b65bff";

export async function haalBudget(adres: Testadres): Promise<Rekentoolresultaat> {
  const res = await fetch(ENDPOINT, {
    method: "POST",
    headers: { "content-type": "application/json", "user-agent": USER_AGENT },
    body: JSON.stringify({
      resellerId: RESELLER_ID,
      hasSmartMeter: true,
      address: { postalCode: adres.postcode, houseNumber: adres.huisnummer, extension: adres.huisnummerToevoeging ?? "" },
      usage: { eacPeak: 1500, eacOffPeak: 1000, eapPeak: 500, eapOffPeak: 500, gas: 1000 },
    }),
    signal: AbortSignal.timeout(30_000),
  });
  if (!res.ok) throw new Error(`Budget Thuis HTTP ${res.status}`);
  return leesBudget(await res.json());
}

/** Pick the dynamic proposition's own tariff lines (excl. btw). */
export function leesBudget(data: any): Rekentoolresultaat {
  const aanbiedingen: any[] = (data?.salesChannels ?? []).flatMap((c: any) => c.offers ?? []);
  const dyn = aanbiedingen.find((o) => o?.proposition?.propositionTariffDurationType === "Dynamic");
  if (!dyn) throw new Error("geen dynamische propositie in het aanbod");
  const offerte = (soort: string) => dyn.quotes?.find((q: any) => q.productType === soort);
  const stroom = offerte("Electricity");
  const gas = offerte("Gas");
  const uit: Rekentoolresultaat = {};
  const zet = (k: keyof Rekentoolresultaat, v: unknown, incl?: unknown) => {
    if (typeof v === "number" && Number.isFinite(v))
      uit[k] = { waarde: v, inclBtw: false, ...(typeof incl === "number" ? { waardeInclBtw: incl } : {}) };
  };
  zet("stroomInkoopopslag", stroom?.tradingCostsSurcharge?.price?.amountNet, stroom?.tradingCostsSurcharge?.price?.amountGross);
  zet("stroomVastPerMaand", stroom?.standingChargesSupplyByMonth?.amountNet, stroom?.standingChargesSupplyByMonth?.amountGross);
  zet("gasInkoopopslag", gas?.tradingCostsSurcharge?.price?.amountNet, gas?.tradingCostsSurcharge?.price?.amountGross);
  zet("gasVastPerMaand", gas?.standingChargesSupplyByMonth?.amountNet, gas?.standingChargesSupplyByMonth?.amountGross);
  // Feed-in: a production charge would be a cost per kWh. The API reports none (null) for the dynamic contract.
  if (stroom && "productionCharge" in stroom) {
    const kosten =
      stroom.productionCharge?.price?.amountNet ?? stroom.supplyPrices?.post2027ProductionChargeSingle?.amountNet ?? 0;
    zet("terugleverCorrectie", -Math.abs(kosten) + 0);
  }
  return uit;
}
