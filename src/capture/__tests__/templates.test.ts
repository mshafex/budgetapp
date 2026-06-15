/**
 * Unit tests for the pure template helpers (R3 amount exactness + date normalization).
 * These back the parser's guarantees at the smallest level.
 */
import { amountToFils, normalizeDate, normalizeDigits, guessCategory } from '../templates';

describe('amountToFils — integer fils, no float drift (R3)', () => {
  it.each<[string, number]>([
    ['125.50', 12550],
    ['1,250', 125000], // 3-digit trailing group = thousands, not fils
    ['1,250.00', 125000],
    ['90', 9000],
    ['0.99', 99],
    ['5.4', 540], // single fraction digit → tens of fils
    ['5.999', 599], // truncate, never round up
    ['0', 0],
    ['0.00', 0],
    ['1,234,567.89', 123456789], // exact on large values
    ['9,000,000', 900000000],
    ['٩٠٫٥٠', 9050], // Arabic-Indic digits + Arabic decimal sep
    ['٩٠', 9000],
  ])('parses %s → %d fils', (input, expected) => {
    const result = amountToFils(input);
    expect(result).toBe(expected);
    expect(Number.isInteger(result as number)).toBe(true);
  });

  it('returns null when there is no digit', () => {
    expect(amountToFils('AED')).toBeNull();
    expect(amountToFils('')).toBeNull();
    expect(amountToFils('.,')).toBeNull();
  });

  it('strips spaces and Arabic thousands separators as groupings', () => {
    expect(amountToFils('1 250.00')).toBe(125000);
    expect(amountToFils('١٬٢٥٠')).toBe(125000); // U+066C grouping between Arabic-Indic digits
  });
});

describe('normalizeDate — day-first, ISO out, no invented year', () => {
  it.each<[string, string]>([
    ['03/06/2026', '2026-06-03'],
    ['3-6-2026', '2026-06-03'],
    ['03.06.2026', '2026-06-03'],
    ['1-6-26', '2026-06-01'], // yy → 20yy
    ['03-Jun-2026', '2026-06-03'],
    ['3 Jun 26', '2026-06-03'],
  ])('parses %s → %s', (input, expected) => {
    expect(normalizeDate(input)).toBe(expected);
  });

  it('returns null for a year-less date (never guesses the year)', () => {
    expect(normalizeDate('03/06')).toBeNull();
    expect(normalizeDate('3-6')).toBeNull();
  });

  it('returns null for an impossible date', () => {
    expect(normalizeDate('31/02/2026')).toBeNull();
    expect(normalizeDate('45/13/2026')).toBeNull();
  });

  it('returns null for unparseable junk', () => {
    expect(normalizeDate('not a date')).toBeNull();
    expect(normalizeDate('')).toBeNull();
  });
});

describe('normalizeDigits', () => {
  it('folds Arabic-Indic digits to Western and leaves other chars', () => {
    expect(normalizeDigits('٠١٢٣٤٥٦٧٨٩')).toBe('0123456789');
    expect(normalizeDigits('AED ٩٠')).toBe('AED 90');
  });
});

describe('guessCategory — conservative best-guess, null when unsure', () => {
  it('maps known merchants', () => {
    expect(guessCategory('CARREFOUR MALL')).toBe('food');
    expect(guessCategory('CAREEM RIDE')).toBe('transport');
    expect(guessCategory('DEWA')).toBe('bills');
    expect(guessCategory('AMAZON.AE')).toBe('shopping');
    expect(guessCategory('LIFE PHARMACY')).toBe('health');
  });

  it('returns null for an unknown or empty merchant', () => {
    expect(guessCategory('SOME RANDOM LLC')).toBeNull();
    expect(guessCategory(null)).toBeNull();
    expect(guessCategory('')).toBeNull();
  });
});
