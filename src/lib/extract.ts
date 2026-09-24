import type { FieldKey, FieldRule } from "./types.ts";

/** Turn an HTML page into one line of visible text. Headings become "## Title ##". */
export function htmlToText(html: string): string {
  return html
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<noscript[\s\S]*?<\/noscript>/gi, " ")
    .replace(/<h[1-6][^>]*>([\s\S]*?)<\/h[1-6]>/gi, " ## $1 ## ")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;|&#160;|&#xa0;/gi, " ")
    .replace(/&euro;|&#8364;|&#x20ac;/gi, "€")
    .replace(/&amp;/gi, "&")
    .replace(/&#(\d+);/g, (_, n) => String.fromCharCode(Number(n)))
    .replace(/\s+/g, " ")
    .trim();
}

/** "0,0182" / "0.0182" / "€ 7,25" / "1.234,56" -> number */
export function parseEuro(raw: string): number | null {
  let s = raw.replace(/[€\s]/g, "");
  if (s.includes(",") && s.includes(".")) s = s.replace(/\./g, "").replace(",", ".");
  else s = s.replace(",", ".");
  const n = Number(s);
  return Number.isFinite(n) ? n : null;
}

// Optional minus and €, digits, decimal separator, 1–5 decimals, optional "cent".
// "€ 0" (euro sign, no decimals) is allowed; bare integers like "2026" are not.
const AMOUNT = /(-?\s*€\s*\d{1,4}(?:[.,]\d{1,5})?|-?\d{1,4}[.,]\d{1,5})\s*(cent|ct)?/gi;

const STROOM = [/## [^#]*(stroom|elektriciteit)[^#]*##/i, /stroom|elektriciteit/i];
const GAS = [/## [^#]*\bgas\b[^#]*##/i, /\bgas\b/i];
const DEFAULT_SECTION: Record<FieldKey, RegExp[] | null> = {
  electricityFixedMonthly: STROOM,
  electricityMarkup: STROOM,
  gasFixedMonthly: GAS,
  gasMarkup: GAS,
  feedInDelta: null,
};

export interface ExtractResult {
  ok: boolean;
  value: number | null;
  reason?: string;
  /** Text around the match, so a contributor can see what was read. */
  context?: string;
  /** Out-of-range candidates that were skipped (helps tune `range`). */
  rejected?: number[];
}

/** Try one rule or a list of rules; first success wins. */
export function extractFieldAny(text: string, key: FieldKey, rules: FieldRule | FieldRule[]): ExtractResult & { ruleIndex?: number } {
  const list = Array.isArray(rules) ? rules : [rules];
  let last: ExtractResult = { ok: false, value: null, reason: "no rules" };
  for (let i = 0; i < list.length; i++) {
    const r = extractField(text, key, list[i]);
    if (r.ok) return { ...r, ruleIndex: i };
    last = r;
  }
  return last;
}

export function extractField(text: string, key: FieldKey, rule: FieldRule): ExtractResult {
  const window = rule.window ?? 160;
  const anchors = rule.section ? [new RegExp(rule.section, "i")] : DEFAULT_SECTION[key];
  let start = 0;
  for (const re of anchors ?? []) {
    const m = re.exec(text);
    if (m) {
      start = m.index;
      break;
    }
  }
  // "before" rules look left of the label, so keep `window` characters before the section start.
  if (rule.before) start = Math.max(0, start - window);
  const scoped = text.slice(start);
  const rejected: number[] = [];

  for (const label of rule.labels) {
    const re = new RegExp(label, "gi");
    let m: RegExpExecArray | null;
    while ((m = re.exec(scoped))) {
      const from = m.index + m[0].length;
      const candidates: { raw: string; cent: boolean; at: number; len: number }[] = [];
      const area = rule.before ? scoped.slice(Math.max(0, m.index - window), m.index) : scoped.slice(from, from + window);
      AMOUNT.lastIndex = 0;
      let a: RegExpExecArray | null;
      while ((a = AMOUNT.exec(area))) candidates.push({ raw: a[1], cent: !!a[2], at: a.index, len: a[0].length });
      // Nearest to the label first.
      if (rule.before) candidates.reverse();
      for (const c of candidates) {
        let value = parseEuro(c.raw);
        if (value === null) continue;
        if (c.cent) value = value / 100; // "1,82 cent" -> 0.0182
        if (rule.negate) value = -Math.abs(value);
        value = Math.round(value * 1e6) / 1e6 + 0; // + 0 turns -0 into 0
        const [lo, hi] = rule.range;
        if (value < lo || value > hi) {
          rejected.push(value);
          continue;
        }
        const ctxFrom = rule.before ? Math.max(0, m.index - window) + c.at - 20 : m.index - 40;
        const ctxTo = rule.before ? from + 20 : from + c.at + c.len + 20;
        return { ok: true, value, context: scoped.slice(Math.max(0, ctxFrom), ctxTo) };
      }
    }
  }
  return {
    ok: false,
    value: null,
    reason: rejected.length ? "only out-of-range amounts found" : "label not found or no amount after it",
    rejected: rejected.length ? rejected.slice(0, 10) : undefined,
  };
}
