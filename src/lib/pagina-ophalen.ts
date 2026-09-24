import { htmlNaarTekst } from "./uitlezen.ts";

export const USER_AGENT =
  "dynamische-energieprijzen-nl/1.0 (+https://github.com/zhinees/dynamische-energieprijzen-nl)";

/** Fetch a page and return its visible text. */
export async function haalPaginaTekst(url: string, ophalen: "http" | "browser" = "http"): Promise<string> {
  const html = ophalen === "browser" ? await haalMetBrowser(url) : await haalHttp(url);
  return htmlNaarTekst(html);
}

async function haalHttp(url: string): Promise<string> {
  const res = await fetch(url, {
    headers: {
      "user-agent": USER_AGENT,
      "accept-language": "nl-NL,nl;q=0.9",
      accept: "text/html,application/xhtml+xml",
    },
    redirect: "follow",
    signal: AbortSignal.timeout(30_000),
  });
  if (!res.ok) throw new Error(`HTTP ${res.status} voor ${url}`);
  return res.text();
}

// Playwright is only loaded for suppliers with "ophalen": "browser".
let browserBelofte: Promise<any> | null = null;

async function haalMetBrowser(url: string): Promise<string> {
  let chromium: any;
  try {
    ({ chromium } = await import("playwright"));
  } catch {
    throw new Error('ophalen "browser" heeft playwright nodig: npm i -D playwright && npx playwright install chromium');
  }
  // CHROMIUM_PATH lets you use an already-installed Chromium instead of `npx playwright install`.
  browserBelofte ??= chromium.launch({ headless: true, executablePath: process.env.CHROMIUM_PATH || undefined });
  const browser = await browserBelofte;
  const pagina = await browser.newPage({ userAgent: USER_AGENT, locale: "nl-NL" });
  try {
    await pagina.goto(url, { waitUntil: "networkidle", timeout: 45_000 });
    return await pagina.content();
  } finally {
    await pagina.close();
  }
}

export async function sluitBrowser(): Promise<void> {
  if (browserBelofte) {
    const b = await browserBelofte;
    await b.close();
    browserBelofte = null;
  }
}
