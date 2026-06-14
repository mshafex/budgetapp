import { Money } from '@/money';
import type { RoundingMode } from '@/contracts';

describe('Money.fromFils — integer guard', () => {
  it('accepts integer fils', () => {
    expect(Money.fromFils(0).fils).toBe(0);
    expect(Money.fromFils(12345).fils).toBe(12345);
    expect(Money.fromFils(-500).fils).toBe(-500);
  });

  it('throws on non-integer fils', () => {
    expect(() => Money.fromFils(1.5)).toThrow();
    expect(() => Money.fromFils(0.0001)).toThrow();
  });

  it('throws on NaN / Infinity', () => {
    expect(() => Money.fromFils(NaN)).toThrow();
    expect(() => Money.fromFils(Infinity)).toThrow();
    expect(() => Money.fromFils(-Infinity)).toThrow();
  });
});

describe('Money — immutability', () => {
  it('every op returns a new instance and never mutates the receiver', () => {
    const a = Money.fromFils(1000);
    const b = Money.fromFils(250);
    const sum = a.add(b);
    expect(sum.fils).toBe(1250);
    // originals untouched
    expect(a.fils).toBe(1000);
    expect(b.fils).toBe(250);
    expect(sum).not.toBe(a);
  });

  it('instances are frozen — fils is non-writable and cannot be mutated', () => {
    const a = Money.fromFils(1000);
    expect(Object.isFrozen(a)).toBe(true);
    const descriptor = Object.getOwnPropertyDescriptor(a, 'fils');
    expect(descriptor?.writable).toBe(false);
    // An attempted write is a no-op (strict) or throws (very strict); either way the
    // value must be unchanged.
    try {
      (a as { fils: number }).fils = 5;
    } catch {
      // strict-mode TypeError is acceptable
    }
    expect(a.fils).toBe(1000);
  });

  it('zero is the additive identity', () => {
    expect(Money.zero.fils).toBe(0);
    expect(Money.zero.isZero()).toBe(true);
    expect(Money.fromFils(777).add(Money.zero).fils).toBe(777);
  });
});

describe('Money.add / subtract', () => {
  it('adds and subtracts in fils', () => {
    expect(Money.fromFils(100).add(Money.fromFils(50)).fils).toBe(150);
    expect(Money.fromFils(100).subtract(Money.fromFils(150)).fils).toBe(-50);
  });

  it('handles negatives and normalizes -0 to 0', () => {
    const zeroish = Money.fromFils(-100).add(Money.fromFils(100));
    expect(zeroish.fils).toBe(0);
    expect(Object.is(zeroish.fils, -0)).toBe(false);
    expect(zeroish.isZero()).toBe(true);
  });
});

describe('Money.compare / isNegative / isZero', () => {
  it('compare returns sign of difference', () => {
    expect(Money.fromFils(100).compare(Money.fromFils(200))).toBeLessThan(0);
    expect(Money.fromFils(200).compare(Money.fromFils(100))).toBeGreaterThan(0);
    expect(Money.fromFils(100).compare(Money.fromFils(100))).toBe(0);
  });

  it('isNegative / isZero', () => {
    expect(Money.fromFils(-1).isNegative()).toBe(true);
    expect(Money.fromFils(0).isNegative()).toBe(false);
    expect(Money.fromFils(1).isNegative()).toBe(false);
    expect(Money.fromFils(0).isZero()).toBe(true);
    expect(Money.fromFils(1).isZero()).toBe(false);
  });
});

describe('Money.multiply — integer and fractional scalars, all rounding modes', () => {
  it('integer scalar is exact (no rounding involved)', () => {
    expect(Money.fromFils(125).multiply(52).fils).toBe(6500);
    expect(Money.fromFils(-125).multiply(3).fils).toBe(-375);
    expect(Money.fromFils(125).multiply(0).fils).toBe(0);
  });

  it('default mode is round, ties away from zero (binary-exact inputs)', () => {
    // 100 * 1.125 = 112.5 exactly (1.125 is exact in IEEE-754) → tie → away → 113.
    expect(Money.fromFils(100).multiply(1.125).fils).toBe(113);
    // -100 * 1.125 = -112.5 → tie → away → -113 (symmetric, unlike Math.round).
    expect(Money.fromFils(-100).multiply(1.125).fils).toBe(-113);
  });

  // 1.375 is exact in IEEE-754, so 100 * 1.375 = 137.5 is a genuine tie.
  const cases: Array<{ fils: number; scalar: number; mode: RoundingMode; expected: number }> = [
    { fils: 100, scalar: 1.375, mode: 'floor', expected: 137 }, // 137.5 → 137
    { fils: 100, scalar: 1.375, mode: 'ceil', expected: 138 }, // 137.5 → 138
    { fils: 100, scalar: 1.375, mode: 'trunc', expected: 137 },
    { fils: 100, scalar: 1.375, mode: 'round', expected: 138 }, // tie → away
    { fils: -100, scalar: 1.375, mode: 'floor', expected: -138 }, // -137.5 → -138
    { fils: -100, scalar: 1.375, mode: 'ceil', expected: -137 },
    { fils: -100, scalar: 1.375, mode: 'trunc', expected: -137 },
    { fils: -100, scalar: 1.375, mode: 'round', expected: -138 }, // tie → away
  ];
  it.each(cases)(
    'multiply($fils * $scalar) mode=$mode → $expected',
    ({ fils, scalar, mode, expected }) => {
      expect(Money.fromFils(fils).multiply(scalar, mode).fils).toBe(expected);
    },
  );

  it('rejects non-finite scalars', () => {
    expect(() => Money.fromFils(100).multiply(NaN)).toThrow();
    expect(() => Money.fromFils(100).multiply(Infinity)).toThrow();
  });
});

describe('Money.divide — all rounding modes, including negatives', () => {
  // 1000 / 3 = 333.333...  ;  1000 / 7 = 142.857...
  const cases: Array<{ fils: number; divisor: number; mode: RoundingMode; expected: number }> = [
    { fils: 1000, divisor: 3, mode: 'floor', expected: 333 },
    { fils: 1000, divisor: 3, mode: 'ceil', expected: 334 },
    { fils: 1000, divisor: 3, mode: 'trunc', expected: 333 },
    { fils: 1000, divisor: 3, mode: 'round', expected: 333 }, // .333 < .5

    { fils: 1000, divisor: 7, mode: 'round', expected: 143 }, // 142.857 → 143

    // Negative numerator
    { fils: -1000, divisor: 3, mode: 'floor', expected: -334 }, // toward -inf
    { fils: -1000, divisor: 3, mode: 'ceil', expected: -333 }, // toward +inf
    { fils: -1000, divisor: 3, mode: 'trunc', expected: -333 }, // toward 0
    { fils: -1000, divisor: 3, mode: 'round', expected: -333 },
    { fils: -1000, divisor: 7, mode: 'round', expected: -143 }, // -142.857 → away → -143

    // Negative divisor (result positive)
    { fils: -1000, divisor: -3, mode: 'floor', expected: 333 },
    { fils: -1000, divisor: -3, mode: 'ceil', expected: 334 },

    // Exact tie: 5 / 2 = 2.5
    { fils: 5, divisor: 2, mode: 'round', expected: 3 }, // away
    { fils: -5, divisor: 2, mode: 'round', expected: -3 }, // away
    { fils: 5, divisor: 2, mode: 'floor', expected: 2 },
    { fils: 5, divisor: 2, mode: 'ceil', expected: 3 },
    { fils: -5, divisor: 2, mode: 'floor', expected: -3 },
    { fils: -5, divisor: 2, mode: 'ceil', expected: -2 },

    // Exact division (no remainder) — mode is irrelevant
    { fils: 900, divisor: 3, mode: 'floor', expected: 300 },
    { fils: -900, divisor: 3, mode: 'ceil', expected: -300 },
  ];
  it.each(cases)(
    'divide($fils / $divisor) mode=$mode → $expected',
    ({ fils, divisor, mode, expected }) => {
      expect(Money.fromFils(fils).divide(divisor, mode).fils).toBe(expected);
    },
  );

  it('default mode is round (half away from zero)', () => {
    expect(Money.fromFils(5).divide(2).fils).toBe(3);
    expect(Money.fromFils(-5).divide(2).fils).toBe(-3);
  });

  it('floor matches daily-allowance expectation (never overstates)', () => {
    // 1000 fils over 3 days → 333 (never 334)
    expect(Money.fromFils(1000).divide(3, 'floor').fils).toBe(333);
  });

  it('throws on divide by zero and non-finite divisors', () => {
    expect(() => Money.fromFils(100).divide(0)).toThrow();
    expect(() => Money.fromFils(100).divide(NaN)).toThrow();
    expect(() => Money.fromFils(100).divide(Infinity)).toThrow();
  });

  it('supports fractional divisors via real-number rounding', () => {
    // 100 / 0.5 = 200
    expect(Money.fromFils(100).divide(0.5).fils).toBe(200);
    // 10 / 0.3 = 33.33.. → floor 33
    expect(Money.fromFils(10).divide(0.3, 'floor').fils).toBe(33);
  });
});

describe('Money.fromAed — rounds major → fils to the nearest fil', () => {
  it('whole and simple fractional dirhams', () => {
    expect(Money.fromAed(1).fils).toBe(100);
    expect(Money.fromAed(12.5).fils).toBe(1250);
    expect(Money.fromAed(0).fils).toBe(0);
  });

  it('rounds to nearest fil, ties away from zero (binary-exact inputs)', () => {
    // 0.125 AED = 12.5 fils exactly (0.125 is exact in IEEE-754) → tie → away → 13.
    expect(Money.fromAed(0.125).fils).toBe(13);
    // 12.345 AED = 1234.5 fils exactly → tie → away → 1235.
    expect(Money.fromAed(12.345).fils).toBe(1235);
    // negatives symmetric.
    expect(Money.fromAed(-0.125).fils).toBe(-13);
    expect(Money.fromAed(-12.345).fils).toBe(-1235);
  });

  it('rounds clearly-below and clearly-above values', () => {
    // 1.004 AED = 100.4 fils → 100; 1.006 AED = 100.6 fils → 101.
    expect(Money.fromAed(1.004).fils).toBe(100);
    expect(Money.fromAed(1.006).fils).toBe(101);
  });

  it('handles classic float-representation values', () => {
    // 0.1 + 0.2 style: 19.99 AED must be exactly 1999 fils
    expect(Money.fromAed(19.99).fils).toBe(1999);
    expect(Money.fromAed(0.07).fils).toBe(7);
  });

  it('rejects non-finite input', () => {
    expect(() => Money.fromAed(NaN)).toThrow();
    expect(() => Money.fromAed(Infinity)).toThrow();
  });
});

describe('Money — no float drift on large values', () => {
  it('adds many large values exactly (integer fils, no drift)', () => {
    // 8,000 AED salary = 800,000 fils, added a million times → exact integer.
    let acc = Money.zero;
    const unit = Money.fromFils(800000);
    for (let i = 0; i < 1000; i += 1) {
      acc = acc.add(unit);
    }
    expect(acc.fils).toBe(800000 * 1000);
  });

  it('large integer multiply is exact', () => {
    // 12,345,678 fils * 52 — would lose precision only if done as a fractional path.
    expect(Money.fromFils(12345678).multiply(52).fils).toBe(12345678 * 52);
  });

  it('integer divide of a large balance uses exact remainder math', () => {
    // 99,999,937 (a prime-ish) / 7 — floor must be exact, not a float approximation.
    const n = 99999937;
    expect(Money.fromFils(n).divide(7, 'floor').fils).toBe(Math.floor(n / 7));
    expect(Money.fromFils(n).divide(7, 'ceil').fils).toBe(Math.ceil(n / 7));
  });

  it('weekly amortization path (×52 ÷12) on a large value stays integer', () => {
    // Mirrors the engine: multiply by 52 (exact), divide by 12 ceil.
    const weekly = Money.fromFils(525_25); // 525.25 AED weekly
    const monthly = weekly.multiply(52).divide(12, 'ceil');
    const exact = Math.ceil((52525 * 52) / 12);
    expect(monthly.fils).toBe(exact);
  });
});

describe('Money.format — locale-aware display', () => {
  it('en: whole dirhams by default, with currency', () => {
    const s = Money.fromFils(125000).format('en'); // 1,250 AED
    expect(s).toContain('1,250');
    expect(s).toContain('AED');
    // default withFraction:false → no decimals
    expect(s).not.toMatch(/\.\d/);
  });

  it('en: withFraction shows two fraction digits', () => {
    const s = Money.fromFils(125050).format('en', { withFraction: true }); // 1,250.50
    expect(s).toContain('1,250.50');
    expect(s).toContain('AED');
  });

  it('en: showCurrency:false drops the currency unit', () => {
    const s = Money.fromFils(125000).format('en', { showCurrency: false });
    expect(s).toContain('1,250');
    expect(s).not.toContain('AED');
  });

  it('en: respects a custom currency code', () => {
    const s = Money.fromFils(125000).format('en', { currency: 'USD' });
    // Symbol or code for USD should appear; the AED unit should not.
    expect(s).not.toContain('AED');
    expect(s).toMatch(/\$|USD/);
  });

  it('ar: renders the Arabic AED currency unit and the amount', () => {
    const s = Money.fromFils(125000).format('ar'); // includes د.إ
    expect(s).toContain('د.إ');
    // The numeric portion is present (modern CLDR `ar` uses Western digits by default).
    expect(s).toContain('1,250');
  });

  it('ar: withFraction shows fils, showCurrency:false drops the unit', () => {
    const withFils = Money.fromFils(125050).format('ar', { withFraction: true });
    expect(withFils).toContain('1,250.50');

    const noCurrency = Money.fromFils(125000).format('ar', { showCurrency: false });
    expect(noCurrency).not.toContain('د.إ');
    expect(noCurrency).toContain('1,250');
  });

  it('formats negative amounts', () => {
    const s = Money.fromFils(-125000).format('en');
    expect(s).toContain('1,250');
    expect(s).toMatch(/-|\(/); // minus sign or accounting parens
  });

  it('formats zero', () => {
    expect(Money.zero.format('en', { showCurrency: false })).toBe('0');
  });
});
