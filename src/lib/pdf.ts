// Text from a pdf with pdf.js (Mozilla), for suppliers that publish tariffs or terms as pdf.

import { getDocument, VerbosityLevel } from "pdfjs-dist/legacy/build/pdf.mjs";

/** The pdf's text as lines (items on the same height, left to right), page by page. */
export async function pdfRegels(data: Uint8Array): Promise<string[]> {
  // pdf.js takes over (detaches) the buffer it gets, so give it a copy.
  const doc = await getDocument({ data: data.slice(), verbosity: VerbosityLevel.ERRORS }).promise;
  const regels: string[] = [];
  for (let i = 1; i <= doc.numPages; i++) {
    const inhoud = await (await doc.getPage(i)).getTextContent();
    const perHoogte = new Map<number, { x: number; tekst: string }[]>();
    for (const item of inhoud.items) {
      if (!("str" in item) || !item.str) continue;
      const y = Math.round(item.transform[5]);
      if (!perHoogte.has(y)) perHoogte.set(y, []);
      perHoogte.get(y)!.push({ x: item.transform[4], tekst: item.str });
    }
    for (const [, delen] of [...perHoogte].sort((a, b) => b[0] - a[0]))
      regels.push(delen.sort((a, b) => a.x - b.x).map((d) => d.tekst).join(" ").replace(/\s+/g, " ").trim());
  }
  await doc.loadingTask.destroy();
  return regels;
}
