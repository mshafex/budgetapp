/**
 * Unit tests for the pure add-expense form logic (LOGGING).
 *
 * These cover the rules that must not regress — amount validity, note
 * normalization, and the `ExpenseInput` we hand to the repository — without a
 * renderer or the native expo-sqlite driver (unavailable under jest/node).
 */
import { buildExpenseInput, isAmountValid, normalizeNote } from '../logForm';

describe('isAmountValid', () => {
  it('accepts a positive fils amount', () => {
    expect(isAmountValid(1)).toBe(true);
    expect(isAmountValid(125000)).toBe(true);
  });

  it('rejects zero (the empty-input default)', () => {
    expect(isAmountValid(0)).toBe(false);
  });

  it('rejects negative amounts', () => {
    expect(isAmountValid(-1)).toBe(false);
    expect(isAmountValid(-5000)).toBe(false);
  });

  it('rejects non-finite values', () => {
    expect(isAmountValid(Number.NaN)).toBe(false);
    expect(isAmountValid(Number.POSITIVE_INFINITY)).toBe(false);
  });
});

describe('normalizeNote', () => {
  it('maps an empty string to null', () => {
    expect(normalizeNote('')).toBeNull();
  });

  it('maps a whitespace-only string to null', () => {
    expect(normalizeNote('   ')).toBeNull();
    expect(normalizeNote('\t\n ')).toBeNull();
  });

  it('trims surrounding whitespace from a real note', () => {
    expect(normalizeNote('  lunch  ')).toBe('lunch');
  });

  it('keeps interior whitespace intact', () => {
    expect(normalizeNote('  taxi to work  ')).toBe('taxi to work');
  });
});

describe('buildExpenseInput', () => {
  it('shapes a full input with a normalized note', () => {
    expect(
      buildExpenseInput({ amountMinor: 4250, category: 'food', note: '  dinner ' }),
    ).toEqual({
      amountMinor: 4250,
      category: 'food',
      note: 'dinner',
    });
  });

  it('uses null when the note is blank', () => {
    expect(
      buildExpenseInput({ amountMinor: 1500, category: 'transport', note: '   ' }),
    ).toEqual({
      amountMinor: 1500,
      category: 'transport',
      note: null,
    });
  });

  it('does not set createdAt (the data layer stamps it)', () => {
    const input = buildExpenseInput({ amountMinor: 100, category: 'other', note: '' });
    expect('createdAt' in input).toBe(false);
  });

  it('preserves the chosen category', () => {
    const input = buildExpenseInput({ amountMinor: 999, category: 'health', note: 'clinic' });
    expect(input.category).toBe('health');
  });
});
