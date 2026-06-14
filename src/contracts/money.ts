/**
 * CONTRACT — Money. Frozen in Phase 1. Implemented by ENGINE in `src/money`.
 *
 * R3: all money is integer minor units (fils). 1 AED = 100 fils.
 * Never use floats/Number for storage or arithmetic — only through this surface.
 */

export type RoundingMode = 'floor' | 'ceil' | 'trunc' | 'round';

/** An immutable money value held as integer fils. */
export interface Money {
  /** Raw value in fils (always an integer). */
  readonly fils: number;

  add(other: Money): Money;
  subtract(other: Money): Money;

  /** Multiply by a unitless scalar. Rounds per mode (default 'round'). */
  multiply(scalar: number, mode?: RoundingMode): Money;

  /**
   * Divide by a unitless divisor. Rounds per mode.
   * Daily-allowance math uses 'floor' so the app never overstates what is safe to spend.
   */
  divide(divisor: number, mode?: RoundingMode): Money;

  /** Comparator: <0 if this < other, 0 if equal, >0 if this > other. */
  compare(other: Money): number;
  isNegative(): boolean;
  isZero(): boolean;

  /** Locale-aware display string, e.g. "1,250 AED" / "١٬٢٥٠ د.إ". */
  format(locale: string, opts?: MoneyFormatOptions): string;
}

export interface MoneyFormatOptions {
  /** ISO currency code; default 'AED'. */
  currency?: string;
  /** Show fils (2 fraction digits) vs whole dirhams. Default false (whole — for the big number). */
  withFraction?: boolean;
  /** Render the currency unit at all. Default true. */
  showCurrency?: boolean;
}

/** Factory surface ENGINE must export from `@/money`. */
export interface MoneyStatic {
  fromFils(fils: number): Money;
  /** Convenience: AED major units → fils, rounded to the nearest fil. */
  fromAed(aed: number): Money;
  readonly zero: Money;
}
