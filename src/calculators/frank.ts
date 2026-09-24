// Frank Energie: read tariffs from the signup calculator's GraphQL API.
//
// Flow (same as the website): address -> connection codes (EAN) -> price simulation.
// Three requests per run. Amounts come back INCLUDING 21% btw, even when
// isVatIncluded is false (verified 2026-09-24: LEVIES = 0.0916 energiebelasting x 1.21).

import { USER_AGENT } from "../lib/fetch-page.ts";
import type { CalculatorResult, TestAddress } from "./index.ts";

const ENDPOINT = "https://www.frankenergie.nl/graphql";

const METERING_POINTS = `query SignupMeteringPoints($input: SignupMeteringPointsInput!) {
  signupMeteringPoints(input: $input) { status meteringPoints { ean fullAddress } }
}`;

const SIMULATE = `query SignupSimulatePrice($input: SignupSimulatePriceInput!) {
  signupSimulatePrice(input: $input) {
    electricity { components { componentKey fixedAmountPerMonth variableAmountPerUnit variableUnit } }
    gas { components { componentKey fixedAmountPerMonth variableAmountPerUnit variableUnit } }
  }
}`;

async function gql(query: string, variables: unknown): Promise<any> {
  const res = await fetch(ENDPOINT, {
    method: "POST",
    headers: { "content-type": "application/json", "user-agent": USER_AGENT, "x-country": "NL" },
    body: JSON.stringify({ query, variables }),
    signal: AbortSignal.timeout(30_000),
  });
  if (!res.ok) throw new Error(`Frank GraphQL HTTP ${res.status}`);
  const json: any = await res.json();
  if (json.errors?.length) throw new Error(`Frank GraphQL: ${json.errors.map((e: any) => e.message).join("; ")}`);
  return json.data;
}

async function firstEan(addr: TestAddress, segment: "ELECTRICITY" | "GAS"): Promise<string> {
  const data = await gql(METERING_POINTS, {
    input: { postalCode: addr.postcode, houseNumber: addr.houseNumber, houseNumberAddition: addr.houseNumberAddition ?? "", segment },
  });
  const ean = data?.signupMeteringPoints?.meteringPoints?.[0]?.ean;
  if (!ean) throw new Error(`no ${segment} connection found for ${addr.postcode} ${addr.houseNumber}`);
  return ean;
}

export async function fetchFrank(addr: TestAddress): Promise<CalculatorResult> {
  const [electricityEAN, gasEAN] = await Promise.all([firstEan(addr, "ELECTRICITY"), firstEan(addr, "GAS")]);
  const data = await gql(SIMULATE, {
    input: {
      electricityEAN,
      gasEAN,
      electricityEstimate: 2400,
      feedInEstimate: 1000,
      gasEstimate: 1000,
      generationP1: 1000,
      isResidential: true,
      isResidentialMainResidence: true,
      isBusinessCustomer: false,
      hasCO2Compensation: false,
      hasSmartMeter: true,
      hasSmartService: true, // website default ("gratis slimme dienst")
      hasAgreedOnPvSystemSteering: false,
      zipCode: addr.postcode,
      houseNumber: addr.houseNumber,
      city: addr.city,
      affiliateId: null,
      consumptionP1: 0,
      consumptionP2: 0,
      consumptionP3: 0,
      contractedPower: 6,
      contractedPowerP1: 3,
      contractedPowerP2: 3,
      isVatIncluded: true,
      electricityPropositionType: "dynamic",
      gasPropositionType: "dynamic",
    },
  });
  return parseFrank(data);
}

/** Pick the supplier's own tariff lines; ignore market price, grid costs, taxes. */
export function parseFrank(data: any): CalculatorResult {
  const sim = data?.signupSimulatePrice;
  const find = (part: "electricity" | "gas", key: string) =>
    sim?.[part]?.components?.find((c: any) => c.componentKey === key);
  const out: CalculatorResult = {};
  const set = (k: keyof CalculatorResult, v: unknown) => {
    if (typeof v === "number" && Number.isFinite(v)) out[k] = { value: v, vatIncluded: true };
  };
  set("electricityFixedMonthly", find("electricity", "FIXED_COSTS")?.fixedAmountPerMonth);
  set("electricityMarkup", find("electricity", "PURCHASE_FEE")?.variableAmountPerUnit);
  set("feedInDelta", find("electricity", "PURCHASE_FEE_FEED_IN")?.variableAmountPerUnit);
  set("gasFixedMonthly", find("gas", "FIXED_COSTS")?.fixedAmountPerMonth);
  set("gasMarkup", find("gas", "PURCHASE_FEE")?.variableAmountPerUnit);
  return out;
}
