/**
 * Money — the single surface for all money arithmetic, parsing, and formatting.
 *
 * Implements the frozen `Money` + `MoneyStatic` contract (`@/contracts/money`).
 *
 * R3: money is ALWAYS integer minor units (fils). 1 AED = 100 fils.
 * Never use floats/`Number` for money outside this module.
 *
 * Design notes:
 *  - Values are immutable; every operation returns a new `Money`.
 *  - Rounding (`multiply`/`divide`/`fromAed`) is explicit and correct for negatives.
 *    `'round'` is "round half away from zero" (symmetric — standard financial rounding),
 *    NOT JS `Math.round`'s asymmetric half-up.
 *  - Division by an integer divisor is computed with integer quotient + remainder so
 *    there is no floating-point drift even on very large balances.
 */
import type {
  Money as MoneyValue,
  MoneyFormatOptions,
  MoneyStatic,
  RoundingMode,
} from '@/contracts';

const FILS_PER_AED = 100;
const DEFAULT_CURRENCY = 'AED';

function assertInteger(fils: number): void {
  if (typeof fils !== 'number' || !Number.isFinite(fils) || !Number.isInteger(fils)) {
    throw new Error(`Money requires an integer number of fils, received: ${String(fils)}`);
  }
}

/** Round a real-number quotient/product to an integer per the rounding mode. */
function applyRounding(value: number, mode: RoundingMode): number {
  switch (mode) {
    case 'floor':
      return Math.floor(value);
    case 'ceil':
      return Math.ceil(value);
    case 'trunc':
      return Math.trunc(value);
    case 'round': {
      // Round half away from zero (symmetric for positives and negatives).
      return value < 0 ? -Math.round(-value) : Math.round(value);
    }
    default: {
      // Exhaustiveness guard — unreachable with a valid RoundingMode.
      const never: never = mode;
      throw new Error(`Unknown rounding mode: ${String(never)}`);
    }
  }
}

/**
 * Divide `numerator` (integer) by `divisor` (integer) and round per mode using
 * exact integer arithmetic — no floating point, so large balances never drift.
 */
function divideIntegers(numerator: number, divisor: number, mode: RoundingMode): number {
  // Truncated quotient toward zero, plus the exact remainder.
  const q = Math.trunc(numerator / divisor);
  const r = numerator - q * divisor;
  if (r === 0) {
    return q;
  }
  // Sign of the exact real quotient (numerator/divisor).
  const negative = numerator < 0 !== divisor < 0;
  switch (mode) {
    case 'trunc':
      return q;
    case 'floor':
      // Toward -infinity: a truncated-toward-zero negative quotient with a
      // remainder needs to step down by one.
      return negative ? q - 1 : q;
    case 'ceil':
      // Toward +infinity: a truncated positive quotient with a remainder steps up.
      return negative ? q : q + 1;
    case 'round': {
      // Compare twice the absolute remainder against the absolute divisor:
      // |2r| >= |divisor| rounds away from zero, ties (==) round away from zero.
      const twiceRem = Math.abs(r) * 2;
      const absDiv = Math.abs(divisor);
      const roundAway = twiceRem >= absDiv;
      if (!roundAway) {
        return q;
      }
      return negative ? q - 1 : q + 1;
    }
    default: {
      const never: never = mode;
      throw new Error(`Unknown rounding mode: ${String(never)}`);
    }
  }
}

class MoneyImpl implements MoneyValue {
  readonly fils: number;

  constructor(fils: number) {
    assertInteger(fils);
    // Normalize -0 to 0 so isZero / formatting / equality behave intuitively.
    this.fils = fils === 0 ? 0 : fils;
    Object.freeze(this);
  }

  add(other: MoneyValue): MoneyValue {
    return new MoneyImpl(this.fils + other.fils);
  }

  subtract(other: MoneyValue): MoneyValue {
    return new MoneyImpl(this.fils - other.fils);
  }

  multiply(scalar: number, mode: RoundingMode = 'round'): MoneyValue {
    if (typeof scalar !== 'number' || !Number.isFinite(scalar)) {
      throw new Error(`Money.multiply requires a finite scalar, received: ${String(scalar)}`);
    }
    // Integer scalar is exact; only fractional scalars need real-number rounding.
    if (Number.isInteger(scalar)) {
      return new MoneyImpl(this.fils * scalar);
    }
    return new MoneyImpl(applyRounding(this.fils * scalar, mode));
  }

  divide(divisor: number, mode: RoundingMode = 'round'): MoneyValue {
    if (typeof divisor !== 'number' || !Number.isFinite(divisor)) {
      throw new Error(`Money.divide requires a finite divisor, received: ${String(divisor)}`);
    }
    if (divisor === 0) {
      throw new Error('Money.divide by zero');
    }
    // Integer divisor → exact integer arithmetic (no float drift on big balances).
    if (Number.isInteger(divisor)) {
      return new MoneyImpl(divideIntegers(this.fils, divisor, mode));
    }
    return new MoneyImpl(applyRounding(this.fils / divisor, mode));
  }

  compare(other: MoneyValue): number {
    if (this.fils < other.fils) return -1;
    if (this.fils > other.fils) return 1;
    return 0;
  }

  isNegative(): boolean {
    return this.fils < 0;
  }

  isZero(): boolean {
    return this.fils === 0;
  }

  format(locale: string, opts: MoneyFormatOptions = {}): string {
    const { currency = DEFAULT_CURRENCY, withFraction = false, showCurrency = true } = opts;
    const fractionDigits = withFraction ? 2 : 0;
    // Convert to major units for display only, at the very edge.
    const major = this.fils / FILS_PER_AED;

    const formatOptions: Intl.NumberFormatOptions = {
      minimumFractionDigits: fractionDigits,
      maximumFractionDigits: fractionDigits,
    };
    if (showCurrency) {
      formatOptions.style = 'currency';
      formatOptions.currency = currency;
    } else {
      formatOptions.style = 'decimal';
    }
    return new Intl.NumberFormat(locale, formatOptions).format(major);
  }
}

/** The factory surface exported from `@/money` (satisfies `MoneyStatic`). */
export const Money: MoneyStatic = {
  fromFils(fils: number): MoneyValue {
    return new MoneyImpl(fils);
  },
  fromAed(aed: number): MoneyValue {
    if (typeof aed !== 'number' || !Number.isFinite(aed)) {
      throw new Error(`Money.fromAed requires a finite number, received: ${String(aed)}`);
    }
    // Major → fils, rounded to the nearest fil (half away from zero).
    return new MoneyImpl(applyRounding(aed * FILS_PER_AED, 'round'));
  },
  zero: new MoneyImpl(0),
};

export type { Money as MoneyValue } from '@/contracts';
