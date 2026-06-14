/**
 * CONTRACT — domain entities. Frozen in Phase 1.
 * DATA (Drizzle schema in `src/db`) must produce/accept these shapes.
 * All money lives in `*Minor` fields as integer fils (R3).
 */

export type FixedItemType = 'rent' | 'loan' | 'remittance' | 'bill' | 'other';

/**
 * Billing cadence of a fixed item. The engine normalizes every cadence to a
 * per-pay-cycle (monthly) amount.
 *
 * R6: `remittance` is a TRACKING category only — the app never moves money.
 */
export type CycleKind = 'weekly' | 'monthly' | 'quarterly' | 'yearly';

export type ExpenseCategory =
  | 'food'
  | 'transport'
  | 'bills'
  | 'shopping'
  | 'health'
  | 'family'
  | 'other';

export interface User {
  id: number;
  /** Monthly salary, fils. */
  salaryMinor: number;
  /** Day of month pay lands, 1..31 (clamped to month length by the engine). */
  payDay: number;
  /** ISO currency code; default 'AED'. */
  currency: string;
  locale: 'en' | 'ar';
  /** Daily allowance below this triggers survival mode, fils. */
  survivalThresholdMinor: number;
}

export interface FixedItem {
  id: number;
  label: string;
  /** Amount per its own `cycle`, fils. */
  amountMinor: number;
  type: FixedItemType;
  cycle: CycleKind;
}

export interface Expense {
  id: number;
  amountMinor: number;
  category: ExpenseCategory;
  note: string | null;
  /** ISO 8601 timestamp. */
  createdAt: string;
}

export interface Cycle {
  id: number;
  /** ISO date 'YYYY-MM-DD' — pay date that opened this cycle. */
  startDate: string;
  /** ISO date 'YYYY-MM-DD' — next pay date (cycle end, exclusive). */
  payDate: string;
  /** Leftover (may be negative) carried from the previous cycle, fils. */
  carryoverMinor: number;
}

/** Insert shapes (id and derived fields omitted). */
export type UserInput = Omit<User, 'id'>;
export type FixedItemInput = Omit<FixedItem, 'id'>;
export type ExpenseInput = Omit<Expense, 'id' | 'createdAt'> & { createdAt?: string };
