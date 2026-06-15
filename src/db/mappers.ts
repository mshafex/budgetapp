/**
 * PURE mapping + helper logic for the data layer.
 *
 * Everything here is side-effect-free and free of native imports, so it is unit-tested
 * directly under jest (the expo-sqlite native module is unavailable there). Row<->domain
 * mappers, insert-shapers, and the timestamp/range helpers all live here; the repository
 * composes them around the (native) drizzle handle.
 *
 * R3: amounts cross this boundary as integer fils and are never coerced to float.
 */
import type {
  Cycle,
  Expense,
  ExpenseInput,
  ExpenseSource,
  FixedItem,
  FixedItemInput,
  User,
  UserInput,
} from '@/contracts';
import type {
  CycleInsert,
  CycleRow,
  ExpenseInsert,
  ExpenseRow,
  FixedItemInsert,
  FixedItemRow,
  UserInsert,
  UserRow,
} from './schema';

/* ------------------------------------------------------------------ *
 * Row -> domain
 * ------------------------------------------------------------------ */

export function rowToUser(row: UserRow): User {
  return {
    id: row.id,
    salaryMinor: row.salaryMinor,
    payDay: row.payDay,
    currency: row.currency,
    locale: row.locale,
    survivalThresholdMinor: row.survivalThresholdMinor,
  };
}

export function rowToFixedItem(row: FixedItemRow): FixedItem {
  return {
    id: row.id,
    label: row.label,
    amountMinor: row.amountMinor,
    type: row.type,
    cycle: row.cycle,
    // Nullable; absent ⇒ the Bucket-1 scheduler defaults to day 1.
    dueDay: row.dueDay ?? null,
  };
}

export function rowToExpense(row: ExpenseRow): Expense {
  return {
    id: row.id,
    amountMinor: row.amountMinor,
    category: row.category,
    note: row.note ?? null,
    // A legacy row written before the column existed reads back null → treat as 'manual'.
    source: row.source ?? 'manual',
    recurringKey: row.recurringKey ?? null,
    createdAt: row.createdAt,
  };
}

export function rowToCycle(row: CycleRow): Cycle {
  return {
    id: row.id,
    startDate: row.startDate,
    payDate: row.payDate,
    carryoverMinor: row.carryoverMinor,
  };
}

/* ------------------------------------------------------------------ *
 * Domain input -> insert row (the inverse shapers)
 * ------------------------------------------------------------------ */

export function userToInsert(input: UserInput): UserInsert {
  return {
    salaryMinor: input.salaryMinor,
    payDay: input.payDay,
    currency: input.currency,
    locale: input.locale,
    survivalThresholdMinor: input.survivalThresholdMinor,
  };
}

export function fixedItemToInsert(input: FixedItemInput): FixedItemInsert {
  return {
    label: input.label,
    amountMinor: input.amountMinor,
    type: input.type,
    cycle: input.cycle,
    // Nullable; absent stays absent (scheduler defaults to day 1 when reading it back).
    dueDay: input.dueDay ?? null,
  };
}

/**
 * Shape an expense for insert. `createdAt` is optional on the contract input;
 * `nowISO` supplies the default so the timestamp source stays injectable/testable.
 * `source` defaults to 'manual' (Model A); `recurringKey` is null unless an auto-posted
 * recurring item supplies one.
 */
export function expenseToInsert(
  input: ExpenseInput,
  nowISO: string = new Date().toISOString(),
): ExpenseInsert {
  return {
    amountMinor: input.amountMinor,
    category: input.category,
    note: input.note ?? null,
    source: input.source ?? 'manual',
    recurringKey: input.recurringKey ?? null,
    createdAt: input.createdAt ?? nowISO,
  };
}

export function cycleToInsert(cycle: Omit<Cycle, 'id'>): CycleInsert {
  return {
    startDate: cycle.startDate,
    payDate: cycle.payDate,
    carryoverMinor: cycle.carryoverMinor,
  };
}

/* ------------------------------------------------------------------ *
 * Misc pure helpers
 * ------------------------------------------------------------------ */

/**
 * Merge a partial user patch over an existing row's insert shape.
 * Used by `updateUser`: read current row -> apply patch -> write full row, so the
 * single-row profile never ends up with undefined columns.
 */
export function applyUserPatch(
  current: User,
  patch: Partial<UserInput>,
): UserInsert {
  return {
    salaryMinor: patch.salaryMinor ?? current.salaryMinor,
    payDay: patch.payDay ?? current.payDay,
    currency: patch.currency ?? current.currency,
    locale: patch.locale ?? current.locale,
    survivalThresholdMinor:
      patch.survivalThresholdMinor ?? current.survivalThresholdMinor,
  };
}

/**
 * Sum a list of expense amounts (fils). Integer-only addition (R3): no float drift.
 * Centralized so `sumExpensesMinor` can be exercised without a live DB.
 */
export function sumAmountsMinor(amounts: readonly number[]): number {
  let total = 0;
  for (const a of amounts) total += a;
  return total;
}

/**
 * Whether an expense `source` counts toward the budget's "spent this cycle" total.
 *
 * Model A (R8): 'recurring' postings are amortized fixed items recorded as history — they
 * are ALREADY reflected in `disposable`, so counting them here would double-charge. A null
 * source (legacy row written before the column existed) is treated as 'manual' and counts.
 * The repository's `sumExpensesMinor` is the single caller; this is the one place the rule
 * lives so it can be unit-tested without a live DB.
 */
export function sourceCountsTowardSpend(source: ExpenseSource | null | undefined): boolean {
  return (source ?? 'manual') !== 'recurring';
}

/**
 * Sum the spendable expense amounts (fils) from `{ amountMinor, source }` rows, EXCLUDING
 * `source = 'recurring'` (Model A). Integer-only (R3). Pure, so the exclusion semantics are
 * testable without the native DB.
 */
export function sumSpendableMinor(
  rows: readonly { amountMinor: number; source: ExpenseSource | null }[],
): number {
  let total = 0;
  for (const row of rows) {
    if (sourceCountsTowardSpend(row.source)) total += row.amountMinor;
  }
  return total;
}
