import { parseAmountToFils } from '../parseAmount';

describe('parseAmountToFils', () => {
  describe('whole numbers (Western digits)', () => {
    it('parses a plain integer to fils', () => {
      expect(parseAmountToFils('1250', 'en')).toBe(125000);
    });

    it('parses a single digit', () => {
      expect(parseAmountToFils('5', 'en')).toBe(500);
    });

    it('parses zero', () => {
      expect(parseAmountToFils('0', 'en')).toBe(0);
    });

    it('strips grouping commas in en', () => {
      expect(parseAmountToFils('1,250', 'en')).toBe(125000);
      expect(parseAmountToFils('12,345,678', 'en')).toBe(1234567800);
    });
  });

  describe('decimals', () => {
    it('parses a two-fraction-digit amount', () => {
      expect(parseAmountToFils('12.34', 'en')).toBe(1234);
    });

    it('pads a single fraction digit', () => {
      expect(parseAmountToFils('5.4', 'en')).toBe(540);
    });

    it('treats a trailing dot as no fraction', () => {
      expect(parseAmountToFils('5.', 'en')).toBe(500);
    });

    it('treats a leading dot as zero major part', () => {
      expect(parseAmountToFils('.5', 'en')).toBe(50);
      expect(parseAmountToFils('.05', 'en')).toBe(5);
    });

    it('handles "0.00"', () => {
      expect(parseAmountToFils('0.00', 'en')).toBe(0);
    });
  });

  describe('two-fraction-digit cap (truncate, never round up)', () => {
    it('drops a third fraction digit', () => {
      expect(parseAmountToFils('1.999', 'en')).toBe(199);
    });

    it('drops many extra fraction digits', () => {
      expect(parseAmountToFils('10.5678', 'en')).toBe(1056);
    });
  });

  describe('only the first decimal separator counts', () => {
    it('ignores everything after a second dot', () => {
      // "1.2.3" → major "1", frac "2"; the second separator and trailing "3" are dropped.
      expect(parseAmountToFils('1.2.3', 'en')).toBe(120);
    });
  });

  describe('junk handling', () => {
    it('ignores currency symbols and letters', () => {
      expect(parseAmountToFils('AED 1,250.50', 'en')).toBe(125050);
      expect(parseAmountToFils('$12.34abc', 'en')).toBe(1234);
    });

    it('returns 0 for an empty string', () => {
      expect(parseAmountToFils('', 'en')).toBe(0);
    });

    it('returns 0 for whitespace', () => {
      expect(parseAmountToFils('   ', 'en')).toBe(0);
    });

    it('returns 0 for letters only', () => {
      expect(parseAmountToFils('abc', 'en')).toBe(0);
    });

    it('ignores embedded spaces and underscores as grouping', () => {
      expect(parseAmountToFils('1 250', 'en')).toBe(125000);
      expect(parseAmountToFils('1_250', 'en')).toBe(125000);
    });

    it('ignores a stray minus sign (result is always non-negative)', () => {
      expect(parseAmountToFils('-12.34', 'en')).toBe(1234);
    });

    it('always returns a safe integer (clamps absurdly long input)', () => {
      const result = parseAmountToFils('12345678901234567890', 'en');
      expect(Number.isSafeInteger(result)).toBe(true);
      expect(result).toBe(Number.MAX_SAFE_INTEGER);
    });

    it('returns an integer for every reasonable input', () => {
      for (const input of ['0', '5', '12.34', '5.4', '1,250.99', '٥٠', '١٢٫٣٤']) {
        const r = parseAmountToFils(input, 'en');
        expect(Number.isInteger(r)).toBe(true);
        expect(r).toBeGreaterThanOrEqual(0);
      }
    });
  });

  describe('Arabic-Indic digits', () => {
    it('parses Arabic-Indic digits to fils', () => {
      // ١٢٣٤ → 1234 dirhams
      expect(parseAmountToFils('١٢٣٤', 'ar')).toBe(123400);
    });

    it('parses Arabic-Indic digits with the Arabic decimal separator ٫', () => {
      // ١٢٫٣٤ → 12.34
      expect(parseAmountToFils('١٢٫٣٤', 'ar')).toBe(1234);
    });

    it('strips the Arabic thousands separator ٬', () => {
      // ١٬٢٥٠ → 1250
      expect(parseAmountToFils('١٬٢٥٠', 'ar')).toBe(125000);
    });

    it('accepts a Western dot as decimal even in ar', () => {
      expect(parseAmountToFils('١٢.٥', 'ar')).toBe(1250);
    });

    it('accepts a comma as decimal in ar', () => {
      expect(parseAmountToFils('١٢,٥', 'ar')).toBe(1250);
    });

    it('parses Arabic-Indic digits even when locale is en', () => {
      expect(parseAmountToFils('٥٠', 'en')).toBe(5000);
    });

    it('caps Arabic-Indic fraction digits at two', () => {
      // ١٫٩٩٩ → 1.99 (truncated)
      expect(parseAmountToFils('١٫٩٩٩', 'ar')).toBe(199);
    });
  });

  describe('locale-specific comma handling', () => {
    it('comma is grouping (stripped) in en', () => {
      expect(parseAmountToFils('1,5', 'en')).toBe(1500);
    });

    it('comma is decimal in ar', () => {
      expect(parseAmountToFils('1,5', 'ar')).toBe(150);
    });
  });
});
