/**
 * Unit tests for the pure paste-intake glue (Capture C4).
 *
 * These pin the mapping rules that must not regress — amount validity, note normalization, the
 * seeded note, and (most importantly) that a confirmed candidate ALWAYS becomes a
 * `source: 'captured'` expense with edits overriding the candidate. No renderer, no native DB
 * (expo-sqlite is unavailable under jest/node).
 */
import type { ParsedTransaction } from '@/contracts';

import {
  candidateToExpenseInput,
  DEFAULT_CATEGORY,
  defaultNoteFromCandidate,
  isAmountValid,
  normalizeNote,
} from '../captureForm';

/** A fully-populated candidate; individual tests override fields as needed. */
function makeCandidate(overrides: Partial<ParsedTransaction> = {}): ParsedTransaction {
  return {
    amountMinor: 4250,
    merchant: 'Carrefour',
    date: '2026-06-14',
    category: 'shopping',
    raw: 'Your card was charged AED 42.50 at Carrefour on 14/06/2026',
    sourceKey: 'fab',
    ...overrides,
  };
}

describe('isAmountValid', () => {
  it('accepts a positive integer fils amount', () => {
    expect(isAmountValid(1)).toBe(true);
    expect(isAmountValid(4250)).toBe(true);
  });

  it('rejects zero (a cleared field)', () => {
    expect(isAmountValid(0)).toBe(false);
  });

  it('rejects negative amounts', () => {
    expect(isAmountValid(-1)).toBe(false);
  });

  it('rejects non-integer / non-finite values (R3 integer-fils guard)', () => {
    expect(isAmountValid(12.5)).toBe(false);
    expect(isAmountValid(Number.NaN)).toBe(false);
    expect(isAmountValid(Number.POSITIVE_INFINITY)).toBe(false);
  });
});

describe('normalizeNote', () => {
  it('maps empty / whitespace-only to null', () => {
    expect(normalizeNote('')).toBeNull();
    expect(normalizeNote('   ')).toBeNull();
    expect(normalizeNote('\t\n ')).toBeNull();
  });

  it('trims surrounding whitespace but keeps interior whitespace', () => {
    expect(normalizeNote('  Carrefour Market  ')).toBe('Carrefour Market');
  });
});

describe('defaultNoteFromCandidate', () => {
  it('uses the merchant when present', () => {
    expect(defaultNoteFromCandidate(makeCandidate({ merchant: 'Talabat' }))).toBe('Talabat');
  });

  it('is an empty string when there is no merchant', () => {
    expect(defaultNoteFromCandidate(makeCandidate({ merchant: null }))).toBe('');
  });

  it('does NOT leak the raw text into the note (only structured fields cross over, R8)', () => {
    const candidate = makeCandidate({ merchant: null, raw: 'sensitive bank sms body' });
    expect(defaultNoteFromCandidate(candidate)).toBe('');
  });
});

describe('candidateToExpenseInput', () => {
  it('always sets source to "captured" (never overridable)', () => {
    expect(candidateToExpenseInput(makeCandidate()).source).toBe('captured');
    // Even with edits, the source is fixed.
    expect(
      candidateToExpenseInput(makeCandidate(), { amountMinor: 100, category: 'food', note: 'x' })
        .source,
    ).toBe('captured');
  });

  it('maps amount, category, and merchant→note from the candidate when there are no edits', () => {
    expect(candidateToExpenseInput(makeCandidate())).toEqual({
      amountMinor: 4250,
      category: 'shopping',
      note: 'Carrefour',
      source: 'captured',
    });
  });

  it('lets edits override every mapped field', () => {
    expect(
      candidateToExpenseInput(makeCandidate(), {
        amountMinor: 9900,
        category: 'food',
        note: '  Lunch with team  ',
      }),
    ).toEqual({
      amountMinor: 9900,
      category: 'food',
      note: 'Lunch with team',
      source: 'captured',
    });
  });

  it('falls back to the default category when the candidate has none and the user did not pick', () => {
    const input = candidateToExpenseInput(makeCandidate({ category: null }));
    expect(input.category).toBe(DEFAULT_CATEGORY);
    expect(input.category).toBe('food');
  });

  it('prefers an explicit category edit over the candidate category', () => {
    const input = candidateToExpenseInput(makeCandidate({ category: 'shopping' }), {
      category: 'transport',
    });
    expect(input.category).toBe('transport');
  });

  it('normalizes an explicitly cleared note to null', () => {
    const input = candidateToExpenseInput(makeCandidate({ merchant: 'Carrefour' }), { note: '   ' });
    expect(input.note).toBeNull();
  });

  it('uses the merchant as the note when the note edit is omitted', () => {
    const input = candidateToExpenseInput(makeCandidate({ merchant: 'Noon' }), {
      amountMinor: 500,
    });
    expect(input.note).toBe('Noon');
  });

  it('stores null note when there is neither a merchant nor a note edit', () => {
    const input = candidateToExpenseInput(makeCandidate({ merchant: null }));
    expect(input.note).toBeNull();
  });

  it('keeps amountMinor an integer number of fils (R3)', () => {
    const input = candidateToExpenseInput(makeCandidate({ amountMinor: 12345 }));
    expect(Number.isInteger(input.amountMinor)).toBe(true);
    expect(input.amountMinor).toBe(12345);
  });

  it('does not set createdAt (the data layer stamps it)', () => {
    expect('createdAt' in candidateToExpenseInput(makeCandidate())).toBe(false);
  });
});
