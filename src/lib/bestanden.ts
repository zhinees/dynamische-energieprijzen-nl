import { mkdir, readFile, readdir, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import type { LeverancierConfig } from "./typen.ts";

export const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
export const DATA = join(ROOT, "data");

/** data/prijzen/2026/2026-09-24.json */
export function dagbestandPad(datum: string) {
  return join(DATA, "prijzen", datum.slice(0, 4), `${datum}.json`);
}

export async function leesJson<T>(pad: string): Promise<T | undefined> {
  try {
    return JSON.parse(await readFile(pad, "utf8")) as T;
  } catch (e: any) {
    if (e.code === "ENOENT") return undefined;
    throw e;
  }
}

/** Keys that change on every run; ignored when deciding whether a file really changed. */
const VLUCHTIG = new Set(["gegenereerdOp", "opgehaaldOp", "laatstUitgevoerd", "laatstGecontroleerd"]);

function stabiel(waarde: unknown): unknown {
  if (Array.isArray(waarde)) return waarde.map(stabiel);
  if (waarde && typeof waarde === "object") {
    return Object.fromEntries(
      Object.entries(waarde as Record<string, unknown>)
        .filter(([k]) => !VLUCHTIG.has(k))
        .map(([k, v]) => [k, stabiel(v)]),
    );
  }
  return waarde;
}

/**
 * Write JSON only when the content changed (ignoring timestamps), so the
 * scheduled jobs don't make a commit on every run. A file is still refreshed
 * when it is older than `maxLeeftijdDagen`, so consumers can see the job is alive.
 */
export async function schrijfJsonAlsGewijzigd(
  pad: string,
  data: { gegenereerdOp?: string } & Record<string, any>,
  maxLeeftijdDagen = 7,
): Promise<boolean> {
  const vorige = await leesJson<typeof data>(pad);
  if (vorige) {
    const gelijk = JSON.stringify(stabiel(vorige)) === JSON.stringify(stabiel(data));
    const leeftijdDagen = vorige.gegenereerdOp ? (Date.now() - Date.parse(vorige.gegenereerdOp)) / 86_400_000 : 0;
    if (gelijk && leeftijdDagen < maxLeeftijdDagen) return false;
  }
  await mkdir(dirname(pad), { recursive: true });
  await writeFile(pad, JSON.stringify(data, null, 2) + "\n");
  return true;
}

export async function schrijfTekst(pad: string, tekst: string): Promise<void> {
  await mkdir(dirname(pad), { recursive: true });
  await writeFile(pad, tekst);
}

export async function laadLeverancierConfigs(map = join(ROOT, "leveranciers")): Promise<LeverancierConfig[]> {
  const bestanden = (await readdir(map)).filter((f) => f.endsWith(".json")).sort();
  const uit: LeverancierConfig[] = [];
  for (const f of bestanden) {
    const cfg = JSON.parse(await readFile(join(map, f), "utf8")) as LeverancierConfig;
    if (`${cfg.id}.json` !== f) throw new Error(`leveranciers/${f}: id "${cfg.id}" moet gelijk zijn aan de bestandsnaam`);
    uit.push(cfg);
  }
  return uit;
}
