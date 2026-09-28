import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { test } from "node:test";
import { bouwNetbeheer, bouwPostcodes, breidUit, gebiedenIn, leesCsv, leesXlsx, netbeheerderVoor, stroomBereiken, type NetbeheerConfig } from "../src/lib/netbeheer.ts";

const cfg = JSON.parse(await readFile(new URL("../netbeheer/netbeheerders.json", import.meta.url), "utf8")) as NetbeheerConfig;

test("leest de kleinverbruiksbestanden van elke netbeheerder", () => {
  // Liander: tab-separated, whole lines in quotes, POSTCODE/POSTCODE_EIND.
  const liander = leesCsv('"AANSLUITINGEN_AANTAL\tPOSTCODE\tPOSTCODE_EIND\tPOSTCODE_AANTAL\tPRODUCTSOORT"\r\n"29\t1011AA\t1011AB\t2\tELK"\r\n"11\t1011AA\t1011AB\t2\tGAS"\r\n');
  assert.deepEqual(stroomBereiken(liander), [["1011AA", "1011AB"]]);
  // Westland Infra: semicolons, "Postcode Van"/"Postcode Tot".
  const westland = leesCsv("Netbeheerder;Postcode Van;Postcode Tot;Productsoort\n8716878999996;2291AA;2291AE;GAS\n8716878999996;2291AA;2291AE;ELK\n");
  assert.deepEqual(stroomBereiken(westland), [["2291AA", "2291AE"]]);
  assert.throws(() => stroomBereiken([["iets", "anders"]]), /niet gevonden/);
});

test("leest een xlsx: het grootste werkblad, cellen op hun plek ook als er lege tussen zitten", async () => {
  const rijen = leesXlsx(await readFile(new URL("fixtures/netbeheer-klein.xlsx", import.meta.url)));
  assert.deepEqual(rijen[0], ["STRAATNAAM", "POSTCODE_VAN", "POSTCODE_TOT", "PRODUCTSOORT"]);
  assert.deepEqual(rijen[1], ["", "7701AA", "7701AC", "ELK"]);
  assert.equal(rijen[2][0], "Straat & Co");
  assert.deepEqual(stroomBereiken(rijen), [["7701AA", "7701AC"]]);
});

test("breidt postcodebereiken uit, ook over de grens van een gebied", () => {
  assert.deepEqual(breidUit("1011AA", "1011AC"), ["1011AA", "1011AB", "1011AC"]);
  assert.deepEqual(breidUit("1011ZZ", "1012AA"), ["1011ZZ", "1012AA"]);
  assert.deepEqual(breidUit("1011 aa", "1011AA"), ["1011AA"]);
  assert.deepEqual(breidUit("onzin", "1011AA"), []);
  assert.deepEqual(gebiedenIn([[["1011ZY", "1012AA"]]]), ["1011", "1012"]);
});

test("postcodetabel: gebied, zekere uitzonderingen, en Enexis alleen bij een lange reeks naast een kleine netbeheerder", () => {
  const pc = (pc4: string, n: number) => breidUit(`${pc4}AA`, `${pc4}ZZ`).slice(0, n);
  const bereiken = new Map<string, [string, string][]>([
    // 1011: Liander, with one Stedin postcode named explicitly and one Stedin range that skips over Liander's.
    ["liander", [["1011AA", "1011AH"], ["1011AK", "1011AT"]]],
    ["stedin", [["1011AJ", "1011AJ"], ["1011AB", "1011AD"]]],
    // 7701: Coteq with a long gap (Enexis); 7702: Coteq with a short gap.
    ["coteq", [["7701AA", "7701AT"], ["7702AA", "7702AB"], ["7702AE", "7702AJ"]]],
  ]);
  const bestaand = new Map([["1011", pc("1011", 21)], ["7701", pc("7701", 30)], ["7702", pc("7702", 10)]]);
  const t = { standaard: "enexis", ...bouwPostcodes(bereiken, bestaand, "enexis", new Set(["coteq"]), 10) };
  assert.deepEqual(t.postcodes4, { liander: ["1011"], coteq: ["7701", "7702"] });
  assert.equal(netbeheerderVoor(t, "1011AJ"), "stedin"); // named explicitly
  assert.equal(netbeheerderVoor(t, "1011AC"), "liander"); // only inside a Stedin range
  assert.equal(netbeheerderVoor(t, "1011AU"), "liander"); // in no file, short gap
  assert.equal(netbeheerderVoor(t, "7701AZ"), "enexis"); // long run next to Coteq
  assert.equal(netbeheerderVoor(t, "7702AC"), "coteq"); // short gap
  assert.equal(netbeheerderVoor(t, "7701"), "coteq");
  assert.equal(netbeheerderVoor(t, "5611 aa"), "enexis"); // in no file at all
  assert.equal(netbeheerderVoor(t, "0123AB"), undefined);

  // Without Coteq in `grens`, the long run follows the area.
  const zonder = { standaard: "enexis", ...bouwPostcodes(bereiken, bestaand, "enexis", new Set(), 10) };
  assert.equal(netbeheerderVoor(zonder, "7701AZ"), "coteq");
});

test("tarieven: alle netbeheerders en categorieën, 21% btw, oplopend met de aansluiting", () => {
  const b = bouwNetbeheer(cfg, "2026-09-28T00:00:00Z");
  assert.deepEqual(b.netbeheerders.map((n) => n.id).sort(), ["coteq", "enexis", "liander", "rendo", "stedin", "westland"]);
  assert.equal(b.netbeheerders.find((n) => n.id === "stedin")!.tarieven.tm3x25.bedragInclBtw, 476.7642);
  assert.ok(b.netbeheerders.every((n) => !("openData" in n)));
  const fout = structuredClone(cfg);
  fout.netbeheerders[0].tarieven.tm3x25.bedragExclBtw = 400;
  assert.throws(() => bouwNetbeheer(fout, ""), /21%/);
});
