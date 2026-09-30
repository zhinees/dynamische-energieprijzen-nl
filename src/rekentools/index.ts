// Calculator adapters: fetch a supplier's tariffs from its own price calculator,
// using a fixed, public test address (never a private home).

import type { Testadres, Veld } from "../lib/typen.ts";
import { haalAnwb } from "./anwb.ts";
import { haalBudget } from "./budget.ts";
import { haalFrank } from "./frank.ts";
import { haalVandebron } from "./vandebron.ts";
import { haalVattenfall } from "./vattenfall.ts";
import { haalZonopnaam } from "./zonopnaam.ts";

export type { Testadres };

/** waarde as returned; waardeInclBtw when the API also states the incl.-btw amount. */
export type Rekentoolresultaat = Partial<Record<Veld, { waarde: number; inclBtw: boolean; waardeInclBtw?: number }>>;

type Haal = (adres?: Testadres) => Promise<Rekentoolresultaat>;

/** For calculators that price a specific address: fail clearly when the config has no test address. */
const metAdres =
  (haal: (adres: Testadres) => Promise<Rekentoolresultaat>): Haal =>
  async (adres) => {
    if (!adres) throw new Error("deze rekentool heeft een testadres nodig");
    return haal(adres);
  };

export const REKENTOOLS: Record<string, Haal> = {
  "frank-graphql": metAdres(haalFrank),
  "vandebron-api": metAdres(haalVandebron),
  "budget-api": metAdres(haalBudget),
  "anwb-api": metAdres(haalAnwb),
  "vattenfall-api": metAdres(haalVattenfall),
  // Monthly tariff sheet; no address needed.
  "zonopnaam-tarievenblad": () => haalZonopnaam(),
};
