/**
 * End-to-end integration smoke (headless).
 *
 * Wires the REAL product modules together through the core journey —
 *   onboard → see "the number" → log expenses → push spending until Survival Mode trips —
 * exercising onboarding mappers, the pure budget engine, the Money helper, the Home
 * view-model, and the log form as one pipeline.
 *
 * The only seam stubbed is the repository's SQLite I/O (expo-sqlite is unavailable under
 * jest): an in-memory store mirrors `sumExpensesMinor`'s half-open [from, to) window, the
 * exact semantics the DATA mappers are unit-tested against. Real on-device DB persistence
 * is a manual verification step (see COMPLETION_REPORT.md).
 */
import { toHomeView } from '@/app/home/homeView';
import { buildExpenseInput } from '@/app/log/logForm';
import {
  draftFixedItemsToInputs,
  draftToUserInput,
  type OnboardingDraft,
} from '@/app/onboarding/state';
import type { Expense, ExpenseCategory } from '@/contracts';
import { computeBudget, resolveCycle } from '@/engine';

// A fixed "today" inside the cycle so the engine (UTC, no ambient clock) is deterministic.
const TODAY = '2026-06-10'; // payDay 1 → cycle 2026-06-01 .. 2026-07-01, daysLeft = 21
const LOCALE = 'en';

/** In-memory stand-in for repository.sumExpensesMinor: sum over createdAt ∈ [from, to). */
function sumInWindow(expenses: Expense[], fromISO: string, toISO: string): number {
  return expenses
    .filter((e) => e.createdAt >= fromISO && e.createdAt < toISO)
    .reduce((total, e) => total + e.amountMinor, 0);
}

/** Persist a logged expense the way the data layer would (stamping createdAt). */
function saveExpense(
  store: Expense[],
  amountMinor: number,
  category: ExpenseCategory,
  note: string,
  createdAt: string,
): void {
  const input = buildExpenseInput({ amountMinor, category, note });
  store.push({ id: store.length + 1, ...input, createdAt });
}

describe('integration: onboard → number → log → survival', () => {
  // ---- Onboarding: the user sets salary, one fixed cost, and a pay day. ----
  const draft: OnboardingDraft = {
    salaryMinor: 300000, // 3,000 AED
    fixedItems: [{ label: 'Rent', amountMinor: 150000, type: 'rent', cycle: 'monthly' }],
    payDay: 1,
  };
  const user = draftToUserInput(draft, LOCALE);
  const fixedItems = draftFixedItemsToInputs(draft);

  it('maps the onboarding draft to a sound profile (AED, default survival threshold)', () => {
    expect(user.salaryMinor).toBe(300000);
    expect(user.payDay).toBe(1);
    expect(user.currency).toBe('AED');
    expect(user.survivalThresholdMinor).toBe(2000); // 20 AED/day v1 default
    expect(fixedItems).toHaveLength(1);
  });

  const userRow = { id: 1, ...user };
  const expenses: Expense[] = [];

  function computeNow() {
    const { cycleStart, cycleEnd } = resolveCycle(TODAY, userRow.payDay);
    const spentThisCycleMinor = sumInWindow(expenses, cycleStart, cycleEnd);
    const result = computeBudget({
      salaryMinor: userRow.salaryMinor,
      fixedItems,
      spentThisCycleMinor,
      survivalThresholdMinor: userRow.survivalThresholdMinor,
      payDay: userRow.payDay,
      today: TODAY,
      carryoverMinor: 0,
    });
    return { result, view: toHomeView(result, userRow, spentThisCycleMinor, LOCALE) };
  }

  it('starts SAFE: disposable spread over the days left is well above the threshold', () => {
    const { result, view } = computeNow();
    // disposable = 300000 - ceil(150000 monthly) = 150000; floor(150000 / 21 days) = 7142.
    expect(result.disposableMinor).toBe(150000);
    expect(result.daysLeft).toBe(21);
    expect(result.dailyAllowanceMinor).toBe(7142);
    expect(Number.isInteger(result.dailyAllowanceMinor)).toBe(true); // R3: integer fils
    expect(result.survival).toBe(false);
    expect(view.state).toBe('safe');
    expect(view.banner).toBeNull();
  });

  it('ignores expenses outside the current cycle', () => {
    saveExpense(expenses, 999999, 'shopping', 'last cycle', '2026-05-15');
    const { result } = computeNow();
    expect(result.dailyAllowanceMinor).toBe(7142); // unchanged — out of [06-01, 07-01)
  });

  it('drops the number as in-cycle spending is logged, then trips SURVIVAL', () => {
    const before = computeNow();
    saveExpense(expenses, 50000, 'food', '', TODAY);
    saveExpense(expenses, 60000, 'shopping', 'eid', TODAY); // in-cycle total = 110000
    const after = computeNow();

    // remaining = 150000 - 110000 = 40000; floor(40000 / 21) = 1904 < 2000 → survival.
    expect(after.result.remainingMinor).toBe(40000);
    expect(after.result.dailyAllowanceMinor).toBe(1904);
    expect(after.result.dailyAllowanceMinor).toBeLessThan(before.result.dailyAllowanceMinor);
    expect(after.result.survival).toBe(true);

    // The whole Home screen flips state, and the banner appears.
    expect(after.view.state).toBe('survival');
    expect(after.view.banner).not.toBeNull();
    // The survival "limit" is the SAME figure as the big number (framing tightens, not the math).
    expect(after.view.banner?.limitValue).toBe(after.view.dailyAllowance.format(LOCALE));
  });

  it('pins the allowance to zero (never negative) when the user overspends the cycle', () => {
    saveExpense(expenses, 60000, 'bills', '', TODAY); // in-cycle total = 170000 > 150000
    const { result, view } = computeNow();
    expect(result.remainingMinor).toBeLessThan(0);
    expect(result.dailyAllowanceMinor).toBe(0); // clamped — never shows a negative allowance
    expect(result.survival).toBe(true);
    expect(view.state).toBe('survival');
  });
});
