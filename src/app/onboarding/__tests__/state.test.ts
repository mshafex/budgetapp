/**
 * Unit tests for the onboarding draft store + pure helpers.
 *
 * These exercise the PURE pieces only (validation, the in-memory store, draft→contract-input
 * mapping). expo-sqlite is unavailable under jest, so no real DB is touched here — `@/db` is
 * never imported (the screens do the persistence; the mapping it relies on is tested below).
 */
import type { AppLocale } from '@/contracts';

import {
  DEFAULT_SURVIVAL_THRESHOLD_MINOR,
  ONBOARDING_CURRENCY,
  PAY_DAY_MAX,
  PAY_DAY_MIN,
  draftFixedItemToInput,
  draftFixedItemsToInputs,
  draftToUserInput,
  onboardingStore,
  parsePayDay,
  validateFixedAmountMinor,
  validateFixedLabel,
  validatePayDay,
  validateSalaryMinor,
  type DraftFixedItem,
  type OnboardingDraft,
} from '../state';

// Each test starts from a clean draft — the store is a shared module singleton.
beforeEach(() => {
  onboardingStore.reset();
});

describe('validateSalaryMinor', () => {
  it('accepts a positive integer salary', () => {
    expect(validateSalaryMinor(1)).toBeNull();
    expect(validateSalaryMinor(500000)).toBeNull(); // 5,000 AED
  });

  it('rejects zero and negatives', () => {
    expect(validateSalaryMinor(0)).toBe('errors.salaryInvalid');
    expect(validateSalaryMinor(-1)).toBe('errors.salaryInvalid');
  });

  it('rejects non-integers (R3: fils are integers)', () => {
    expect(validateSalaryMinor(12.5)).toBe('errors.salaryInvalid');
    expect(validateSalaryMinor(Number.NaN)).toBe('errors.salaryInvalid');
  });
});

describe('validateFixedAmountMinor', () => {
  it('accepts a positive integer amount', () => {
    expect(validateFixedAmountMinor(100)).toBeNull();
  });

  it('rejects zero, negatives, and non-integers', () => {
    expect(validateFixedAmountMinor(0)).toBe('errors.amountTooLow');
    expect(validateFixedAmountMinor(-50)).toBe('errors.amountTooLow');
    expect(validateFixedAmountMinor(1.5)).toBe('errors.amountTooLow');
  });
});

describe('validateFixedLabel', () => {
  it('accepts a non-empty label', () => {
    expect(validateFixedLabel('Rent')).toBeNull();
  });

  it('rejects empty / whitespace-only labels', () => {
    expect(validateFixedLabel('')).toBe('errors.nameRequired');
    expect(validateFixedLabel('   ')).toBe('errors.nameRequired');
  });
});

describe('validatePayDay', () => {
  it('accepts the inclusive bounds and a mid-month day', () => {
    expect(validatePayDay(PAY_DAY_MIN)).toBeNull();
    expect(validatePayDay(15)).toBeNull();
    expect(validatePayDay(PAY_DAY_MAX)).toBeNull();
  });

  it('rejects out-of-range, null, and non-integers', () => {
    expect(validatePayDay(0)).toBe('errors.payDayInvalid');
    expect(validatePayDay(32)).toBe('errors.payDayInvalid');
    expect(validatePayDay(null)).toBe('errors.payDayInvalid');
    expect(validatePayDay(12.5)).toBe('errors.payDayInvalid');
  });
});

describe('parsePayDay', () => {
  it('parses a plain integer string', () => {
    expect(parsePayDay('1')).toBe(1);
    expect(parsePayDay('28')).toBe(28);
    expect(parsePayDay('  15 ')).toBe(15);
  });

  it('returns null for empty / non-digit / decimal input', () => {
    expect(parsePayDay('')).toBeNull();
    expect(parsePayDay('abc')).toBeNull();
    expect(parsePayDay('1.5')).toBeNull();
    expect(parsePayDay('-3')).toBeNull();
  });

  it('round-trips through validatePayDay: in-range text is valid, out-of-range is not', () => {
    expect(validatePayDay(parsePayDay('15'))).toBeNull();
    expect(validatePayDay(parsePayDay('40'))).toBe('errors.payDayInvalid');
    expect(validatePayDay(parsePayDay('xx'))).toBe('errors.payDayInvalid');
  });
});

describe('onboardingStore', () => {
  it('starts empty', () => {
    const d = onboardingStore.getDraft();
    expect(d.salaryMinor).toBe(0);
    expect(d.fixedItems).toEqual([]);
    expect(d.payDay).toBeNull();
  });

  it('sets the salary', () => {
    onboardingStore.setSalaryMinor(300000);
    expect(onboardingStore.getDraft().salaryMinor).toBe(300000);
  });

  it('adds fixed items in order and removes by index', () => {
    const rent: DraftFixedItem = {
      label: 'Rent',
      amountMinor: 200000,
      type: 'rent',
      cycle: 'monthly',
    };
    const phone: DraftFixedItem = {
      label: 'Phone',
      amountMinor: 5000,
      type: 'bill',
      cycle: 'monthly',
    };
    onboardingStore.addFixedItem(rent);
    onboardingStore.addFixedItem(phone);
    expect(onboardingStore.getDraft().fixedItems).toEqual([rent, phone]);

    onboardingStore.removeFixedItemAt(0);
    expect(onboardingStore.getDraft().fixedItems).toEqual([phone]);
  });

  it('ignores out-of-bounds removals', () => {
    onboardingStore.addFixedItem({
      label: 'Rent',
      amountMinor: 200000,
      type: 'rent',
      cycle: 'monthly',
    });
    onboardingStore.removeFixedItemAt(5);
    onboardingStore.removeFixedItemAt(-1);
    expect(onboardingStore.getDraft().fixedItems).toHaveLength(1);
  });

  it('sets the pay day (and accepts null to clear)', () => {
    onboardingStore.setPayDay(25);
    expect(onboardingStore.getDraft().payDay).toBe(25);
    onboardingStore.setPayDay(null);
    expect(onboardingStore.getDraft().payDay).toBeNull();
  });

  it('reset clears everything', () => {
    onboardingStore.setSalaryMinor(100000);
    onboardingStore.setPayDay(10);
    onboardingStore.addFixedItem({
      label: 'X',
      amountMinor: 100,
      type: 'other',
      cycle: 'weekly',
    });
    onboardingStore.reset();
    expect(onboardingStore.getDraft()).toEqual({
      salaryMinor: 0,
      fixedItems: [],
      payDay: null,
    });
  });

  it('notifies subscribers on change and stops after unsubscribe', () => {
    const listener = jest.fn();
    const unsubscribe = onboardingStore.subscribe(listener);
    onboardingStore.setSalaryMinor(100);
    onboardingStore.setPayDay(5);
    expect(listener).toHaveBeenCalledTimes(2);

    unsubscribe();
    onboardingStore.setSalaryMinor(200);
    expect(listener).toHaveBeenCalledTimes(2); // no further calls
  });

  it('treats each getDraft as the current immutable snapshot (new ref on change)', () => {
    const before = onboardingStore.getDraft();
    onboardingStore.setSalaryMinor(999);
    const after = onboardingStore.getDraft();
    expect(after).not.toBe(before); // new object → useSyncExternalStore re-renders
    expect(before.salaryMinor).toBe(0); // old snapshot unchanged
    expect(after.salaryMinor).toBe(999);
  });
});

describe('draftToUserInput', () => {
  const baseDraft: OnboardingDraft = {
    salaryMinor: 400000,
    fixedItems: [],
    payDay: 28,
  };

  it('maps the draft + locale to a UserInput with the v1 defaults', () => {
    const input = draftToUserInput(baseDraft, 'en');
    expect(input).toEqual({
      salaryMinor: 400000,
      payDay: 28,
      currency: ONBOARDING_CURRENCY,
      locale: 'en',
      survivalThresholdMinor: DEFAULT_SURVIVAL_THRESHOLD_MINOR,
    });
  });

  it('carries the active locale through', () => {
    const locales: AppLocale[] = ['en', 'ar'];
    for (const locale of locales) {
      expect(draftToUserInput(baseDraft, locale).locale).toBe(locale);
    }
  });

  it('always uses AED and the 20 AED/day default threshold in v1', () => {
    const input = draftToUserInput(baseDraft, 'ar');
    expect(input.currency).toBe('AED');
    expect(input.survivalThresholdMinor).toBe(2000);
  });

  it('throws if pay day is missing (guards a sound persisted row)', () => {
    const noPayDay: OnboardingDraft = { ...baseDraft, payDay: null };
    expect(() => draftToUserInput(noPayDay, 'en')).toThrow();
  });
});

describe('draftFixedItem mapping', () => {
  it('maps a single draft item to FixedItemInput and trims the label', () => {
    const item: DraftFixedItem = {
      label: '  Rent  ',
      amountMinor: 200000,
      type: 'rent',
      cycle: 'monthly',
    };
    expect(draftFixedItemToInput(item)).toEqual({
      label: 'Rent',
      amountMinor: 200000,
      type: 'rent',
      cycle: 'monthly',
    });
  });

  it('maps every item preserving order', () => {
    const draft: OnboardingDraft = {
      salaryMinor: 400000,
      payDay: 1,
      fixedItems: [
        { label: 'Rent', amountMinor: 200000, type: 'rent', cycle: 'monthly' },
        { label: 'Car loan', amountMinor: 80000, type: 'loan', cycle: 'monthly' },
        { label: 'Insurance', amountMinor: 120000, type: 'bill', cycle: 'yearly' },
      ],
    };
    const inputs = draftFixedItemsToInputs(draft);
    expect(inputs.map((i) => i.label)).toEqual(['Rent', 'Car loan', 'Insurance']);
    expect(inputs.map((i) => i.cycle)).toEqual(['monthly', 'monthly', 'yearly']);
  });

  it('maps an empty list to an empty array (empty fixed costs allowed)', () => {
    const draft: OnboardingDraft = { salaryMinor: 400000, payDay: 1, fixedItems: [] };
    expect(draftFixedItemsToInputs(draft)).toEqual([]);
  });
});
