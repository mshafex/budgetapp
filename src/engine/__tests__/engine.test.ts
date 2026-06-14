import { computeBudget, resolveCycle } from '@/engine';
import type { BudgetInput, FixedItemForBudget } from '@/contracts';

/** A minimal valid input; individual tests override what they exercise. */
function makeInput(overrides: Partial<BudgetInput> = {}): BudgetInput {
  return {
    salaryMinor: 500000, // 5,000 AED
    fixedItems: [],
    spentThisCycleMinor: 0,
    survivalThresholdMinor: 5000, // 50 AED/day
    payDay: 1,
    today: '2026-06-14',
    ...overrides,
  };
}

describe('resolveCycle — cycle boundaries', () => {
  it('mid-cycle: cycleStart is the most recent pay date, end is the next', () => {
    const c = resolveCycle('2026-06-14', 1);
    expect(c.cycleStart).toBe('2026-06-01');
    expect(c.cycleEnd).toBe('2026-07-01');
    expect(c.daysLeft).toBe(17);
  });

  it('past pay-date rollover: pay not yet landed this month → previous month opened the cycle', () => {
    // payDay 15, today the 10th → this month's pay (the 15th) is in the future.
    const c = resolveCycle('2026-06-10', 15);
    expect(c.cycleStart).toBe('2026-05-15');
    expect(c.cycleEnd).toBe('2026-06-15');
    expect(c.daysLeft).toBe(5);
  });

  it('daysLeft clamps to >= 1 when today IS the pay day (full cycle ahead, not zero)', () => {
    // On pay day, that date opens the cycle; end is next month's pay date.
    const c = resolveCycle('2026-06-01', 1);
    expect(c.cycleStart).toBe('2026-06-01');
    expect(c.cycleEnd).toBe('2026-07-01');
    expect(c.daysLeft).toBe(30); // 30 days in June, never 0
    expect(c.daysLeft).toBeGreaterThanOrEqual(1);
  });

  it('daysLeft is never 0 even on the last day before pay day', () => {
    // Day before pay day: 1 calendar day to cycleEnd.
    const c = resolveCycle('2026-06-30', 1);
    expect(c.cycleStart).toBe('2026-06-01');
    expect(c.cycleEnd).toBe('2026-07-01');
    expect(c.daysLeft).toBe(1);
  });

  it('clamps payDay to month length: payDay 31 in February (non-leap)', () => {
    const c = resolveCycle('2026-02-20', 31);
    // Feb 2026 has 28 days; payDay 31 → Feb 28, which is still future on the 20th,
    // so the cycle opened on Jan 31.
    expect(c.cycleStart).toBe('2026-01-31');
    expect(c.cycleEnd).toBe('2026-02-28');
    expect(c.daysLeft).toBe(8);
  });

  it('clamps payDay to month length: payDay 31 across a leap-year February', () => {
    // 2024-02-29 IS the clamped pay day → opens the cycle; next pay date is Mar 31.
    const c = resolveCycle('2024-02-29', 31);
    expect(c.cycleStart).toBe('2024-02-29');
    expect(c.cycleEnd).toBe('2024-03-31');
    expect(c.daysLeft).toBe(31);
  });

  it('handles year rollover (December → January)', () => {
    const c = resolveCycle('2027-01-05', 15);
    expect(c.cycleStart).toBe('2026-12-15');
    expect(c.cycleEnd).toBe('2027-01-15');
    expect(c.daysLeft).toBe(10);
  });

  it('rejects malformed or impossible dates', () => {
    expect(() => resolveCycle('2026-13-01', 1)).toThrow();
    expect(() => resolveCycle('2026-02-30', 1)).toThrow();
    expect(() => resolveCycle('06/14/2026', 1)).toThrow();
  });

  it('rejects out-of-range payDay', () => {
    expect(() => resolveCycle('2026-06-14', 0)).toThrow();
    expect(() => resolveCycle('2026-06-14', 32)).toThrow();
    expect(() => resolveCycle('2026-06-14', 1.5)).toThrow();
  });
});

describe('computeBudget — amortization of each cycle kind (rounded UP)', () => {
  it('monthly is taken as-is (×1)', () => {
    const items: FixedItemForBudget[] = [{ amountMinor: 200000, cycle: 'monthly' }];
    const r = computeBudget(makeInput({ fixedItems: items }));
    // disposable = 500000 − 200000
    expect(r.disposableMinor).toBe(300000);
  });

  it('quarterly is ÷3 rounded up', () => {
    // 100000 / 3 = 33333.33 → ceil 33334
    const items: FixedItemForBudget[] = [{ amountMinor: 100000, cycle: 'quarterly' }];
    const r = computeBudget(makeInput({ fixedItems: items }));
    expect(r.disposableMinor).toBe(500000 - 33334);
  });

  it('yearly is ÷12 rounded up', () => {
    // 100000 / 12 = 8333.33 → ceil 8334
    const items: FixedItemForBudget[] = [{ amountMinor: 100000, cycle: 'yearly' }];
    const r = computeBudget(makeInput({ fixedItems: items }));
    expect(r.disposableMinor).toBe(500000 - 8334);
  });

  it('weekly is ×52 ÷12 rounded up', () => {
    // 10000 * 52 / 12 = 43333.33 → ceil 43334
    const items: FixedItemForBudget[] = [{ amountMinor: 10000, cycle: 'weekly' }];
    const r = computeBudget(makeInput({ fixedItems: items }));
    expect(r.disposableMinor).toBe(500000 - 43334);
  });

  it('sums multiple mixed-cadence fixed items', () => {
    const items: FixedItemForBudget[] = [
      { amountMinor: 150000, cycle: 'monthly' }, // 150000
      { amountMinor: 100000, cycle: 'quarterly' }, // ceil(33333.33)=33334
      { amountMinor: 120000, cycle: 'yearly' }, // ceil(10000)=10000
      { amountMinor: 10000, cycle: 'weekly' }, // ceil(43333.33)=43334
    ];
    const r = computeBudget(makeInput({ fixedItems: items }));
    const expectedFixed = 150000 + 33334 + 10000 + 43334;
    expect(r.disposableMinor).toBe(500000 - expectedFixed);
  });

  it('exact divisions need no rounding', () => {
    // 90000 / 3 = 30000 exactly; 120000 / 12 = 10000 exactly
    const items: FixedItemForBudget[] = [
      { amountMinor: 90000, cycle: 'quarterly' },
      { amountMinor: 120000, cycle: 'yearly' },
    ];
    const r = computeBudget(makeInput({ fixedItems: items }));
    expect(r.disposableMinor).toBe(500000 - 30000 - 10000);
  });
});

describe('computeBudget — zero fixed expenses', () => {
  it('disposable equals salary when there are no fixed items', () => {
    const r = computeBudget(makeInput({ fixedItems: [], salaryMinor: 500000 }));
    expect(r.disposableMinor).toBe(500000);
    // 500000 over 17 days → floor 29411
    expect(r.daysLeft).toBe(17);
    expect(r.dailyAllowanceMinor).toBe(Math.floor(500000 / 17));
  });
});

describe('computeBudget — daily allowance (floor, conservative)', () => {
  it('floors remaining / daysLeft (never overstates)', () => {
    // remaining 500000, daysLeft 17 → floor(29411.76) = 29411
    const r = computeBudget(makeInput());
    expect(r.remainingMinor).toBe(500000);
    expect(r.dailyAllowanceMinor).toBe(29411);
  });

  it('subtracts spentThisCycle from remaining', () => {
    const r = computeBudget(makeInput({ spentThisCycleMinor: 100000 }));
    expect(r.remainingMinor).toBe(400000);
    expect(r.dailyAllowanceMinor).toBe(Math.floor(400000 / 17));
  });

  it('adds carryover (positive) to remaining', () => {
    const r = computeBudget(makeInput({ carryoverMinor: 50000 }));
    expect(r.remainingMinor).toBe(550000);
  });

  it('adds carryover (negative) to remaining', () => {
    const r = computeBudget(makeInput({ carryoverMinor: -50000 }));
    expect(r.remainingMinor).toBe(450000);
  });

  it('defaults carryover to 0 when omitted', () => {
    const r = computeBudget(makeInput()); // no carryoverMinor
    expect(r.remainingMinor).toBe(500000);
  });
});

describe('computeBudget — negative remaining → allowance 0 AND survival true', () => {
  it('overspent: remaining negative, allowance pinned to 0, survival true', () => {
    const r = computeBudget(
      makeInput({ salaryMinor: 200000, spentThisCycleMinor: 250000 }),
    );
    expect(r.remainingMinor).toBe(-50000);
    expect(r.dailyAllowanceMinor).toBe(0);
    expect(r.survival).toBe(true);
  });

  it('exactly zero remaining → allowance 0, survival true (0 < threshold)', () => {
    const r = computeBudget(
      makeInput({ salaryMinor: 200000, spentThisCycleMinor: 200000 }),
    );
    expect(r.remainingMinor).toBe(0);
    expect(r.dailyAllowanceMinor).toBe(0);
    expect(r.survival).toBe(true);
  });

  it('fixed costs alone can drive disposable (and remaining) negative', () => {
    const items: FixedItemForBudget[] = [{ amountMinor: 600000, cycle: 'monthly' }];
    const r = computeBudget(makeInput({ salaryMinor: 500000, fixedItems: items }));
    expect(r.disposableMinor).toBe(-100000);
    expect(r.remainingMinor).toBe(-100000);
    expect(r.dailyAllowanceMinor).toBe(0);
    expect(r.survival).toBe(true);
  });
});

describe('computeBudget — survival-threshold boundary', () => {
  it('allowance exactly AT the threshold is NOT survival (strict <)', () => {
    // Want dailyAllowance == 10000 exactly: remaining 100000 over 10 days.
    // payDay 1, today 2026-06-21 → cycleEnd 2026-07-01 → 10 days left.
    const r = computeBudget(
      makeInput({
        salaryMinor: 100000,
        today: '2026-06-21',
        survivalThresholdMinor: 10000,
      }),
    );
    expect(r.daysLeft).toBe(10);
    expect(r.dailyAllowanceMinor).toBe(10000);
    expect(r.survival).toBe(false);
  });

  it('allowance one fil BELOW the threshold IS survival', () => {
    const r = computeBudget(
      makeInput({
        salaryMinor: 100000,
        today: '2026-06-21',
        survivalThresholdMinor: 10001,
      }),
    );
    expect(r.dailyAllowanceMinor).toBe(10000);
    expect(r.survival).toBe(true);
  });

  it('allowance one fil ABOVE the threshold is NOT survival', () => {
    const r = computeBudget(
      makeInput({
        salaryMinor: 100000,
        today: '2026-06-21',
        survivalThresholdMinor: 9999,
      }),
    );
    expect(r.dailyAllowanceMinor).toBe(10000);
    expect(r.survival).toBe(false);
  });
});

describe('computeBudget — mid-cycle first install (carryover 0, partial spend)', () => {
  it('a fresh user partway through the cycle gets a sane number', () => {
    // First time opening the app on the 14th, 5,000 salary, one 1,200 rent (monthly),
    // already spent 300 this cycle, no carryover yet (deferred).
    const items: FixedItemForBudget[] = [{ amountMinor: 120000, cycle: 'monthly' }];
    const r = computeBudget(
      makeInput({
        salaryMinor: 500000,
        fixedItems: items,
        spentThisCycleMinor: 30000,
        today: '2026-06-14',
        payDay: 1,
      }),
    );
    expect(r.cycleStart).toBe('2026-06-01');
    expect(r.cycleEnd).toBe('2026-07-01');
    expect(r.daysLeft).toBe(17);
    expect(r.disposableMinor).toBe(380000); // 500000 − 120000
    expect(r.remainingMinor).toBe(350000); // 380000 − 30000
    expect(r.dailyAllowanceMinor).toBe(Math.floor(350000 / 17)); // 20588
    expect(r.survival).toBe(false);
  });
});

describe('computeBudget — purity', () => {
  it('is deterministic for the same input (no ambient clock / I/O)', () => {
    const input = makeInput({ spentThisCycleMinor: 42000 });
    const a = computeBudget(input);
    const b = computeBudget(input);
    expect(a).toEqual(b);
  });

  it('does not mutate its input (fixedItems untouched)', () => {
    const items: FixedItemForBudget[] = [{ amountMinor: 100000, cycle: 'quarterly' }];
    const input = makeInput({ fixedItems: items });
    const snapshot = JSON.stringify(input);
    computeBudget(input);
    expect(JSON.stringify(input)).toBe(snapshot);
  });
});

describe('computeBudget — no float drift on large balances', () => {
  it('high salary + many fixed items stays integer-exact', () => {
    // 8,000 AED salary; allowance must equal the exact integer floor.
    const items: FixedItemForBudget[] = [
      { amountMinor: 250000, cycle: 'monthly' },
      { amountMinor: 99991, cycle: 'weekly' }, // ×52 ÷12 ceil
    ];
    const r = computeBudget(
      makeInput({ salaryMinor: 800000, fixedItems: items, today: '2026-06-14' }),
    );
    const weeklyMonthly = Math.ceil((99991 * 52) / 12);
    const disposable = 800000 - 250000 - weeklyMonthly;
    expect(r.disposableMinor).toBe(disposable);
    expect(r.dailyAllowanceMinor).toBe(Math.floor(disposable / 17));
  });
});
