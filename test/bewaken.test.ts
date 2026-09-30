import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { test } from "node:test";
import { bestandsnaam, bewaak, bewaakteTekst, rapport, verschil, zinnen } from "../src/lib/bewaken.ts";
import { laadLeverancierConfigs } from "../src/lib/bestanden.ts";

const F = "inkoop|opslag|toeslag|vastrecht";

test("zinnen splitst op zinseinden en kopjes, niet in bedragen", () => {
  assert.deepEqual(zinnen("## Tarieven ## Je betaalt € 0,015 opslag. Vastrecht is € 5,99 per maand! Klaar"), [
    "Tarieven",
    "Je betaalt € 0,015 opslag.",
    "Vastrecht is € 5,99 per maand!",
    "Klaar",
  ]);
});

test("bewaakteTekst houdt met een filter alleen relevante zinnen over", () => {
  const tekst = bewaakteTekst(["Krijg tot € 240 korting. Je betaalt een inkooptoeslag van € 0,025. Carl ★★★★★ top geholpen."], F);
  assert.equal(tekst, "Je betaalt een inkooptoeslag van € 0,025.\n");
});

test("verschil toont wat wegging en wat erbij kwam", () => {
  assert.deepEqual(verschil("a\nb\nc\n", "a\nc\nd\n"), { weg: ["b"], erbij: ["d"] });
  assert.deepEqual(verschil("a\na\n", "a\n"), { weg: ["a"], erbij: [] });
  assert.deepEqual(verschil("a\n", "a\n"), { weg: [], erbij: [] });
});

test("bestandsnaam is leesbaar en per leverancier", () => {
  assert.equal(bestandsnaam("mega", "https://www.mega.nl/dynamisch-energiecontract/"), "mega--dynamisch-energiecontract.txt");
  assert.equal(
    bestandsnaam("mega", "https://s3.eu-west-3.amazonaws.com/mega.nl/files/MegaDynamisch+productvoorwaarden.pdf"),
    "mega--mega-nl-files-megadynamisch-productvoorwaarden.txt",
  );
});

test("bewaak: nieuw, gelijk, gewijzigd en fout; rapport meldt alleen een wijziging met ## 🔔", async () => {
  const cfg: any = {
    id: "test",
    naam: "Test Energie",
    bewaken: [
      { url: "https://voorbeeld.nl/a", omschrijving: "pagina a", filter: F },
      { url: "https://voorbeeld.nl/b", omschrijving: "pagina b", filter: F },
      { url: "https://voorbeeld.nl/c", omschrijving: "pagina c", filter: F },
      { url: "https://voorbeeld.nl/kapot", omschrijving: "kapot" },
    ],
  };
  const paginas: Record<string, string> = {
    "https://voorbeeld.nl/a": "<p>Opslag € 0,015. Korting € 100.</p>",
    "https://voorbeeld.nl/b": "<p>Opslag € 0,020. Korting € 200.</p>",
    "https://voorbeeld.nl/c": "<p>Vastrecht € 5,99.</p>",
  };
  const echteFetch = globalThis.fetch;
  globalThis.fetch = (async (url: any) =>
    paginas[String(url)] ? new Response(paginas[String(url)], { headers: { "content-type": "text/html" } }) : new Response("weg", { status: 503 })) as typeof fetch;
  let uit;
  try {
    uit = await bewaak([cfg], new Map([
      ["test--a.txt", "Opslag € 0,015.\n"],
      ["test--b.txt", "Opslag € 0,015.\n"],
    ]));
  } finally {
    globalThis.fetch = echteFetch;
  }
  assert.deepEqual(uit.map((u) => u.status), ["gelijk", "gewijzigd", "nieuw", "fout"]);
  assert.deepEqual(uit[1].verschil, { weg: ["Opslag € 0,015."], erbij: ["Opslag € 0,020."] });
  assert.match(uit[3].fout!, /503/);

  const md = rapport(uit, "2026-09-30");
  assert.match(md, /^## 🔔 Test Energie: pagina b$/m);
  assert.match(md, /^- Opslag € 0,015\.$/m);
  assert.match(md, /^\+ Opslag € 0,020\.$/m);
  // Without a change there is no "## 🔔" heading, so the workflow opens no issue.
  assert.doesNotMatch(rapport(uit.filter((u) => u.status !== "gewijzigd"), "2026-09-30"), /^## 🔔/m);
});

test("bewaak leest ook pdf's", async () => {
  const pdf = await readFile(new URL("fixtures/zonopnaam-tarievenblad-dynamisch-2026-09.pdf", import.meta.url));
  const cfg: any = { id: "zon", naam: "Zon", bewaken: [{ url: "https://voorbeeld.nl/blad.pdf", omschrijving: "blad", filter: "Vaste leveringskosten per dag" }] };
  const echteFetch = globalThis.fetch;
  globalThis.fetch = (async () => new Response(pdf, { headers: { "content-type": "application/pdf" } })) as typeof fetch;
  try {
    const [u] = await bewaak([cfg], new Map());
    assert.equal(u.status, "nieuw");
    assert.match(u.tekst!, /Vaste leveringskosten per dag € 0, 21736/);
  } finally {
    globalThis.fetch = echteFetch;
  }
});

test("alle bewaakte URL's in de leveranciersbestanden hebben een unieke bestandsnaam", async () => {
  const namen = (await laadLeverancierConfigs()).flatMap((c) => (c.bewaken ?? []).map((b) => bestandsnaam(c.id, b.url)));
  assert.ok(namen.length > 0);
  assert.equal(new Set(namen).size, namen.length);
});
