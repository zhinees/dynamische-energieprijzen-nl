// Home battery purchase prices: hand-maintained ranges (thuisbatterijen/thuisbatterijen.json) → data/thuisbatterijen.json,
// with the price per kWh worked out and a few sanity checks.

export type Bereik = { van: number; tot: number };
export type BatterijType = "vast" | "stekker";

export type ThuisbatterijenConfig = {
  gecontroleerdOp: string;
  typen: Record<BatterijType, string>;
  prijzen: { type: BatterijType; capaciteitKwh: number; prijsInclBtw: Bereik; bron: string; bronDatum: string; notitie?: string }[];
  levensduur: { jaren: Bereik; garantie: string; bronnen: string[] };
  controlebronnen: { url: string; notitie: string }[];
};

export type ThuisbatterijenBestand = {
  gegenereerdOp: string;
  gecontroleerdOp: string;
  valuta: "EUR";
  typen: Record<BatterijType, string>;
  prijzen: (ThuisbatterijenConfig["prijzen"][number] & { prijsPerKwhInclBtw: Bereik })[];
  levensduur: ThuisbatterijenConfig["levensduur"];
  controlebronnen: ThuisbatterijenConfig["controlebronnen"];
};

export function bouwThuisbatterijen(cfg: ThuisbatterijenConfig, nu: string): ThuisbatterijenBestand {
  const per = new Map<BatterijType, { capaciteitKwh: number; prijsInclBtw: Bereik }[]>();
  for (const p of cfg.prijzen) {
    const waar = `${p.type} ${p.capaciteitKwh} kWh`;
    if (!(p.type in cfg.typen)) throw new Error(`${waar}: onbekend type`);
    if (!(p.capaciteitKwh > 0)) throw new Error(`${waar}: capaciteit moet groter dan 0 zijn`);
    if (!(p.prijsInclBtw.van > 0 && p.prijsInclBtw.van <= p.prijsInclBtw.tot)) throw new Error(`${waar}: prijs 'van' moet tussen 0 en 'tot' liggen`);
    if (p.bronDatum > cfg.gecontroleerdOp) throw new Error(`${waar}: bronDatum ligt na gecontroleerdOp`);
    per.set(p.type, [...(per.get(p.type) ?? []), p]);
  }
  // Within a type a bigger battery costs more in total (per kWh it may well be cheaper).
  for (const [type, lijst] of per) {
    const op = [...lijst].sort((a, b) => a.capaciteitKwh - b.capaciteitKwh);
    for (let i = 1; i < op.length; i++) {
      if (op[i].capaciteitKwh === op[i - 1].capaciteitKwh) throw new Error(`${type}: ${op[i].capaciteitKwh} kWh staat er twee keer in`);
      if (op[i].prijsInclBtw.van < op[i - 1].prijsInclBtw.van) throw new Error(`${type}: ${op[i].capaciteitKwh} kWh is goedkoper dan ${op[i - 1].capaciteitKwh} kWh`);
    }
  }
  if (!(cfg.levensduur.jaren.van > 0 && cfg.levensduur.jaren.van <= cfg.levensduur.jaren.tot)) throw new Error("levensduur: 'van' moet tussen 0 en 'tot' liggen");
  const perKwh = (v: number, kwh: number) => Math.round((v / kwh) * 100) / 100;
  return {
    gegenereerdOp: nu,
    gecontroleerdOp: cfg.gecontroleerdOp,
    valuta: "EUR",
    typen: cfg.typen,
    prijzen: [...cfg.prijzen]
      .sort((a, b) => a.type.localeCompare(b.type) || a.capaciteitKwh - b.capaciteitKwh)
      .map((p) => ({ ...p, prijsPerKwhInclBtw: { van: perKwh(p.prijsInclBtw.van, p.capaciteitKwh), tot: perKwh(p.prijsInclBtw.tot, p.capaciteitKwh) } })),
    levensduur: cfg.levensduur,
    controlebronnen: cfg.controlebronnen,
  };
}
