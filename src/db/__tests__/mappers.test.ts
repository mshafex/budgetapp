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
  sumAmountsMinor,
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
};

const expenseRow: ExpenseRow = {
  id: 42,
  amountMinor: 1550,
  category: 'food',
  note: 'lunch',
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
});

describe('rowToExpense', () => {
  it('maps every column to the Expense domain shape', () => {
    const expense: Expense = rowToExpense(expenseRow);
    expect(expense).toEqual({
      id: 42,
      amountMinor: 1550,
      category: 'food',
      note: 'lunch',
      createdAt: '2026-06-14T09:30:00.000Z',
    });
  });

  it('normalizes a null note to null', () => {
    const expense = rowToExpense({ ...expenseRow, note: null });
    expect(expense.note).toBeNull();
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
    };
    const insert = fixedItemToInsert(input);
    expect(insert).toEqual(input);
    expect(insert).not.toHaveProperty('id');
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
