// Show what the scraper reads for one supplier. Use this while writing rules.
//
//   node src/debug-supplier.ts tibber                 # fetch the live page
//   node src/debug-supplier.ts tibber --file page.html  # use a saved copy
//   node src/debug-supplier.ts tibber --text          # also print the page text
//   node src/debug-supplier.ts tibber --grep inkoop   # print text around a word

import { readFile } from "node:fs/promises";
import { htmlToText, extractField } from "./lib/extract.ts";
import { closeBrowser, fetchPageText } from "./lib/fetch-page.ts";
import { loadSupplierConfigs } from "./lib/io.ts";
import { exclVat, rulesFor } from "./lib/tariffs.ts";
import { FIELD_KEYS } from "./lib/types.ts";

const args = process.argv.slice(2);
const id = args[0];
const flag = (name: string) => {
  const i = args.indexOf(name);
  return i === -1 ? undefined : args[i + 1] ?? "";
};

const configs = await loadSupplierConfigs();
const cfg = configs.find((c) => c.id === id);
if (!cfg) {
  console.error(`Usage: node src/debug-supplier.ts <id> [--file page.html] [--text] [--grep word]\nIds: ${configs.map((c) => c.id).join(", ")}`);
  process.exit(1);
}

const file = flag("--file");
const text = file ? htmlToText(await readFile(file, "utf8")) : await fetchPageText(cfg.tariffUrl, cfg.render ?? "http");
await closeBrowser();

console.log(`${cfg.name} — ${file ?? cfg.tariffUrl}`);
console.log(`page text: ${text.length} chars${!file && text.length < 2000 ? "  (very little text: probably rendered by JavaScript, try \"render\": \"browser\")" : ""}\n`);

for (const key of FIELD_KEYS) {
  const rules = rulesFor(cfg, key);
  if (!rules.length) {
    const m = cfg.manual[key];
    console.log(`${key}: no rule${m ? `, manual ${m.value}${m.vatIncluded ? " incl. btw" : ""} (checked ${m.checkedAt})` : ""}`);
    continue;
  }
  rules.forEach((rule, i) => {
    if (rule.url && rule.url !== cfg.tariffUrl) {
      console.log(`${key} [rule ${i}]: uses other url ${rule.url} (not fetched here)`);
      return;
    }
    const r = extractField(text, key, rule);
    const shown = r.ok && rule.vatIncluded ? `${r.value} incl. btw → ${exclVat(r.value!)} excl.` : String(r.value);
    console.log(`${key} [rule ${i}]: ${r.ok ? "OK " + shown : "FAIL " + r.reason}`);
    if (r.context) console.log(`   …${r.context}…`);
    if (r.rejected) console.log(`   rejected (out of range ${JSON.stringify(rule.range)}): ${r.rejected.join(", ")}`);
  });
}

const grep = flag("--grep");
if (grep) {
  console.log(`\n--- occurrences of "${grep}" ---`);
  const re = new RegExp(grep, "gi");
  let m: RegExpExecArray | null;
  let n = 0;
  while ((m = re.exec(text)) && n++ < 20) console.log(`…${text.slice(Math.max(0, m.index - 80), m.index + 160)}…\n`);
}
if (args.includes("--text")) console.log(`\n--- page text ---\n${text}`);
