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

/** How an expense entered the ledger. Absent ⇒ treated as 'manual'. */
export type ExpenseSource = 'manual' | 'recurring' | 'captured';

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
  /** Day-of-month the item is due (1..31), used by the Bucket-1 auto-post scheduler. Absent ⇒ day 1. */
  dueDay?: number | null;
}

export interface Expense {
  id: number;
  amountMinor: number;
  category: ExpenseCategory;
  note: string | null;
  /**
   * How this expense was created. Absent ⇒ 'manual'. The budget spend sum EXCLUDES
   * 'recurring' (those are amortized fixed items auto-posted as records — Model A, R8),
   * and INCLUDES 'manual' and 'captured'.
   */
  source?: ExpenseSource;
  /** Idempotency key for auto-posted recurring items: `${fixedItemId}:${dueDateISO}`. Else null. */
  recurringKey?: string | null;
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
