// Vattenfall (FlexPrijs): read dynamic tariffs from the offer API behind its calculator.
//
// Flow (same as the website):
//   1. load the calculator page and its script, and read the public API keys the website
//      sends with every request (they are not stored here and change with each release);
//   2. list the propositions of the dynamic campaign and pick FlexPrijsStroom + FlexPrijsGas;
//   3. price that proposition for the test address.
// Nothing is saved on Vattenfall's side. The offer lists every line both excl. and incl. btw.

import { USER_AGENT } from "../lib/pagina-ophalen.ts";
import type { Rekentoolresultaat, Testadres } from "./index.ts";

const PAGINA = "https://www.vattenfall.nl/energie-aanbiedingen/dynamisch-energiecontract/bestellen/";
const BASIS = "https://api.vattenfall.nl";
const CAMPAGNE = "VattenfallNL Dynamisch";
// Each API's key sits right after its endpoint in the calculator's script.
const PROPOSITIES_API = "vattenfallnlsalesflowproductselectorprd";
const OFFERTE_API = "aompublicapi/salesandcontracting/v1";

async function haal(url: string, init?: RequestInit): Promise<Response> {
  const res = await fetch(url, {
    ...init,
    headers: { "user-agent": USER_AGENT, ...(init?.headers ?? {}) },
    signal: AbortSignal.timeout(30_000),
  });
  if (!res.ok) throw new Error(`Vattenfall HTTP ${res.status} voor ${url.split("?")[0].replace(BASIS, "")}`);
  return res;
}

/** The key that follows `api` in the script, e.g. …aompublicapi/…/v1`,headers:{…"Ocp-Apim-Subscription-Key":`abc…`. */
export function sleutelNa(script: string, api: string): string {
  const p = script.indexOf(api);
  const m = p < 0 ? null : script.slice(p, p + 400).match(/Ocp-Apim-Subscription-Key"?\s*:\s*[`"']([0-9a-f]{32})[`"']/);
  if (!m) throw new Error(`geen API-sleutel voor ${api} in het script van de rekentool`);
  return m[1];
}

async function haalSleutels(): Promise<{ proposities: string; offerte: string }> {
  const html = await (await haal(PAGINA)).text();
  const naam = html.match(/main-[A-Za-z0-9]+\.js/)?.[0];
  if (!naam) throw new Error("script van de rekentool niet gevonden");
  const script = await (await haal(new URL(naam, PAGINA).href)).text();
  return { proposities: sleutelNa(script, PROPOSITIES_API), offerte: sleutelNa(script, OFFERTE_API) };
}

async function haalJson(pad: string, sleutel: string, init?: RequestInit): Promise<any> {
  const res = await haal(BASIS + pad, {
    ...init,
    headers: { accept: "application/json", "content-type": "application/json", "ocp-apim-subscription-key": sleutel },
  });
  return res.json();
}

/** The dynamic electricity + dynamic gas proposition (FPS + FPG). */
export function kiesPropositie(summary: any): string {
  const p = (summary?.propositions ?? []).find(
    (p: any) => p.productE?.verzamelID?.startsWith("FPS") && p.productG?.verzamelID?.startsWith("FPG"),
  );
  if (!p?.propositionId) throw new Error("geen propositie FlexPrijsStroom + FlexPrijsGas gevonden");
  return p.propositionId;
}

export async function haalVattenfall(adres: Testadres): Promise<Rekentoolresultaat> {
  const sleutels = await haalSleutels();
  const summary = await haalJson(
    `/${PROPOSITIES_API}/api/v1/ProductsSelector/summary?CampaignName=${encodeURIComponent(CAMPAGNE)}&IncludeHeat=false`,
    sleutels.proposities,
  );
  const offerte = await haalJson(`/api/${OFFERTE_API}/offer`, sleutels.offerte, {
    method: "POST",
    body: JSON.stringify({
      propositionId: kiesPropositie(summary),
      campaignName: CAMPAGNE,
      postalCode: adres.postcode,
      houseNumber: adres.huisnummer,
      houseNumberAddition: adres.huisnummerToevoeging ?? "",
      isResidential: true,
      addOnCode: "None",
      preferredStartDate: null,
      channel: "online",
      electricity: { consumption: { blocks: [{ number: 1, volume: 2500 }] }, gridCapacity: "3x25", profile: "T1" },
      gas: { gridCapacity: "G6", consumption: 1000, profile: "G1A" },
    }),
  });
  return leesVattenfall(offerte);
}

/** "0,012390" / "-1,424110" / "1.234,5" -> number */
const bedrag = (s: string) => Number(s.replace(/\./g, "").replace(",", "."));

/** Last line of the group's last period, e.g. "2.027 kWh x € 0,012390" or "per - dag: … / maand: € 4,95 / …". */
function regel(pricing: any, product: string, groep: string): string | undefined {
  const p = pricing?.items?.find((i: any) => i.itemType === product);
  const g = p?.items?.flatMap((h: any) => h.items ?? []).find((i: any) => i.itemType === groep);
  return g?.descriptionListItems?.at(-1)?.descriptionDetails?.[0]?.lines?.at(-1)?.text;
}

function perEenheid(pricing: any, product: string): number {
  const m = regel(pricing, product, "CostGroupSourcingFee")?.match(/x € (-?[\d.,]+)$/);
  return m ? bedrag(m[1]) : NaN;
}

function perMaand(pricing: any, product: string): number {
  const m = regel(pricing, product, "CostGroupFixedDeliveryCost")?.match(/maand: € (-?[\d.,]+)/);
  return m ? bedrag(m[1]) : NaN;
}

/** Pick Vattenfall's own tariff lines (excl. btw, with the incl. amount alongside). */
export function leesVattenfall(data: any): Rekentoolresultaat {
  const ex = data?.excludingVat?.pricing;
  const incl = data?.includingVat?.pricing;
  if (!ex || !incl) throw new Error("geen prijsopbouw in het aanbod");
  const uit: Rekentoolresultaat = {};
  const zet = (k: keyof Rekentoolresultaat, v: number, i: number) => {
    if (Number.isFinite(v)) uit[k] = { waarde: v, inclBtw: false, ...(Number.isFinite(i) ? { waardeInclBtw: i } : {}) };
  };
  zet("stroomInkoopopslag", perEenheid(ex, "ElectricityProduct"), perEenheid(incl, "ElectricityProduct"));
  zet("stroomVastPerMaand", perMaand(ex, "ElectricityProduct"), perMaand(incl, "ElectricityProduct"));
  zet("gasInkoopopslag", perEenheid(ex, "GasProduct"), perEenheid(incl, "GasProduct"));
  zet("gasVastPerMaand", perMaand(ex, "GasProduct"), perMaand(incl, "GasProduct"));
  // Feed-in: the offer only shows the expected market price ("Terugleververgoeding"), no charge.
  // The tariff page's "verkoopvergoeding" rule and the handmatig value cover terugleverCorrectie.
  return uit;
}
