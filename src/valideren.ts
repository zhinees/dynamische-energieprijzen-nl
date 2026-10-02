// Validate supplier configs and generated data against the JSON Schemas.
// Runs in CI on every pull request.

import { readdir } from "node:fs/promises";
import { join } from "node:path";
import Ajv2020 from "ajv/dist/2020.js";
import addFormats from "ajv-formats";
import { DATA, ROOT, laadLeverancierConfigs, leesJson } from "./lib/bestanden.ts";
import { regelsVoor } from "./lib/tarieven.ts";
import { VELDEN, type EnergiebelastingConfig } from "./lib/typen.ts";
import type { NetbeheerConfig } from "./lib/netbeheer.ts";
import type { ThuisbatterijenConfig } from "./lib/thuisbatterijen.ts";
import { bouwVasteContracten, type VasteContractenConfig } from "./lib/vaste-contracten.ts";

const ajv = new (Ajv2020 as any)({ allErrors: true, strict: false });
(addFormats as any)(ajv);
for (const f of await readdir(join(ROOT, "schema"))) {
  const schema = await leesJson<any>(join(ROOT, "schema", f));
  ajv.addSchema(schema, f);
}

let fouten = 0;
const fout = (waar: string, bericht: string) => {
  fouten++;
  console.error(`✗ ${waar}: ${bericht}`);
};

async function controleer(schemaBestand: string, pad: string) {
  const data = await leesJson(pad);
  if (data === undefined) return;
  const valideer = ajv.getSchema(schemaBestand)!;
  if (!valideer(data)) {
    for (const e of valideer.errors ?? []) fout(pad.replace(ROOT + "/", ""), `${e.instancePath || "/"} ${e.message}`);
  }
}

// 1. Supplier configs
const configs = await laadLeverancierConfigs();
for (const cfg of configs) {
  const waar = `leveranciers/${cfg.id}.json`;
  const ontbrekend: string[] = [];
  await controleer("leverancier.schema.json", join(ROOT, waar));
  for (const veld of VELDEN) {
    for (const regel of regelsVoor(cfg, veld)) {
      for (const re of [...regel.labels, regel.sectie].filter(Boolean) as string[]) {
        try {
          new RegExp(re, "i");
        } catch (e) {
          fout(waar, `${veld}: ongeldige regex ${JSON.stringify(re)}`);
        }
      }
      if (regel.bereik[0] > regel.bereik[1]) fout(waar, `${veld}: bereik min > max`);
    }
    const nodig = veld.startsWith("gas") ? cfg.producten.gas : cfg.producten.stroom;
    if (nodig && !regelsVoor(cfg, veld).length && !cfg.handmatig[veld] && !cfg.rekentool) ontbrekend.push(veld);
    const h = cfg.handmatig[veld];
    if (h && (h as any).geverifieerd !== true) fout(waar, `${veld}: handmatige waarden moeten op de eigen site van de leverancier gecontroleerd zijn (geverifieerd: true)`);
    if (h && h.gecontroleerdOp > new Date().toISOString().slice(0, 10)) fout(waar, `${veld}: gecontroleerdOp ligt in de toekomst`);
  }
  if (ontbrekend.length) console.log(`· ${cfg.id}: nog geen geverifieerde bron voor ${ontbrekend.length === VELDEN.length ? "alle velden (niet gepubliceerd)" : ontbrekend.join(", ")}`);
}

// 2. Energy tax config
const belastingCfg = join(ROOT, "belastingen", "energiebelasting.json");
await controleer("energiebelasting-config.schema.json", belastingCfg);
for (const [jaar, h] of Object.entries((await leesJson<EnergiebelastingConfig>(belastingCfg))?.handmatig ?? {})) {
  if (h.gecontroleerdOp > new Date().toISOString().slice(0, 10)) fout("belastingen/energiebelasting.json", `${jaar}: gecontroleerdOp ligt in de toekomst`);
}

// 3. Grid tariffs config
const netbeheerCfg = join(ROOT, "netbeheer", "netbeheerders.json");
await controleer("netbeheer-config.schema.json", netbeheerCfg);
for (const n of (await leesJson<NetbeheerConfig>(netbeheerCfg))?.netbeheerders ?? []) {
  if (n.gecontroleerdOp > new Date().toISOString().slice(0, 10)) fout("netbeheer/netbeheerders.json", `${n.id}: gecontroleerdOp ligt in de toekomst`);
}

// 4. Home battery prices config
const batterijCfg = join(ROOT, "thuisbatterijen", "thuisbatterijen.json");
await controleer("thuisbatterijen-config.schema.json", batterijCfg);
const batterijen = await leesJson<ThuisbatterijenConfig>(batterijCfg);
if (batterijen && batterijen.gecontroleerdOp > new Date().toISOString().slice(0, 10)) fout("thuisbatterijen/thuisbatterijen.json", "gecontroleerdOp ligt in de toekomst");
const modellenCfg = join(ROOT, "thuisbatterijen", "modellen.json");
await controleer("batterijmodellen-config.schema.json", modellenCfg);
const modellen = await leesJson<{ gecontroleerdOp: string }>(modellenCfg);
if (modellen && modellen.gecontroleerdOp > new Date().toISOString().slice(0, 10)) fout("thuisbatterijen/modellen.json", "gecontroleerdOp ligt in de toekomst");

// 4b. Home charging config (ERE payment, home charger price)
const ladenCfg = join(ROOT, "laden", "laden.json");
await controleer("laden-config.schema.json", ladenCfg);
const laden = await leesJson<{ gecontroleerdOp: string }>(ladenCfg);
if (laden && laden.gecontroleerdOp > new Date().toISOString().slice(0, 10)) fout("laden/laden.json", "gecontroleerdOp ligt in de toekomst");

// 4c. Fixed contracts of suppliers
const vasteCfg = join(ROOT, "vaste-contracten", "contracten.json");
await controleer("vaste-contracten-config.schema.json", vasteCfg);
const vaste = await leesJson<VasteContractenConfig>(vasteCfg);
if (vaste) {
  if (vaste.gecontroleerdOp > new Date().toISOString().slice(0, 10)) fout("vaste-contracten/contracten.json", "gecontroleerdOp ligt in de toekomst");
  try {
    bouwVasteContracten(vaste, new Date().toISOString(), Object.fromEntries(configs.map((l) => [l.id, l.website])));
  } catch (e) {
    fout("vaste-contracten/contracten.json", (e as Error).message);
  }
}

// 5. Generated data (if present)
await controleer("leveranciers.schema.json", join(DATA, "leveranciers.json"));
await controleer("energiebelasting.schema.json", join(DATA, "energiebelasting.json"));
await controleer("omslagpunten.schema.json", join(DATA, "omslagpunten.json"));
await controleer("netbeheer.schema.json", join(DATA, "netbeheer.json"));
await controleer("netbeheer-postcodes.schema.json", join(DATA, "netbeheer-postcodes.json"));
await controleer("thuisbatterijen.schema.json", join(DATA, "thuisbatterijen.json"));
await controleer("batterijmodellen.schema.json", join(DATA, "batterijmodellen.json"));
await controleer("laden.schema.json", join(DATA, "laden.json"));
await controleer("vast.schema.json", join(DATA, "vast.json"));
await controleer("vaste-contracten.schema.json", join(DATA, "vaste-contracten.json"));

if (fouten) {
  console.error(`\n${fouten} probleem/problemen`);
  process.exit(1);
}
console.log(`✓ ${configs.length} leveranciersbestanden, het energiebelastingbestand, de netbeheertarieven, de batterijprijzen, de batterijmodellen, thuis laden, het gemiddelde vaste contract, de vaste contracten en de databestanden zijn geldig`);
