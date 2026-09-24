import { htmlToText } from "./extract.ts";

export const USER_AGENT =
  "dynamische-energieprijzen-nl/1.0 (+https://github.com/OWNER/dynamische-energieprijzen-nl)";

/** Fetch a page and return its visible text. */
export async function fetchPageText(url: string, render: "http" | "browser" = "http"): Promise<string> {
  const html = render === "browser" ? await fetchWithBrowser(url) : await fetchHttp(url);
  return htmlToText(html);
}

async function fetchHttp(url: string): Promise<string> {
  const res = await fetch(url, {
    headers: {
      "user-agent": USER_AGENT,
      "accept-language": "nl-NL,nl;q=0.9",
      accept: "text/html,application/xhtml+xml",
    },
    redirect: "follow",
    signal: AbortSignal.timeout(30_000),
  });
  if (!res.ok) throw new Error(`HTTP ${res.status} for ${url}`);
  return res.text();
}

// Playwright is only loaded for suppliers with "render": "browser".
let browserPromise: Promise<any> | null = null;

async function fetchWithBrowser(url: string): Promise<string> {
  let chromium: any;
  try {
    ({ chromium } = await import("playwright"));
  } catch {
    throw new Error('render "browser" needs playwright: npm i -D playwright && npx playwright install chromium');
  }
  // CHROMIUM_PATH lets you use an already-installed Chromium instead of `npx playwright install`.
  browserPromise ??= chromium.launch({ headless: true, executablePath: process.env.CHROMIUM_PATH || undefined });
  const browser = await browserPromise;
  const page = await browser.newPage({ userAgent: USER_AGENT, locale: "nl-NL" });
  try {
    await page.goto(url, { waitUntil: "networkidle", timeout: 45_000 });
    return await page.content();
  } finally {
    await page.close();
  }
}

export async function closeBrowser(): Promise<void> {
  if (browserPromise) {
    const b = await browserPromise;
    await b.close();
    browserPromise = null;
  }
}
