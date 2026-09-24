// Validate supplier configs and generated data against the JSON Schemas.
// Runs in CI on every pull request.

import { readdir } from "node:fs/promises";
import { join } from "node:path";
import Ajv2020 from "ajv/dist/2020.js";
import addFormats from "ajv-formats";
import { DATA, ROOT, laadLeverancierConfigs, leesJson } from "./lib/bestanden.ts";
import { regelsVoor } from "./lib/tarieven.ts";
import { VELDEN, type EnergiebelastingConfig } from "./lib/typen.ts";

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

// 3. Generated data (if present)
await controleer("leveranciers.schema.json", join(DATA, "leveranciers.json"));
await controleer("energiebelasting.schema.json", join(DATA, "energiebelasting.json"));
await controleer("omslagpunten.schema.json", join(DATA, "omslagpunten.json"));

if (fouten) {
  console.error(`\n${fouten} probleem/problemen`);
  process.exit(1);
}
console.log(`✓ ${configs.length} leveranciersbestanden, het energiebelastingbestand en de databestanden zijn geldig`);
