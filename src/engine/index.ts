/**
 * Budget engine — the product's core, answering "how much can I safely spend today?".
 *
 * Implements the frozen `ComputeBudget` + `ResolveCycle` contract (`@/contracts/budget`)
 * per the v1 semantics in CONTRACTS.md §Engine semantics.
 *
 * PURE: no I/O, no `Date.now()`, no ambient clock. `today` is always injected as
 * a `'YYYY-MM-DD'` string and parsed as UTC. All money math is integer fils via the
 * Money helper (R3) — no floats touch a balance.
 */
import type {
  BudgetInput,
  BudgetResult,
  ComputeBudget,
  CycleDates,
  CycleKind,
  FixedItemForBudget,
  ResolveCycle,
} from '@/contracts';
import { Money } from '@/money';

const MS_PER_DAY = 24 * 60 * 60 * 1000;
const ISO_DATE = /^(\d{4})-(\d{2})-(\d{2})$/;

interface YMD {
  year: number;
  /** 1..12 */
  month: number;
  /** 1..31 */
  day: number;
}

/** Parse a 'YYYY-MM-DD' string into calendar parts, validating it is a real UTC date. */
function parseIsoDate(value: string): YMD {
  const match = ISO_DATE.exec(value);
  if (!match) {
    throw new Error(`Expected date 'YYYY-MM-DD', received: ${String(value)}`);
  }
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  // Round-trip through a UTC Date to reject impossible dates like 2026-02-30.
  const utc = Date.UTC(year, month - 1, day);
  const d = new Date(utc);
  if (
    d.getUTCFullYear() !== year ||
    d.getUTCMonth() !== month - 1 ||
    d.getUTCDate() !== day
  ) {
    throw new Error(`Invalid calendar date: ${value}`);
  }
  return { year, month, day };
}

function formatIsoDate({ year, month, day }: YMD): string {
  const mm = String(month).padStart(2, '0');
  const dd = String(day).padStart(2, '0');
  return `${year}-${mm}-${dd}`;
}

/** Number of days in a given month (month is 1..12). */
function daysInMonth(year: number, month: number): number {
  // Day 0 of the next month is the last day of `month`.
  return new Date(Date.UTC(year, month, 0)).getUTCDate();
}

/** Validate a 1..31 day-of-month pay day. */
function assertPayDay(payDay: number): void {
  if (!Number.isInteger(payDay) || payDay < 1 || payDay > 31) {
    throw new Error(`payDay must be an integer 1..31, received: ${String(payDay)}`);
  }
}

/** The actual pay date in a given month, clamping payDay to the month length. */
function payDateForMonth(year: number, month: number, payDay: number): YMD {
  const clampedDay = Math.min(payDay, daysInMonth(year, month));
  return { year, month, day: clampedDay };
}

/** Step a (year, month) pair by ±1 month, rolling the year over. */
function shiftMonth(year: number, month: number, delta: number): { year: number; month: number } {
  // month is 1..12; convert to a 0-based absolute month index, shift, convert back.
  const zeroBased = (year * 12 + (month - 1)) + delta;
  return { year: Math.floor(zeroBased / 12), month: (zeroBased % 12) + 1 };
}

function toUtcMillis({ year, month, day }: YMD): number {
  return Date.UTC(year, month - 1, day);
}

function compareYMD(a: YMD, b: YMD): number {
  return toUtcMillis(a) - toUtcMillis(b);
}

/**
 * Resolve the pay cycle containing `today`.
 *  - cycleStart = most recent pay date <= today.
 *  - cycleEnd   = next pay date strictly after cycleStart (exclusive).
 *  - daysLeft   = whole calendar days from today to cycleEnd, clamped to >= 1.
 */
export const resolveCycle: ResolveCycle = (today: string, payDay: number): CycleDates => {
  assertPayDay(payDay);
  const todayYMD = parseIsoDate(today);

  // Pay date in today's own month (payDay clamped to that month's length).
  const thisMonthPay = payDateForMonth(todayYMD.year, todayYMD.month, payDay);

  let cycleStart: YMD;
  if (compareYMD(thisMonthPay, todayYMD) <= 0) {
    // This month's pay date already happened (or is today) → it opened the cycle.
    cycleStart = thisMonthPay;
  } else {
    // Pay hasn't landed yet this month → the previous month's pay date opened it.
    const prev = shiftMonth(todayYMD.year, todayYMD.month, -1);
    cycleStart = payDateForMonth(prev.year, prev.month, payDay);
  }

  // Cycle end = pay date of the month following cycleStart's month.
  const next = shiftMonth(cycleStart.year, cycleStart.month, 1);
  const cycleEnd = payDateForMonth(next.year, next.month, payDay);

  const rawDaysLeft = Math.round((toUtcMillis(cycleEnd) - toUtcMillis(todayYMD)) / MS_PER_DAY);
  const daysLeft = Math.max(1, rawDaysLeft);

  return {
    cycleStart: formatIsoDate(cycleStart),
    cycleEnd: formatIsoDate(cycleEnd),
    daysLeft,
  };
};

/**
 * Amortize one fixed item to its monthly-equivalent fils, rounded UP (ceil) so
 * `disposable` is never overstated.
 *   monthly → ×1 | quarterly → ÷3 | yearly → ÷12 | weekly → ×52 ÷12
 */
function amortizeToMonthly(item: FixedItemForBudget): ReturnType<typeof Money.fromFils> {
  const amount = Money.fromFils(item.amountMinor);
  const cycle: CycleKind = item.cycle;
  switch (cycle) {
    case 'monthly':
      return amount;
    case 'quarterly':
      return amount.divide(3, 'ceil');
    case 'yearly':
      return amount.divide(12, 'ceil');
    case 'weekly':
      // 52 weeks per year, spread across 12 months. Multiply is exact (integer
      // scalar), then divide with ceil.
      return amount.multiply(52).divide(12, 'ceil');
    default: {
      const never: never = cycle;
      throw new Error(`Unknown cycle kind: ${String(never)}`);
    }
  }
}

/**
 * Compute the budget result for `today`.
 *
 *   disposable      = salary − Σ amortizedMonthly(fixed)
 *   remaining       = disposable + carryover − spentThisCycle
 *   dailyAllowance  = remaining <= 0 ? 0 : floor(remaining / daysLeft)
 *   survival        = dailyAllowance < survivalThreshold
 */
export const computeBudget: ComputeBudget = (input: BudgetInput): BudgetResult => {
  const {
    salaryMinor,
    fixedItems,
    spentThisCycleMinor,
    survivalThresholdMinor,
    payDay,
    today,
    carryoverMinor = 0,
  } = input;

  const { cycleStart, cycleEnd, daysLeft } = resolveCycle(today, payDay);

  // Sum amortized fixed costs through the Money helper (integer fils throughout).
  const totalFixedMonthly = fixedItems.reduce(
    (sum, item) => sum.add(amortizeToMonthly(item)),
    Money.zero,
  );

  const salary = Money.fromFils(salaryMinor);
  const disposable = salary.subtract(totalFixedMonthly);

  const carryover = Money.fromFils(carryoverMinor);
  const spent = Money.fromFils(spentThisCycleMinor);
  const remaining = disposable.add(carryover).subtract(spent);

  // Conservative: floor, and never a positive number when nothing remains.
  const dailyAllowance =
    remaining.compare(Money.zero) <= 0 ? Money.zero : remaining.divide(daysLeft, 'floor');

  const survival = dailyAllowance.fils < survivalThresholdMinor;

  return {
    disposableMinor: disposable.fils,
    remainingMinor: remaining.fils,
    daysLeft,
    dailyAllowanceMinor: dailyAllowance.fils,
    survival,
    cycleStart,
    cycleEnd,
  };
};
