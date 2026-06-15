/**
 * CONTRACT — recurring auto-post (Bucket 1). Frozen. Implemented by C1 in `src/engine`.
 *
 * Model A (decided 2026-06-15): recurring fixed items stay AMORTIZED in the budget; the
 * scheduler posts them as dated EXPENSE records tagged `source: 'recurring'`, which the spend
 * sum EXCLUDES so they never double-count. Pure (no clock/I/O — `today` is injected),
 * idempotent via `recurringKey`. No user confirm (items are user-authored once).
 */
import type { ExpenseInput, FixedItem } from './entities';

/** Stable idempotency key for one posting: `${fixedItemId}:${dueDateISO}`. */
export type RecurringKey = string;

export interface RecurringPostingInput {
  /** Recurring fixed items to consider (rent, loan, remittance, bill, other). */
  fixedItems: FixedItem[];
  /** ISO 'YYYY-MM-DD' — today (injected). */
  today: string;
  /** Current cycle bounds, from `resolveCycle`. */
  cycleStart: string;
  cycleEnd: string;
  /** recurringKeys already posted — for idempotency (re-running posts nothing new). */
  postedKeys: readonly string[];
}

/**
 * Pure: the ExpenseInputs to post for recurring items whose due date falls in
 * [cycleStart, min(today, cycleEnd)] and aren't already in `postedKeys`. Each result carries
 * `source: 'recurring'` and its `recurringKey`. Backfills past-due within the cycle.
 */
export type ComputeDuePostings = (input: RecurringPostingInput) => ExpenseInput[];

/** Build the idempotency key for a recurring item + due date. */
export type MakeRecurringKey = (fixedItemId: number, dueDateISO: string) => RecurringKey;
