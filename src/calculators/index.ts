// Calculator adapters: fetch a supplier's tariffs from its own price calculator,
// using a fixed, public test address (never a private home).

import type { FieldKey } from "../lib/types.ts";
import { fetchBudget } from "./budget.ts";
import { fetchFrank } from "./frank.ts";
import { fetchVandebron } from "./vandebron.ts";

export interface TestAddress {
  postcode: string; // "2584RZ"
  houseNumber: number;
  houseNumberAddition?: string;
  city: string;
  /** What this address is, e.g. "Madurodam, Den Haag". */
  label: string;
}

/** value as returned; valueInclVat when the API also states the incl.-btw amount. */
export type CalculatorResult = Partial<Record<FieldKey, { value: number; vatIncluded: boolean; valueInclVat?: number }>>;

export const CALCULATORS: Record<string, (addr: TestAddress) => Promise<CalculatorResult>> = {
  "frank-graphql": fetchFrank,
  "vandebron-api": fetchVandebron,
  "budget-api": fetchBudget,
};
