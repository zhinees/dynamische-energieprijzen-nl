// Validate supplier configs and generated data against the JSON Schemas.
// Runs in CI on every pull request.

import { readdir } from "node:fs/promises";
import { join } from "node:path";
import Ajv2020 from "ajv/dist/2020.js";
import addFormats from "ajv-formats";
import { DATA, ROOT, loadSupplierConfigs, readJson } from "./lib/io.ts";
import { rulesFor } from "./lib/tariffs.ts";
import { FIELD_KEYS } from "./lib/types.ts";

const ajv = new (Ajv2020 as any)({ allErrors: true, strict: false });
(addFormats as any)(ajv);
for (const f of await readdir(join(ROOT, "schema"))) {
  const schema = await readJson<any>(join(ROOT, "schema", f));
  ajv.addSchema(schema, f);
}

let errors = 0;
const fail = (where: string, msg: string) => {
  errors++;
  console.error(`✗ ${where}: ${msg}`);
};

async function check(schemaFile: string, path: string) {
  const data = await readJson(path);
  if (data === undefined) return;
  const validate = ajv.getSchema(schemaFile)!;
  if (!validate(data)) {
    for (const e of validate.errors ?? []) fail(path.replace(ROOT + "/", ""), `${e.instancePath || "/"} ${e.message}`);
  }
}

// 1. Supplier configs
const configs = await loadSupplierConfigs();
for (const cfg of configs) {
  const where = `suppliers/${cfg.id}.json`;
  await check("supplier.schema.json", join(ROOT, where));
  for (const key of FIELD_KEYS) {
    for (const rule of rulesFor(cfg, key)) {
      for (const re of [...rule.labels, rule.section].filter(Boolean) as string[]) {
        try {
          new RegExp(re, "i");
        } catch (e) {
          fail(where, `${key}: invalid regex ${JSON.stringify(re)}`);
        }
      }
      if (rule.range[0] > rule.range[1]) fail(where, `${key}: range min > max`);
    }
    const wanted = key.startsWith("gas") ? cfg.products.gas : cfg.products.electricity;
    if (wanted && !rulesFor(cfg, key).length && !cfg.manual[key]) {
      console.warn(`! ${where}: ${key} has no scrape rule and no manual value`);
    }
    const m = cfg.manual[key];
    if (m && m.checkedAt > new Date().toISOString().slice(0, 10)) fail(where, `${key}: checkedAt is in the future`);
  }
}

// 2. Generated data (if present)
await check("suppliers.schema.json", join(DATA, "suppliers.json"));
await check("latest.schema.json", join(DATA, "prices", "latest.json"));
await check("compare.schema.json", join(DATA, "compare", "latest.json"));
for (const y of (await readdir(join(DATA, "prices")).catch(() => [] as string[])).filter((d) => /^\d{4}$/.test(d))) {
  for (const f of (await readdir(join(DATA, "prices", y))).filter((f) => f.endsWith(".json"))) {
    await check("prices.schema.json", join(DATA, "prices", y, f));
  }
}

if (errors) {
  console.error(`\n${errors} problem(s)`);
  process.exit(1);
}
console.log(`✓ ${configs.length} supplier configs and data files valid`);
