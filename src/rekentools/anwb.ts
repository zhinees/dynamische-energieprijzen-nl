// ANWB Energie: read tariffs from the quote API behind its calculator (anwb.nl/energie/aanvragen).
//
// Flow (same as the website): address lookup -> start a quote -> poll its status ->
// fetch the price breakdown. The API wants the connection's EAN code; it comes from the
// lookup at run time and is never stored. ANWB keeps the calculation under a quote id,
// but no application (aanvraag) is made: that is a separate endpoint this adapter never calls.
// Amounts are incl. btw (the energy tax line shows it: € 0,1108/kWh in 2026).

import { USER_AGENT } from "../lib/pagina-ophalen.ts";
import type { Rekentoolresultaat, Testadres } from "./index.ts";

const BASIS = "https://api.anwb.nl/energy/energy-services";
const WACHT_MS = 2_000;
const MAX_POGINGEN = 15;

async function haalJson(pad: string, init?: RequestInit): Promise<any> {
  const res = await fetch(BASIS + pad, {
    ...init,
    headers: { accept: "application/json", "content-type": "application/json", "user-agent": USER_AGENT },
    signal: AbortSignal.timeout(30_000),
  });
  if (!res.ok) throw new Error(`ANWB HTTP ${res.status} voor ${pad.split("?")[0]}`);
  const tekst = await res.text();
  try {
    return JSON.parse(tekst);
  } catch {
    return tekst; // get-quote answers with the bare id
  }
}

export async function haalAnwb(adres: Testadres, wachtMs = WACHT_MS): Promise<Rekentoolresultaat> {
  const a = await haalJson(`/v0/postcode-lookup-edsn?postcode=${adres.postcode}&houseNumber=${adres.huisnummer}`);
  const toevoeging = adres.huisnummerToevoeging || "EMPTY";
  const aansluiting = a?.houseNumberSuffices?.find((s: any) => s.suffix === toevoeging);
  const stroom = aansluiting?.meterpoints?.find((m: any) => m.type === "electricity");
  const gas = aansluiting?.meterpoints?.find((m: any) => m.type === "gas");
  if (!stroom) throw new Error("geen stroomaansluiting gevonden voor het testadres");
  if (!stroom.isRetail || (gas && !gas.isRetail)) throw new Error("testadres is een grootverbruiksaansluiting");

  const id = await haalJson("/v1/get-quote", {
    method: "POST",
    body: JSON.stringify({
      type: gas ? "electricity_gas" : "electricity",
      electricity: { verbruik: 2500, teruglevering: 0, gridOperatorId: stroom.gridOperatorId, eanCode: stroom.eanCode },
      ...(gas ? { gas: { verbruik: 1000, gridOperatorId: gas.gridOperatorId, eanCode: gas.eanCode } } : {}),
      address: {
        postcode: a.postcode,
        houseNumber: a.houseNumber,
        houseNumberSuffix: toevoeging,
        streetName: a.streetName,
        city: a.city,
        isHomeOrWorkAddress: true,
      },
    }),
  });
  if (typeof id !== "string" || !id) throw new Error("geen offerte-id ontvangen");

  for (let i = 0; i < MAX_POGINGEN; i++) {
    await new Promise((r) => setTimeout(r, wachtMs));
    const s = await haalJson(`/v0/get-quote/status?id=${encodeURIComponent(id)}`);
    if (s?.status === "FINISHED") {
      const ids = Object.entries(s.quoteId ?? {}).map(([soort, qid]) => `${soort}_id=${encodeURIComponent(String(qid))}`);
      if (!ids.length) throw new Error("offerte klaar maar zonder id");
      return leesAnwb(await haalJson(`/v0/get-quote-by-id?${ids.join("&")}`));
    }
    if (s?.status !== "ACTIVE") throw new Error(`onverwachte offertestatus "${s?.status}"`);
  }
  throw new Error("offerte niet op tijd klaar");
}

/** Pick ANWB's own tariff lines (incl. btw). */
export function leesAnwb(data: any): Rekentoolresultaat {
  const b = data?.data?.electricityDetails?.breakdown;
  const g = data?.data?.gasDetails?.breakdown;
  if (!b) throw new Error("geen prijsopbouw voor stroom in het antwoord");
  // Guard the incl.-btw assumption. Energy tax 2026: stroom € 0,0916 excl. / € 0,1108 incl. per kWh,
  // gas € 0,6007 excl. / € 0,7268 incl. per m3.
  if (!(b.energyTaxPerKwh > 0.1)) throw new Error(`energiebelasting ${b.energyTaxPerKwh}/kWh: bedragen lijken niet incl. btw`);
  if (g && !(g.energyTaxPerM3 > 0.65)) throw new Error(`energiebelasting ${g.energyTaxPerM3}/m3: bedragen lijken niet incl. btw`);
  const uit: Rekentoolresultaat = {};
  // Only the fixed costs: inkoopkostenPerKwh varies per call (0.017993, 0.017995, ...), it is a
  // computed average, not the tariff. The tariff page states the markups (€ 0,018/kWh, € 0,0768/m3)
  // and rules read them.
  if (Number.isFinite(b.leveringsKosten)) uit.stroomVastPerMaand = { waarde: b.leveringsKosten, inclBtw: true };
  if (Number.isFinite(g?.leveringsKosten)) uit.gasVastPerMaand = { waarde: g.leveringsKosten, inclBtw: true };
  return uit;
}
