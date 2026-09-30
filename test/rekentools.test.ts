import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { test } from "node:test";
import { haalAnwb, leesAnwb } from "../src/rekentools/anwb.ts";
import { haalFrank, leesFrank } from "../src/rekentools/frank.ts";
import { haalVattenfall, kiesPropositie, leesVattenfall, sleutelNa } from "../src/rekentools/vattenfall.ts";
import { laadLeverancierConfigs } from "../src/lib/bestanden.ts";
import { bouwLeverancier } from "../src/lib/tarieven.ts";

// Real response captured from Frank's calculator on 2026-09-24 (Madurodam test address).
const fixture = JSON.parse(await readFile(new URL("fixtures/frank-simulate-2026-09-24.json", import.meta.url), "utf8"));
const frank = (await laadLeverancierConfigs()).find((c) => c.id === "frank")!;

test("leesFrank pakt alleen Franks eigen tariefregels", () => {
  const r = leesFrank(fixture.data);
  assert.deepEqual(Object.keys(r).sort(), ["gasInkoopopslag", "gasVastPerMaand", "stroomInkoopopslag", "stroomVastPerMaand", "terugleverCorrectie"]);
  assert.equal(r.stroomInkoopopslag?.waarde, 0.01815);
  assert.equal(r.gasInkoopopslag?.waarde, 0.07986);
  assert.equal(r.terugleverCorrectie?.waarde, -0.012705);
  assert.ok(Object.values(r).every((v) => v!.inclBtw));
});

test("rekentoolwaarden worden excl. btw, bron 'rekentool'", () => {
  const rec = bouwLeverancier(frank, new Map(), undefined, "2026-09-24T04:17:00Z", [], leesFrank(fixture.data));
  const t = rec.tarieven;
  assert.equal(t.stroomInkoopopslag?.bedragExclBtw, 0.015);
  assert.equal(t.gasInkoopopslag?.bedragExclBtw, 0.066);
  assert.equal(t.terugleverCorrectie?.bedragExclBtw, -0.0105);
  assert.equal(t.stroomVastPerMaand?.bedragExclBtw, 5.785124);
  assert.equal(t.stroomInkoopopslag?.bron, "rekentool");
  assert.equal(t.stroomInkoopopslag?.geverifieerd, true);
});

test("als de rekentool faalt, vallen we terug op handmatige waarden en melden we dat", () => {
  const rec = bouwLeverancier(frank, new Map(), undefined, "2026-09-24T04:17:00Z", ["rekentool: HTTP 503"], {});
  assert.equal(rec.tarieven.stroomInkoopopslag?.bron, "handmatig");
  assert.equal(rec.tarieven.stroomInkoopopslag?.bedragExclBtw, 0.015);
  assert.equal(rec.tarieven.stroomInkoopopslag?.laatsteFout, "rekentool gaf geen waarde");
  assert.equal(rec.ophaalfout, "rekentool: HTTP 503");
});

test("haalFrank: adres -> EAN's -> simulatie (netwerk nagebootst)", async () => {
  const aanroepen: any[] = [];
  const echteFetch = globalThis.fetch;
  globalThis.fetch = (async (_url: any, init: any) => {
    const body = JSON.parse(init.body);
    aanroepen.push(body);
    const json = body.query.includes("SignupMeteringPoints")
      ? { data: { signupMeteringPoints: { status: "ANSWERED", meteringPoints: [{ ean: body.variables.input.segment === "GAS" ? "GAS-EAN" : "EL-EAN" }] } } }
      : fixture;
    return new Response(JSON.stringify(json), { headers: { "content-type": "application/json" } });
  }) as typeof fetch;
  try {
    const r = await haalFrank(frank.rekentool!.testadres!);
    assert.equal(r.stroomInkoopopslag?.waarde, 0.01815);
  } finally {
    globalThis.fetch = echteFetch;
  }
  assert.equal(aanroepen.length, 3);
  const sim = aanroepen.find((c) => c.query.includes("SignupSimulatePrice")).variables.input;
  assert.equal(sim.electricityEAN, "EL-EAN");
  assert.equal(sim.gasEAN, "GAS-EAN");
  assert.equal(sim.zipCode, "8801KE");
  assert.equal(sim.electricityPropositionType, "dynamic");
});

// ---- Vandebron (real response captured 2026-09-24) ----
import { haalVandebron, leesVandebron, startdatumVoor } from "../src/rekentools/vandebron.ts";
import { haalBudget, leesBudget, RESELLER_ID } from "../src/rekentools/budget.ts";

const vdb = JSON.parse(await readFile(new URL("fixtures/vandebron-pricebreakdown-2026-09-24.json", import.meta.url), "utf8"));
const bt = JSON.parse(await readFile(new URL("fixtures/budget-online-offers-2026-09-24.json", import.meta.url), "utf8"));
const testadres = { postcode: "8801KE", huisnummer: 3, plaats: "X", omschrijving: "test" };

test("leesVandebron leest de dynamische opslagen excl. btw", () => {
  const r = leesVandebron(vdb);
  assert.equal(r.stroomInkoopopslag?.waarde, 0.01825);
  assert.equal(r.gasInkoopopslag?.waarde, 0.04945);
  assert.equal(r.terugleverCorrectie?.waarde, -0.01125);
  assert.equal(r.stroomVastPerMaand?.waarde, 5.781296); // 0.19007 per day x 365/12
  assert.ok(Object.values(r).every((v) => v!.inclBtw === false));
});

test("Vandebron-startdatum volgt de website (24 sep -> 1 nov)", () => {
  assert.equal(startdatumVoor("2026-09-24"), "2026-11-01");
  assert.equal(startdatumVoor("2026-12-15"), "2027-02-01");
});

test("haalVandebron: adres -> netbeheerder -> dynamische prijsopbouw (nagebootst)", async () => {
  const aanroepen: { url: string; body?: any }[] = [];
  const echteFetch = globalThis.fetch;
  globalThis.fetch = (async (url: any, init: any) => {
    aanroepen.push({ url: String(url), body: init?.body ? JSON.parse(init.body) : undefined });
    const json = String(url).includes("/validate/edsn/address")
      ? { electricityGridOperatorEan: "8716892000005", gasGridOperatorEan: "8716892000005" }
      : vdb;
    return new Response(JSON.stringify(json), { headers: { "content-type": "application/json" } });
  }) as typeof fetch;
  try {
    const r = await haalVandebron(testadres);
    assert.equal(r.stroomInkoopopslag?.waarde, 0.01825);
  } finally {
    globalThis.fetch = echteFetch;
  }
  assert.equal(aanroepen.length, 2);
  assert.match(aanroepen[0].url, /zipcode=8801KE/);
  assert.equal(aanroepen[1].body.electricity.contractDuration.durationType, "MarketPriceVariable");
  assert.equal(aanroepen[1].body.electricity.gridOperatorEan, "8716892000005");
});

// ---- Budget Thuis (real response captured 2026-09-24, trimmed) ----

test("leesBudget kiest de dynamische propositie, excl. btw", () => {
  const r = leesBudget(bt);
  assert.equal(r.stroomInkoopopslag?.waarde, 0.0139);
  assert.equal(r.gasInkoopopslag?.waarde, 0.053);
  assert.equal(r.stroomVastPerMaand?.waarde, 4.95);
  assert.equal(r.gasVastPerMaand?.waarde, 4.95);
  assert.equal(r.terugleverCorrectie?.waarde, 0);
});

test("leesBudget faalt duidelijk als er geen dynamische propositie is", () => {
  assert.throws(() => leesBudget({ salesChannels: [{ offers: [] }] }), /geen dynamische propositie/);
});

test("haalBudget stuurt het testadres en verbruik mee (nagebootst)", async () => {
  let verstuurd: any;
  const echteFetch = globalThis.fetch;
  globalThis.fetch = (async (_url: any, init: any) => {
    verstuurd = JSON.parse(init.body);
    return new Response(JSON.stringify(bt), { headers: { "content-type": "application/json" } });
  }) as typeof fetch;
  try {
    const r = await haalBudget(testadres);
    assert.equal(r.stroomInkoopopslag?.waarde, 0.0139);
  } finally {
    globalThis.fetch = echteFetch;
  }
  assert.equal(verstuurd.resellerId, RESELLER_ID);
  assert.deepEqual(verstuurd.address, { postalCode: "8801KE", houseNumber: 3, extension: "" });
});

test("adapters bewaren de exacte bedragen incl. btw uit de API", () => {
  const v = leesVandebron(vdb);
  assert.equal(v.stroomInkoopopslag?.waardeInclBtw, 0.02208);
  assert.equal(v.terugleverCorrectie?.waardeInclBtw, -0.01361);
  const b = leesBudget(bt);
  assert.equal(b.stroomInkoopopslag?.waardeInclBtw, 0.01682);
  const rec = bouwLeverancier(frank, new Map(), undefined, "2026-09-24T04:17:00Z", [], b);
  assert.equal(rec.tarieven.stroomInkoopopslag?.bedragExclBtw, 0.0139);
  assert.equal(rec.tarieven.stroomInkoopopslag?.bedragInclBtw, 0.01682);
});

// Real response captured from ANWB's quote API on 2026-09-26 (Eise Eisinga Planetarium test address; quote ids blanked).
const anwbQuote = JSON.parse(await readFile(new URL("fixtures/anwb-get-quote-by-id-2026-09-26.json", import.meta.url), "utf8"));
const anwb = (await laadLeverancierConfigs()).find((c) => c.id === "anwb")!;

test("leesAnwb pakt alleen de vaste leveringskosten, niet netbeheer of de opslag", () => {
  const r = leesAnwb(anwbQuote);
  assert.deepEqual(r, { stroomVastPerMaand: { waarde: 8.52, inclBtw: true }, gasVastPerMaand: { waarde: 9.75, inclBtw: true } });
  const rec = bouwLeverancier(anwb, new Map(), undefined, "2026-09-26T05:00:00Z", [], r);
  assert.equal(rec.tarieven.stroomVastPerMaand?.bron, "rekentool");
  assert.equal(rec.tarieven.stroomVastPerMaand?.bedragInclBtw, 8.52);
});

test("leesAnwb weigert bedragen die niet incl. btw lijken", () => {
  const excl = structuredClone(anwbQuote);
  excl.data.electricityDetails.breakdown.energyTaxPerKwh = 0.0916;
  assert.throws(() => leesAnwb(excl), /niet incl\. btw/);
});

test("haalAnwb: lookup, offerte, status, prijsopbouw (nagebootst)", async () => {
  const aanroepen: { url: string; body?: any }[] = [];
  let statussen = ["ACTIVE", "FINISHED"];
  const echteFetch = globalThis.fetch;
  globalThis.fetch = (async (url: any, init: any) => {
    const u = String(url);
    aanroepen.push({ url: u, body: init?.body ? JSON.parse(init.body) : undefined });
    const json = (d: unknown) => new Response(JSON.stringify(d), { headers: { "content-type": "application/json" } });
    if (u.includes("postcode-lookup"))
      return json({ city: "Franeker", streetName: "Eise Eisingastraat", postcode: "8801KE", houseNumber: 3, houseNumberSuffices: [{ suffix: "EMPTY", meterpoints: [{ type: "electricity", eanCode: "EAN", gridOperatorId: "GO", isRetail: true }, { type: "gas", eanCode: "GAS", gridOperatorId: "GO", isRetail: true }] }] });
    if (u.endsWith("/v1/get-quote")) return new Response("abc");
    if (u.includes("get-quote/status")) {
      const status = statussen.shift();
      return json(status === "FINISHED" ? { status, quoteId: { electricity: "q1", gas: "q2" } } : { status });
    }
    if (u.includes("get-quote-by-id")) return json(anwbQuote);
    throw new Error("onverwacht: " + u);
  }) as typeof fetch;
  try {
    const r = await haalAnwb(anwb.rekentool!.testadres!, 0);
    assert.equal(r.stroomVastPerMaand?.waarde, 8.52);
  } finally {
    globalThis.fetch = echteFetch;
  }
  assert.ok(aanroepen.every((a) => !/aanvraag/i.test(a.url)), "nooit een aanvraag versturen");
  const offerte = aanroepen.find((a) => a.url.endsWith("/v1/get-quote"))!;
  assert.equal(offerte.body.type, "electricity_gas");
  assert.equal(offerte.body.electricity.eanCode, "EAN");
  assert.equal(offerte.body.gas.eanCode, "GAS");
  assert.equal(offerte.body.address.postcode, "8801KE");
  assert.match(aanroepen.at(-1)!.url, /electricity_id=q1&gas_id=q2/);
});

test("haalAnwb weigert een grootverbruiksaansluiting", async () => {
  const echteFetch = globalThis.fetch;
  globalThis.fetch = (async () =>
    new Response(JSON.stringify({ houseNumberSuffices: [{ suffix: "EMPTY", meterpoints: [{ type: "electricity", isRetail: false }] }] }))) as typeof fetch;
  try {
    await assert.rejects(haalAnwb(anwb.rekentool!.testadres!, 0), /grootverbruik/);
  } finally {
    globalThis.fetch = echteFetch;
  }
});

// Real offer captured from Vattenfall's calculator on 2026-09-26 (Eise Eisinga Planetarium test address).
const vfOfferte = JSON.parse(await readFile(new URL("fixtures/vattenfall-offer-2026-09-26.json", import.meta.url), "utf8"));
const vattenfall = (await laadLeverancierConfigs()).find((c) => c.id === "vattenfall")!;
// Dummy keys: the real ones are read from Vattenfall's script at run time and never stored.
const K1 = "1".repeat(32);
const K2 = "2".repeat(32);
const vfScript =
  `x={productSelector:{url:\`https://api.vattenfall.nl/vattenfallnlsalesflowproductselectorprd\`,headers:{"Content-Type":\`application/json\`,"Ocp-Apim-Subscription-Key":\`${K1}\`}},` +
  `offer:{url:\`https://api.vattenfall.nl/api/aompublicapi/salesandcontracting/v1\`,headers:{"Content-Type":\`application/json\`,"Ocp-Apim-Subscription-Key":\`${K2}\`}}}`;
const vfSummary = {
  propositions: [
    { propositionId: "ALLEEN-STROOM", productE: { verzamelID: "FPS-CM-999-LVR" } },
    { propositionId: "VAST-GAS", productE: { verzamelID: "FPS-CM-999-LVR" }, productG: { verzamelID: "VPG-CM-12-A" } },
    { propositionId: "FLEX-FLEX", productE: { verzamelID: "FPS-CM-999-LVR" }, productG: { verzamelID: "FPG-CM-999-LVR" } },
  ],
};

test("leesVattenfall pakt opslag en vaste kosten, excl. en incl. btw", () => {
  assert.deepEqual(leesVattenfall(vfOfferte), {
    stroomInkoopopslag: { waarde: 0.01239, inclBtw: false, waardeInclBtw: 0.014992 },
    stroomVastPerMaand: { waarde: 4.95, inclBtw: false, waardeInclBtw: 5.99 },
    gasInkoopopslag: { waarde: 0.06198, inclBtw: false, waardeInclBtw: 0.074996 },
    gasVastPerMaand: { waarde: 4.95, inclBtw: false, waardeInclBtw: 5.99 },
  });
});

test("Vattenfall: sleutel per API uit het script, propositie met dynamisch gas", () => {
  assert.equal(sleutelNa(vfScript, "vattenfallnlsalesflowproductselectorprd"), K1);
  assert.equal(sleutelNa(vfScript, "aompublicapi/salesandcontracting/v1"), K2);
  assert.throws(() => sleutelNa("geen sleutels", "aompublicapi/salesandcontracting/v1"), /geen API-sleutel/);
  assert.equal(kiesPropositie(vfSummary), "FLEX-FLEX");
  assert.throws(() => kiesPropositie({ propositions: vfSummary.propositions.slice(0, 2) }), /FlexPrijsGas/);
});

test("haalVattenfall: pagina -> script -> proposities -> aanbod (nagebootst)", async () => {
  const aanroepen: { url: string; sleutel?: string; body?: any }[] = [];
  const echteFetch = globalThis.fetch;
  globalThis.fetch = (async (url: any, init: any) => {
    const u = String(url);
    aanroepen.push({ url: u, sleutel: init?.headers?.["ocp-apim-subscription-key"], body: init?.body ? JSON.parse(init.body) : undefined });
    const json = (d: unknown) => new Response(JSON.stringify(d), { headers: { "content-type": "application/json" } });
    if (u.endsWith("/bestellen/")) return new Response(`<script src="main-ABC123.js" type="module"></script>`);
    if (u.endsWith("/main-ABC123.js")) return new Response(vfScript);
    if (u.includes("ProductsSelector/summary")) return json(vfSummary);
    if (u.endsWith("/offer")) return json(vfOfferte);
    throw new Error("onverwacht: " + u);
  }) as typeof fetch;
  try {
    const r = await haalVattenfall(vattenfall.rekentool!.testadres!);
    assert.equal(r.gasVastPerMaand?.waardeInclBtw, 5.99);
  } finally {
    globalThis.fetch = echteFetch;
  }
  assert.match(aanroepen[1].url, /\/bestellen\/main-ABC123\.js$/);
  assert.equal(aanroepen[2].sleutel, K1);
  const offerte = aanroepen[3];
  assert.equal(offerte.sleutel, K2);
  assert.equal(offerte.body.propositionId, "FLEX-FLEX");
  assert.equal(offerte.body.postalCode, "8801KE");
});

// ---- Zonopnaam (tariff sheet pdf saved 2026-09-29) ----
import { bedragen, haalZonopnaam, kiesTarievenblad, leesZonopnaam } from "../src/rekentools/zonopnaam.ts";
import { pdfRegels } from "../src/lib/pdf.ts";

const zonPdf = new Uint8Array(await readFile(new URL("fixtures/zonopnaam-tarievenblad-dynamisch-2026-09.pdf", import.meta.url)));
const zonPagina = [
  "/files/pdf/ZON_Tarievenblad_2026M7_Dynamisch_V02.pdf",
  "/files/pdf/ZON_Tarievenblad_2026M8_Dynamisch_V01.pdf",
  "/files/pdf/ZON_Tarievenblad_2026M9_Vast_V01.pdf",
  "/files/pdf/ZON_Tarievenblad_2026M9_Dynamisch_V01.pdf",
  "/files/pdf/ZON_Tarievenblad_2026M10_Dynamisch_V01.pdf",
  "/files/pdf/ZON_Tarievenblad_2026M10_Dynamisch_V02.pdf",
].map((h) => `<a href="${h}">pdf</a>`).join("\n");

test("kiesTarievenblad: blad van de lopende maand, nooit een toekomstige, hoogste versie", () => {
  assert.equal(kiesTarievenblad(zonPagina, "2026-09-30"), "https://www.zonopnaam.nl/files/pdf/ZON_Tarievenblad_2026M9_Dynamisch_V01.pdf");
  assert.equal(kiesTarievenblad(zonPagina, "2026-10-01"), "https://www.zonopnaam.nl/files/pdf/ZON_Tarievenblad_2026M10_Dynamisch_V02.pdf");
  // New month's sheet not there yet: use the newest older one.
  assert.equal(kiesTarievenblad(zonPagina, "2026-12-01"), "https://www.zonopnaam.nl/files/pdf/ZON_Tarievenblad_2026M10_Dynamisch_V02.pdf");
  assert.throws(() => kiesTarievenblad(zonPagina, "2026-06-15"), /geen tarievenblad/);
});

test("bedragen plakt de stukjes van een bedrag uit de pdf weer aan elkaar", () => {
  assert.deepEqual(bedragen("Vaste leveringskosten per dag € 0, 21736 € 0,0 4564 € 0,2 630"), [0.21736, 0.04564, 0.263]);
  assert.deepEqual(bedragen("Dynamisch tarief EPEX b eursprijs € 0, 0165"), [0.0165]);
});

test("leesZonopnaam leest stroom en gas uit het tarievenblad, excl. btw", async () => {
  const r = leesZonopnaam(await pdfRegels(zonPdf));
  assert.deepEqual(r, {
    stroomInkoopopslag: { waarde: 0.0165, inclBtw: false },
    gasInkoopopslag: { waarde: 0.066, inclBtw: false },
    stroomVastPerMaand: { waarde: 6.611367, inclBtw: false, waardeInclBtw: 7.999583 },
    gasVastPerMaand: { waarde: 6.198308, inclBtw: false, waardeInclBtw: 7.50075 },
  });
});

test("leesZonopnaam weigert als excl. en incl. btw niet bij elkaar passen", () => {
  const regels = ["Dynamisch tarief € 0,0165", "Vaste leveringskosten per dag € 0,21736 € 0,2999", "Dynamisch tarief € 0,066", "Vaste leveringskosten per dag € 0,20378 € 0,2466"];
  assert.throws(() => leesZonopnaam(regels), /21% btw/);
  assert.throws(() => leesZonopnaam(["Dynamisch tarief € 0,0165"]), /niet gevonden/);
});

test("haalZonopnaam: tariefpagina -> blad van deze maand -> waarden (netwerk nagebootst)", async () => {
  const opgehaald: string[] = [];
  const echteFetch = globalThis.fetch;
  globalThis.fetch = (async (url: any) => {
    opgehaald.push(String(url));
    return String(url).endsWith(".pdf") ? new Response(zonPdf) : new Response(zonPagina);
  }) as typeof fetch;
  try {
    const r = await haalZonopnaam(Date.parse("2026-09-15T12:00:00Z"));
    assert.equal(r.stroomInkoopopslag?.waarde, 0.0165);
  } finally {
    globalThis.fetch = echteFetch;
  }
  assert.deepEqual(opgehaald, ["https://www.zonopnaam.nl/tarieven", "https://www.zonopnaam.nl/files/pdf/ZON_Tarievenblad_2026M9_Dynamisch_V01.pdf"]);
});
