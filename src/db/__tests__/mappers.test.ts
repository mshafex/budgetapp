/**
 * Unit tests for the PURE data-layer logic (`src/db/mappers.ts`).
 *
 * Native expo-sqlite is unavailable under jest, so we test only the side-effect-free
 * row<->domain mappers, insert-shapers, and helpers here. Real DB I/O is verified later
 * at integration (Phase 4) in the running app. These functions are the ones that could
 * silently corrupt money/shape data, so they get full coverage (R3).
 */
import type {
  Cycle,
  Expense,
  ExpenseInput,
  FixedItem,
  FixedItemInput,
  User,
  UserInput,
} from '@/contracts';
import type {
  CycleRow,
  ExpenseRow,
  FixedItemRow,
  UserRow,
} from '../schema';
import {
  applyUserPatch,
  cycleToInsert,
  expenseToInsert,
  fixedItemToInsert,
  rowToCycle,
  rowToExpense,
  rowToFixedItem,
  rowToUser,
  sourceCountsTowardSpend,
  sumAmountsMinor,
  sumSpendableMinor,
  userToInsert,
} from '../mappers';

/* ------------------------------------------------------------------ */
/* Fixtures                                                            */
/* ------------------------------------------------------------------ */

const userRow: UserRow = {
  id: 1,
  salaryMinor: 500000, // 5,000 AED in fils
  payDay: 25,
  currency: 'AED',
  locale: 'ar',
  survivalThresholdMinor: 3000,
};

const fixedItemRow: FixedItemRow = {
  id: 7,
  label: 'Rent',
  amountMinor: 200000,
  type: 'rent',
  cycle: 'monthly',
  dueDay: 1,
};

const expenseRow: ExpenseRow = {
  id: 42,
  amountMinor: 1550,
  category: 'food',
  note: 'lunch',
  source: 'manual',
  recurringKey: null,
  createdAt: '2026-06-14T09:30:00.000Z',
};

const cycleRow: CycleRow = {
  id: 3,
  startDate: '2026-05-25',
  payDate: '2026-06-25',
  carryoverMinor: -1200,
};

/* ------------------------------------------------------------------ */
/* rowTo* mappers                                                      */
/* ------------------------------------------------------------------ */

describe('rowToUser', () => {
  it('maps every column to the User domain shape', () => {
    const user: User = rowToUser(userRow);
    expect(user).toEqual({
      id: 1,
      salaryMinor: 500000,
      payDay: 25,
      currency: 'AED',
      locale: 'ar',
      survivalThresholdMinor: 3000,
    });
  });

  it('preserves integer fils exactly (no float coercion)', () => {
    const user = rowToUser({ ...userRow, salaryMinor: 799999 });
    expect(user.salaryMinor).toBe(799999);
    expect(Number.isInteger(user.salaryMinor)).toBe(true);
  });
});

describe('rowToFixedItem', () => {
  it('maps every column to the FixedItem domain shape', () => {
    const item: FixedItem = rowToFixedItem(fixedItemRow);
    expect(item).toEqual({
      id: 7,
      label: 'Rent',
      amountMinor: 200000,
      type: 'rent',
      cycle: 'monthly',
      dueDay: 1,
    });
  });

  it('carries the remittance tracking type through unchanged (R6: label only)', () => {
    const item = rowToFixedItem({
      ...fixedItemRow,
      type: 'remittance',
      label: 'Family transfer',
    });
    expect(item.type).toBe('remittance');
  });

  it('round-trips a non-default dueDay', () => {
    const item = rowToFixedItem({ ...fixedItemRow, dueDay: 25 });
    expect(item.dueDay).toBe(25);
  });

  it('normalizes a null dueDay to null (scheduler then defaults to day 1)', () => {
    const item = rowToFixedItem({ ...fixedItemRow, dueDay: null });
    expect(item.dueDay).toBeNull();
  });
});

describe('rowToExpense', () => {
  it('maps every column to the Expense domain shape', () => {
    const expense: Expense = rowToExpense(expenseRow);
    expect(expense).toEqual({
      id: 42,
      amountMinor: 1550,
      category: 'food',
      note: 'lunch',
      source: 'manual',
      recurringKey: null,
      createdAt: '2026-06-14T09:30:00.000Z',
    });
  });

  it('normalizes a null note to null', () => {
    const expense = rowToExpense({ ...expenseRow, note: null });
    expect(expense.note).toBeNull();
  });

  it('round-trips a recurring source + recurringKey', () => {
    const expense = rowToExpense({
      ...expenseRow,
      source: 'recurring',
      recurringKey: '7:2026-06-01',
    });
    expect(expense.source).toBe('recurring');
    expect(expense.recurringKey).toBe('7:2026-06-01');
  });

  it('round-trips a captured source', () => {
    const expense = rowToExpense({ ...expenseRow, source: 'captured' });
    expect(expense.source).toBe('captured');
  });

  it('treats a legacy null source as manual (column added by migration)', () => {
    // A row written before the `source` column existed reads back null.
    const expense = rowToExpense({
      ...expenseRow,
      source: null as unknown as ExpenseRow['source'],
    });
    expect(expense.source).toBe('manual');
  });
});

describe('rowToCycle', () => {
  it('maps every column to the Cycle domain shape', () => {
    const cycle: Cycle = rowToCycle(cycleRow);
    expect(cycle).toEqual({
      id: 3,
      startDate: '2026-05-25',
      payDate: '2026-06-25',
      carryoverMinor: -1200,
    });
  });

  it('preserves a negative carryover (leftover can be negative)', () => {
    const cycle = rowToCycle({ ...cycleRow, carryoverMinor: -50000 });
    expect(cycle.carryoverMinor).toBe(-50000);
  });
});

/* ------------------------------------------------------------------ */
/* Insert-shapers                                                      */
/* ------------------------------------------------------------------ */

describe('userToInsert', () => {
  it('drops nothing and omits id (autoincrement)', () => {
    const input: UserInput = {
      salaryMinor: 600000,
      payDay: 1,
      currency: 'AED',
      locale: 'en',
      survivalThresholdMinor: 2500,
    };
    const insert = userToInsert(input);
    expect(insert).toEqual(input);
    expect(insert).not.toHaveProperty('id');
  });
});

describe('fixedItemToInsert', () => {
  it('maps the input and omits id', () => {
    const input: FixedItemInput = {
      label: 'Car loan',
      amountMinor: 90000,
      type: 'loan',
      cycle: 'monthly',
      dueDay: 10,
    };
    const insert = fixedItemToInsert(input);
    expect(insert).toEqual(input);
    expect(insert).not.toHaveProperty('id');
  });

  it('defaults an absent dueDay to null', () => {
    const input: FixedItemInput = {
      label: 'Rent',
      amountMinor: 200000,
      type: 'rent',
      cycle: 'monthly',
    };
    const insert = fixedItemToInsert(input);
    expect(insert.dueDay).toBeNull();
  });
});

describe('expenseToInsert', () => {
  it('uses the provided createdAt when present', () => {
    const input: ExpenseInput = {
      amountMinor: 2500,
      category: 'transport',
      note: 'taxi',
      createdAt: '2026-01-02T03:04:05.000Z',
    };
    const insert = expenseToInsert(input, '2099-12-31T00:00:00.000Z');
    expect(insert.createdAt).toBe('2026-01-02T03:04:05.000Z');
    expect(insert.note).toBe('taxi');
    expect(insert.amountMinor).toBe(2500);
    expect(insert.category).toBe('transport');
  });

  it('falls back to the injected nowISO when createdAt is omitted', () => {
    const input: ExpenseInput = { amountMinor: 800, category: 'food', note: null };
    const insert = expenseToInsert(input, '2026-06-14T12:00:00.000Z');
    expect(insert.createdAt).toBe('2026-06-14T12:00:00.000Z');
  });

  it('passes a null note through as null', () => {
    const input: ExpenseInput = { amountMinor: 800, category: 'food', note: null };
    const insert = expenseToInsert(input, '2026-06-14T12:00:00.000Z');
    expect(insert.note).toBeNull();
  });

  it('defaults source to manual and recurringKey to null when absent (Model A)', () => {
    const input: ExpenseInput = { amountMinor: 800, category: 'food', note: null };
    const insert = expenseToInsert(input, '2026-06-14T12:00:00.000Z');
    expect(insert.source).toBe('manual');
    expect(insert.recurringKey).toBeNull();
  });

  it('persists an explicit recurring source + recurringKey (auto-post path)', () => {
    const input: ExpenseInput = {
      amountMinor: 200000,
      category: 'bills',
      note: 'Rent',
      source: 'recurring',
      recurringKey: '1:2026-06-01',
      createdAt: '2026-06-01',
    };
    const insert = expenseToInsert(input);
    expect(insert.source).toBe('recurring');
    expect(insert.recurringKey).toBe('1:2026-06-01');
    expect(insert.createdAt).toBe('2026-06-01');
  });

  it('produces a valid ISO timestamp when no nowISO is supplied', () => {
    const input: ExpenseInput = { amountMinor: 1, category: 'other', note: null };
    const before = Date.now();
    const insert = expenseToInsert(input);
    const after = Date.now();
    const ts = Date.parse(insert.createdAt as string);
    expect(Number.isNaN(ts)).toBe(false);
    expect(ts).toBeGreaterThanOrEqual(before);
    expect(ts).toBeLessThanOrEqual(after);
  });
});

describe('cycleToInsert', () => {
  it('maps the cycle fields and omits id', () => {
    const cycle: Omit<Cycle, 'id'> = {
      startDate: '2026-06-25',
      payDate: '2026-07-25',
      carryoverMinor: 0,
    };
    const insert = cycleToInsert(cycle);
    expect(insert).toEqual(cycle);
    expect(insert).not.toHaveProperty('id');
  });
});

/* ------------------------------------------------------------------ */
/* applyUserPatch                                                      */
/* ------------------------------------------------------------------ */

describe('applyUserPatch', () => {
  const current: User = {
    id: 1,
    salaryMinor: 500000,
    payDay: 25,
    currency: 'AED',
    locale: 'en',
    survivalThresholdMinor: 3000,
  };

  it('returns the current values unchanged for an empty patch (and omits id)', () => {
    const out = applyUserPatch(current, {});
    expect(out).toEqual({
      salaryMinor: 500000,
      payDay: 25,
      currency: 'AED',
      locale: 'en',
      survivalThresholdMinor: 3000,
    });
    expect(out).not.toHaveProperty('id');
  });

  it('overrides only the patched fields', () => {
    const out = applyUserPatch(current, { salaryMinor: 650000, locale: 'ar' });
    expect(out.salaryMinor).toBe(650000);
    expect(out.locale).toBe('ar');
    // untouched
    expect(out.payDay).toBe(25);
    expect(out.currency).toBe('AED');
    expect(out.survivalThresholdMinor).toBe(3000);
  });

  it('applies a zero override rather than treating it as absent', () => {
    const out = applyUserPatch(current, { survivalThresholdMinor: 0 });
    expect(out.survivalThresholdMinor).toBe(0);
  });
});

/* ------------------------------------------------------------------ */
/* sumAmountsMinor                                                     */
/* ------------------------------------------------------------------ */

describe('sumAmountsMinor', () => {
  it('returns 0 for an empty list', () => {
    expect(sumAmountsMinor([])).toBe(0);
  });

  it('returns the single value for a one-element list', () => {
    expect(sumAmountsMinor([1550])).toBe(1550);
  });

  it('sums multiple integer fils amounts', () => {
    expect(sumAmountsMinor([1550, 2500, 800, 12000])).toBe(16850);
  });

  it('keeps the result an exact integer (no float drift)', () => {
    const out = sumAmountsMinor([10, 20, 30]);
    expect(out).toBe(60);
    expect(Number.isInteger(out)).toBe(true);
  });

  it('handles negative amounts (e.g. a negative carryover contribution)', () => {
    expect(sumAmountsMinor([5000, -1200, 300])).toBe(4100);
  });
});

/* ------------------------------------------------------------------ */
/* sourceCountsTowardSpend  (Model A spend-sum exclusion rule)         */
/* ------------------------------------------------------------------ */

describe('sourceCountsTowardSpend', () => {
  it('excludes recurring (amortized fixed items are already in disposable)', () => {
    expect(sourceCountsTowardSpend('recurring')).toBe(false);
  });

  it('includes manual and captured', () => {
    expect(sourceCountsTowardSpend('manual')).toBe(true);
    expect(sourceCountsTowardSpend('captured')).toBe(true);
  });

  it('treats null/undefined (legacy row) as manual → counts', () => {
    expect(sourceCountsTowardSpend(null)).toBe(true);
    expect(sourceCountsTowardSpend(undefined)).toBe(true);
  });
});

/* ------------------------------------------------------------------ */
/* sumSpendableMinor                                                   */
/* ------------------------------------------------------------------ */

describe('sumSpendableMinor', () => {
  it('excludes recurring rows but includes manual and captured', () => {
    const total = sumSpendableMinor([
      { amountMinor: 1550, source: 'manual' }, // counts
      { amountMinor: 2500, source: 'captured' }, // counts
      { amountMinor: 200000, source: 'recurring' }, // EXCLUDED (rent auto-post)
      { amountMinor: 800, source: 'manual' }, // counts
    ]);
    expect(total).toBe(1550 + 2500 + 800);
  });

  it('counts a legacy null source as spend (manual)', () => {
    const total = sumSpendableMinor([
      { amountMinor: 1000, source: null },
      { amountMinor: 200000, source: 'recurring' },
    ]);
    expect(total).toBe(1000);
  });

  it('returns 0 for an all-recurring set', () => {
    const total = sumSpendableMinor([
      { amountMinor: 200000, source: 'recurring' },
      { amountMinor: 50000, source: 'recurring' },
    ]);
    expect(total).toBe(0);
  });

  it('returns 0 for an empty list and keeps the result an exact integer', () => {
    const out = sumSpendableMinor([]);
    expect(out).toBe(0);
    expect(Number.isInteger(out)).toBe(true);
  });
});
