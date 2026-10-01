// Home charging: the ERE payment per kWh charged at home and the purchase price of a home charger, hand-maintained
// (laden/laden.json) → data/laden.json, with a few sanity checks.

export type Bereik = { van: number; tot: number };
export type Bron = { url: string; datum: string; notitie?: string };

export type LadenConfig = {
  gecontroleerdOp: string;
  ere: { omschrijving: string; voorwaarden: string; perKwh: Bereik & { richtwaarde: number }; bronnen: Bron[] };
  laadpaal: { omschrijving: string; prijsInclBtw: Bereik; bronnen: Bron[]; controlebronnen?: { url: string; notitie: string }[] };
};

export type LadenBestand = { gegenereerdOp: string; gecontroleerdOp: string; valuta: "EUR" } & Omit<LadenConfig, "gecontroleerdOp">;

export function bouwLaden(cfg: LadenConfig, nu: string): LadenBestand {
  const e = cfg.ere.perKwh;
  if (!(e.van > 0 && e.van <= e.tot)) throw new Error("ere: 'van' moet tussen 0 en 'tot' liggen");
  if (!(e.richtwaarde >= e.van && e.richtwaarde <= e.tot)) throw new Error("ere: de richtwaarde moet binnen de bandbreedte liggen");
  if (e.tot > 1) throw new Error("ere: meer dan € 1 per kWh is onmogelijk (bedragen in euro per kWh)");
  const p = cfg.laadpaal.prijsInclBtw;
  if (!(p.van > 0 && p.van <= p.tot)) throw new Error("laadpaal: prijs 'van' moet tussen 0 en 'tot' liggen");
  for (const [waar, bronnen] of [["ere", cfg.ere.bronnen], ["laadpaal", cfg.laadpaal.bronnen]] as const) {
    if (!bronnen.length) throw new Error(`${waar}: minstens één bron`);
    for (const b of bronnen) if (b.datum > cfg.gecontroleerdOp) throw new Error(`${waar}: bron ${b.url} heeft een datum na gecontroleerdOp`);
  }
  return { gegenereerdOp: nu, gecontroleerdOp: cfg.gecontroleerdOp, valuta: "EUR", ere: cfg.ere, laadpaal: cfg.laadpaal };
}
