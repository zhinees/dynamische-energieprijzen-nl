import { mkdir, readFile, readdir, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import type { SupplierConfig } from "./types.ts";

export const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
export const DATA = join(ROOT, "data");

/** data/prices/2026/2026-09-24.json */
export function dayFilePath(date: string) {
  return join(DATA, "prices", date.slice(0, 4), `${date}.json`);
}

export async function readJson<T>(path: string): Promise<T | undefined> {
  try {
    return JSON.parse(await readFile(path, "utf8")) as T;
  } catch (e: any) {
    if (e.code === "ENOENT") return undefined;
    throw e;
  }
}

/** Keys that change on every run; ignored when deciding whether a file really changed. */
const VOLATILE = new Set(["generatedAt", "fetchedAt", "lastRun", "lastChecked"]);

function stable(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(stable);
  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>)
        .filter(([k]) => !VOLATILE.has(k))
        .map(([k, v]) => [k, stable(v)]),
    );
  }
  return value;
}

/**
 * Write JSON only when the content changed (ignoring timestamps), so the
 * scheduled jobs don't make a commit on every run. A file is still refreshed
 * when it is older than `maxAgeDays`, so consumers can see the job is alive.
 */
export async function writeJsonIfChanged(
  path: string,
  data: { generatedAt?: string } & Record<string, any>,
  maxAgeDays = 7,
): Promise<boolean> {
  const prev = await readJson<typeof data>(path);
  if (prev) {
    const same = JSON.stringify(stable(prev)) === JSON.stringify(stable(data));
    const ageDays = prev.generatedAt ? (Date.now() - Date.parse(prev.generatedAt)) / 86_400_000 : 0;
    if (same && ageDays < maxAgeDays) return false;
  }
  await mkdir(dirname(path), { recursive: true });
  await writeFile(path, JSON.stringify(data, null, 2) + "\n");
  return true;
}

export async function writeText(path: string, text: string): Promise<void> {
  await mkdir(dirname(path), { recursive: true });
  await writeFile(path, text);
}

export async function loadSupplierConfigs(dir = join(ROOT, "suppliers")): Promise<SupplierConfig[]> {
  const files = (await readdir(dir)).filter((f) => f.endsWith(".json")).sort();
  const out: SupplierConfig[] = [];
  for (const f of files) {
    const cfg = JSON.parse(await readFile(join(dir, f), "utf8")) as SupplierConfig;
    if (`${cfg.id}.json` !== f) throw new Error(`suppliers/${f}: id "${cfg.id}" must match the file name`);
    out.push(cfg);
  }
  return out;
}
