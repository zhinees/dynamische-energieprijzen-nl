// Calculator adapters: fetch a supplier's tariffs from its own price calculator,
// using a fixed, public test address (never a private home).

import type { FieldKey } from "../lib/types.ts";
import { fetchFrank } from "./frank.ts";

export interface TestAddress {
  postcode: string; // "2584RZ"
  houseNumber: number;
  houseNumberAddition?: string;
  city: string;
  /** What this address is, e.g. "Madurodam, Den Haag". */
  label: string;
}

export type CalculatorResult = Partial<Record<FieldKey, { value: number; vatIncluded: boolean }>>;

export const CALCULATORS: Record<string, (addr: TestAddress) => Promise<CalculatorResult>> = {
  "frank-graphql": fetchFrank,
};
