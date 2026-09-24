// Calculator adapters: fetch a supplier's tariffs from its own price calculator,
// using a fixed, public test address (never a private home).

import type { Testadres, Veld } from "../lib/typen.ts";
import { haalBudget } from "./budget.ts";
import { haalFrank } from "./frank.ts";
import { haalVandebron } from "./vandebron.ts";

export type { Testadres };

/** waarde as returned; waardeInclBtw when the API also states the incl.-btw amount. */
export type Rekentoolresultaat = Partial<Record<Veld, { waarde: number; inclBtw: boolean; waardeInclBtw?: number }>>;

export const REKENTOOLS: Record<string, (adres: Testadres) => Promise<Rekentoolresultaat>> = {
  "frank-graphql": haalFrank,
  "vandebron-api": haalVandebron,
  "budget-api": haalBudget,
};
