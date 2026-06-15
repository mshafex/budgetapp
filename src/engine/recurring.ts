/**
 * Recurring auto-post scheduler — Bucket 1 of the three-bucket capture model.
 *
 * Implements the frozen `ComputeDuePostings` + `MakeRecurringKey` contract
 * (`@/contracts/recurring`) per Model A (decided 2026-06-15):
 *
 *   Recurring fixed items STAY amortized in the budget — `computeBudget` is NOT touched.
 *   This scheduler ADDITIONALLY posts each recurring item as a dated EXPENSE record tagged
 *   `source: 'recurring'`. The budget spend sum EXCLUDES `source: 'recurring'`, so those
 *   records are pure history and never double-count against the amortized amount.
 *
 * PURE: no I/O, no `Date.now()`, no ambient clock. `today` and the cycle bounds are always
 * injected as `'YYYY-MM-DD'` strings and parsed as UTC. Idempotent — re-running with the
 * already-posted keys in `postedKeys` yields nothing new. No user confirm (recurring items
 * are user-authored once; confirm-don't-assume applies only to Bucket-2 parsed candidates).
 *
 * R3: this module emits amounts as integer fils only; it does no money arithmetic at all.
 * R8: pure engine logic — no platform/native code, no network.
 *
 * Date math here is intentionally self-contained (it mirrors the pay-date clamp logic in
 * `index.ts` but does not import the engine's private helpers) so the scheduler stays an
 * independent, fully-testable unit and `computeBudget`/`resolveCycle` are left untouched.
 */
import type {
  ComputeDuePostings,
  ExpenseCategory,
  ExpenseInput,
  FixedItem,
  FixedItemType,
  MakeRecurringKey,
  RecurringPostingInput,
} from '@/contracts';

const MS_PER_DAY = 24 * 60 * 60 * 1000;
const DAYS_PER_WEEK = 7;
const DEFAULT_DUE_DAY = 1;
const ISO_DATE = /^(\d{4})-(\d{2})-(\d{2})$/;

interface YMD {
  year: number;
  /** 1..12 */
  month: number;
  /** 1..31 */
  day: number;
}

/* ------------------------------------------------------------------ *
 * Type -> category mapping
 * ------------------------------------------------------------------ *
 *
 * A recurring `FixedItem` is posted as an `Expense`, so its `FixedItemType` must map to an
 * `ExpenseCategory`. The table is intentionally small and explicit:
 *
 *   rent       -> bills    (a recurring housing bill)
 *   bill       -> bills
 *   loan       -> bills    (a recurring debt payment)
 *   remittance -> family   (R6: a tracking label only — the app never moves money)
 *   other      -> other
 *
 * Centralized + exhaustively switched so a new FixedItemType can't silently fall through.
 */
const FIXED_ITEM_TYPE_TO_CATEGORY: Record<FixedItemType, ExpenseCategory> = {
  rent: 'bills',
  bill: 'bills',
  loan: 'bills',
  remittance: 'family',
  other: 'other',
};

export function categoryForFixedItemType(type: FixedItemType): ExpenseCategory {
  const category = FIXED_ITEM_TYPE_TO_CATEGORY[type];
  if (category === undefined) {
    // Exhaustiveness guard — unreachable with a valid FixedItemType.
    throw new Error(`Unknown fixed item type: ${String(type)}`);
  }
  return category;
}

/* ------------------------------------------------------------------ *
 * Pure date helpers (UTC, calendar-correct)
 * ------------------------------------------------------------------ */

/** Parse a 'YYYY-MM-DD' string into calendar parts, validating it is a real UTC date. */
function parseIsoDate(value: string): YMD {
  const match = ISO_DATE.exec(value);
  if (!match) {
    throw new Error(`Expected date 'YYYY-MM-DD', received: ${String(value)}`);
  }
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
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
  return new Date(Date.UTC(year, month, 0)).getUTCDate();
}

function toUtcMillis({ year, month, day }: YMD): number {
  return Date.UTC(year, month - 1, day);
}

function fromUtcMillis(ms: number): YMD {
  const d = new Date(ms);
  return { year: d.getUTCFullYear(), month: d.getUTCMonth() + 1, day: d.getUTCDate() };
}

/** a − b in signed calendar days. */
function compareYMD(a: YMD, b: YMD): number {
  return toUtcMillis(a) - toUtcMillis(b);
}

/** Step a (year, month) pair by ±n months, rolling the year over. month is 1..12. */
function shiftMonth(year: number, month: number, delta: number): { year: number; month: number } {
  const zeroBased = year * 12 + (month - 1) + delta;
  return { year: Math.floor(zeroBased / 12), month: (zeroBased % 12) + 1 };
}

/** Add a number of whole days to a date (UTC). */
function addDays(date: YMD, days: number): YMD {
  return fromUtcMillis(toUtcMillis(date) + days * MS_PER_DAY);
}

/**
 * The due date in a given month, clamping `dueDay` to the month length — same rule the
 * pay-date logic uses (e.g. dueDay 31 in February → last day of February).
 */
function dueDateForMonth(year: number, month: number, dueDay: number): YMD {
  const clampedDay = Math.min(dueDay, daysInMonth(year, month));
  return { year, month, day: clampedDay };
}

/** Normalize + validate the item's dueDay (default 1, must be an integer 1..31). */
function resolveDueDay(dueDay: number | null | undefined): number {
  if (dueDay === null || dueDay === undefined) {
    return DEFAULT_DUE_DAY;
  }
  if (!Number.isInteger(dueDay) || dueDay < 1 || dueDay > 31) {
    throw new Error(`dueDay must be an integer 1..31 (or absent), received: ${String(dueDay)}`);
  }
  return dueDay;
}

/* ------------------------------------------------------------------ *
 * Per-cadence due-date generation
 * ------------------------------------------------------------------ */

/** Months between consecutive postings for a month-anchored cadence. */
function monthStepFor(cycle: 'monthly' | 'quarterly' | 'yearly'): number {
  switch (cycle) {
    case 'monthly':
      return 1;
    case 'quarterly':
      return 3;
    case 'yearly':
      return 12;
    default: {
      const never: never = cycle;
      throw new Error(`Unknown month-anchored cycle: ${String(never)}`);
    }
  }
}

/**
 * Month-anchored due dates (monthly / quarterly / yearly) falling in [windowStart, windowEnd]
 * inclusive. Each occurrence is the `dueDay`-th of its month, clamped to the month length.
 *
 * We start one whole period before windowStart so the occurrence that opened the window is
 * never missed (clamping can pull a due date a few days earlier than windowStart's day),
 * then walk forward, collecting in-window dates and stopping once past windowEnd.
 */
function monthAnchoredDueDates(
  cycle: 'monthly' | 'quarterly' | 'yearly',
  dueDay: number,
  windowStart: YMD,
  windowEnd: YMD,
): YMD[] {
  const step = monthStepFor(cycle);
  const out: YMD[] = [];

  // Begin one period before the window-start month, then advance by `step` months.
  let cursor = shiftMonth(windowStart.year, windowStart.month, -step);
  // Hard upper bound on iterations: the months spanned by the window plus the two
  // periods of slack we walk, divided by the step. Guards against any logic error
  // turning into an unbounded loop.
  const windowMonths =
    (windowEnd.year - windowStart.year) * 12 + (windowEnd.month - windowStart.month);
  const maxIterations = Math.floor(windowMonths / step) + 4;

  for (let i = 0; i <= maxIterations; i += 1) {
    const due = dueDateForMonth(cursor.year, cursor.month, dueDay);
    if (compareYMD(due, windowEnd) > 0) {
      break; // walked past the window — done.
    }
    if (compareYMD(due, windowStart) >= 0) {
      out.push(due);
    }
    cursor = shiftMonth(cursor.year, cursor.month, step);
  }
  return out;
}

/**
 * Weekly due dates falling in [windowStart, windowEnd] inclusive.
 *
 * `dueDay` seeds an anchor — the `dueDay`-th of windowStart's month (clamped) — which we step
 * back by whole weeks to the last occurrence on/before windowStart, then forward by 7 days,
 * collecting every occurrence in the window. Deterministic and independent of `today`.
 */
function weeklyDueDates(dueDay: number, windowStart: YMD, windowEnd: YMD): YMD[] {
  const out: YMD[] = [];

  // Seed anchor: the dueDay-th of the window-start month.
  let cursor = dueDateForMonth(windowStart.year, windowStart.month, dueDay);
  // Walk back to the first occurrence on/before windowStart.
  while (compareYMD(cursor, windowStart) > 0) {
    cursor = addDays(cursor, -DAYS_PER_WEEK);
  }

  // Bound iterations by the window span in weeks plus slack.
  const windowDays = Math.round((toUtcMillis(windowEnd) - toUtcMillis(windowStart)) / MS_PER_DAY);
  const maxIterations = Math.floor(Math.max(0, windowDays) / DAYS_PER_WEEK) + 4;

  for (let i = 0; i <= maxIterations; i += 1) {
    if (compareYMD(cursor, windowEnd) > 0) {
      break;
    }
    if (compareYMD(cursor, windowStart) >= 0) {
      out.push(cursor);
    }
    cursor = addDays(cursor, DAYS_PER_WEEK);
  }
  return out;
}

/** All due dates for one item within [windowStart, windowEnd] inclusive, ascending. */
function dueDatesForItem(item: FixedItem, windowStart: YMD, windowEnd: YMD): YMD[] {
  const dueDay = resolveDueDay(item.dueDay);
  switch (item.cycle) {
    case 'weekly':
      return weeklyDueDates(dueDay, windowStart, windowEnd);
    case 'monthly':
    case 'quarterly':
    case 'yearly':
      return monthAnchoredDueDates(item.cycle, dueDay, windowStart, windowEnd);
    default: {
      const never: never = item.cycle;
      throw new Error(`Unknown cycle kind: ${String(never)}`);
    }
  }
}

/* ------------------------------------------------------------------ *
 * Public contract surface
 * ------------------------------------------------------------------ */

/** Build the idempotency key for a recurring item + due date: `${fixedItemId}:${dueDateISO}`. */
export const makeRecurringKey: MakeRecurringKey = (
  fixedItemId: number,
  dueDateISO: string,
): string => `${fixedItemId}:${dueDateISO}`;

/**
 * Compute the `ExpenseInput`s to post for recurring items whose due date(s) fall in
 * `[cycleStart, min(today, cycleEnd)]` and are not already in `postedKeys`.
 *
 * The window upper bound is the earlier of `today` and `cycleEnd`; because `cycleEnd` is the
 * next pay date (cycle end, EXCLUSIVE), a posting that lands exactly on `cycleEnd` belongs to
 * the next cycle and is excluded here. Past-due occurrences within the cycle are backfilled.
 * Results are ordered by due date, then by the item's position in `fixedItems`.
 */
export const computeDuePostings: ComputeDuePostings = (
  input: RecurringPostingInput,
): ExpenseInput[] => {
  const { fixedItems, today, cycleStart, cycleEnd, postedKeys } = input;

  const todayYMD = parseIsoDate(today);
  const startYMD = parseIsoDate(cycleStart);
  const endYMD = parseIsoDate(cycleEnd);

  // Window: [cycleStart, min(today, cycleEnd)], with cycleEnd treated as EXCLUSIVE.
  // If the cycle hasn't begun relative to `today` (today < cycleStart), there is nothing
  // to post — return early so we never iterate an inverted range.
  if (compareYMD(todayYMD, startYMD) < 0) {
    return [];
  }
  // Upper bound is the earlier of today and cycleEnd...
  let windowEnd = compareYMD(todayYMD, endYMD) <= 0 ? todayYMD : endYMD;
  // ...but cycleEnd is exclusive: if the bound is cycleEnd itself, step back one day so a
  // posting exactly on the next pay date is not attributed to this cycle.
  if (compareYMD(windowEnd, endYMD) === 0) {
    windowEnd = addDays(endYMD, -1);
  }
  // After clamping, the window can be empty (e.g. today === cycleStart === cycleEnd-? edge
  // or a degenerate same-day cycle) — bail rather than emit anything.
  if (compareYMD(windowEnd, startYMD) < 0) {
    return [];
  }

  const alreadyPosted = new Set<string>(postedKeys);
  const postings: { dueMillis: number; order: number; expense: ExpenseInput }[] = [];

  fixedItems.forEach((item, order) => {
    const dueDates = dueDatesForItem(item, startYMD, windowEnd);
    const category = categoryForFixedItemType(item.type);

    for (const due of dueDates) {
      const dueDateISO = formatIsoDate(due);
      const recurringKey = makeRecurringKey(item.id, dueDateISO);
      if (alreadyPosted.has(recurringKey)) {
        continue; // idempotent: already posted in a prior run.
      }
      // Guard against the same item resolving the same due date twice in one run
      // (it shouldn't, but a duplicate key would double-post within the batch).
      alreadyPosted.add(recurringKey);

      postings.push({
        dueMillis: toUtcMillis(due),
        order,
        expense: {
          amountMinor: item.amountMinor,
          category,
          note: item.label,
          source: 'recurring',
          recurringKey,
          createdAt: dueDateISO,
        },
      });
    }
  });

  // Deterministic ordering: by due date, then by the item's original position.
  postings.sort((a, b) => a.dueMillis - b.dueMillis || a.order - b.order);
  return postings.map((p) => p.expense);
};
