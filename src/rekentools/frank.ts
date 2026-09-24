// Frank Energie: read tariffs from the signup calculator's GraphQL API.
//
// Flow (same as the website): address -> connection codes (EAN) -> price simulation.
// Three requests per run. Amounts come back INCLUDING 21% btw, even when
// isVatIncluded is false (verified 2026-09-24: LEVIES = 0.0916 energiebelasting x 1.21).

import { USER_AGENT } from "../lib/pagina-ophalen.ts";
import type { Rekentoolresultaat, Testadres } from "./index.ts";

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

async function eersteEan(adres: Testadres, segment: "ELECTRICITY" | "GAS"): Promise<string> {
  const data = await gql(METERING_POINTS, {
    input: { postalCode: adres.postcode, houseNumber: adres.huisnummer, houseNumberAddition: adres.huisnummerToevoeging ?? "", segment },
  });
  const ean = data?.signupMeteringPoints?.meteringPoints?.[0]?.ean;
  if (!ean) throw new Error(`geen ${segment === "GAS" ? "gas" : "stroom"}aansluiting gevonden voor ${adres.postcode} ${adres.huisnummer}`);
  return ean;
}

export async function haalFrank(adres: Testadres): Promise<Rekentoolresultaat> {
  const [stroomEan, gasEan] = await Promise.all([eersteEan(adres, "ELECTRICITY"), eersteEan(adres, "GAS")]);
  const data = await gql(SIMULATE, {
    input: {
      electricityEAN: stroomEan,
      gasEAN: gasEan,
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
      zipCode: adres.postcode,
      houseNumber: adres.huisnummer,
      city: adres.plaats,
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
  return leesFrank(data);
}

/** Pick the supplier's own tariff lines; ignore market price, grid costs, taxes. */
export function leesFrank(data: any): Rekentoolresultaat {
  const sim = data?.signupSimulatePrice;
  const zoek = (deel: "electricity" | "gas", sleutel: string) =>
    sim?.[deel]?.components?.find((c: any) => c.componentKey === sleutel);
  const uit: Rekentoolresultaat = {};
  const zet = (k: keyof Rekentoolresultaat, v: unknown) => {
    if (typeof v === "number" && Number.isFinite(v)) uit[k] = { waarde: v, inclBtw: true };
  };
  zet("stroomVastPerMaand", zoek("electricity", "FIXED_COSTS")?.fixedAmountPerMonth);
  zet("stroomInkoopopslag", zoek("electricity", "PURCHASE_FEE")?.variableAmountPerUnit);
  zet("terugleverCorrectie", zoek("electricity", "PURCHASE_FEE_FEED_IN")?.variableAmountPerUnit);
  zet("gasVastPerMaand", zoek("gas", "FIXED_COSTS")?.fixedAmountPerMonth);
  zet("gasInkoopopslag", zoek("gas", "PURCHASE_FEE")?.variableAmountPerUnit);
  return uit;
}
