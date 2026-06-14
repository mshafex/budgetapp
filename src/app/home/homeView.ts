/**
 * HOME view-model — the PURE mapping from a computed `BudgetResult` (+ the user) to
 * everything the Home screen renders. No I/O, no React, no native modules, no `Date.now()`.
 *
 * Why this exists: the screen does the side-effects (DB read, engine call, navigation);
 * this function does the *decisions* (safe vs survival, which i18n keys, how money/dates
 * format). Keeping it pure lets the state-selection and formatting be unit-tested without
 * a database or a renderer (expo-sqlite is unavailable under jest).
 *
 * Conventions honoured:
 *  - R3 money: every money value goes through the `Money` helper; we never touch raw fils
 *    arithmetic here. `Money` instances are returned for the focal number; secondary money
 *    is pre-formatted via `Money.format(locale)`.
 *  - R4 i18n: user-facing copy is returned as { key, params } pairs — never literal English.
 *    The screen calls `t(key, params)`. Dates are localized via `Intl` (not money, not R3).
 *  - R6 PFM tone: we surface numbers + facts only; no "should" copy is produced here.
 */
import type { BudgetResult, Money as MoneyValue, User } from '@/contracts';
import type { BudgetState } from '@/contracts';
import { Money } from '@/money';

/** An i18n key plus its interpolation params; the screen resolves it with `t`. */
export interface I18nText {
  key: string;
  params?: Record<string, string | number>;
}

export interface HomeView {
  /** Drives ScreenContainer + BigNumber colour (safe vs survival). */
  state: BudgetState;
  /** Whether to render the survival banner. Mirrors `result.survival`. */
  survival: boolean;

  /** The focal number — already a Money instance for <BigNumber value={...} />. */
  dailyAllowance: MoneyValue;
  /** Caption under the big number (safe vs survival copy). */
  caption: I18nText;

  /** Secondary facts (labels are keys; values are pre-formatted, localized strings). */
  daysLeft: I18nText;
  remaining: { label: I18nText; value: string };
  spent: { label: I18nText; value: string };
  /** Localized cycle date range, e.g. "14 Jun – 1 Jul". */
  cycleRange: I18nText;

  /**
   * Survival banner data — present only when `survival` is true.
   *  - limit: the tightened daily limit (== the big number) as a formatted string.
   *  - threshold: the user's configured survival threshold as a formatted string.
   */
  banner: {
    title: I18nText;
    body: I18nText;
    limitLabel: I18nText;
    limitValue: string;
    thresholdLabel: I18nText;
    thresholdValue: string;
  } | null;
}

/**
 * Localize an ISO 'YYYY-MM-DD' date to a short, month/day string for the cycle range.
 * Parsed as UTC (matching the engine, which treats `today`/cycle dates as UTC) so the
 * displayed day never drifts by a timezone. Falls back to the raw ISO string if the
 * platform `Intl` lacks date formatting.
 */
export function formatCycleDate(iso: string, locale: string): string {
  const ms = Date.parse(`${iso}T00:00:00Z`);
  if (Number.isNaN(ms)) return iso;
  try {
    return new Intl.DateTimeFormat(locale, {
      day: 'numeric',
      month: 'short',
      timeZone: 'UTC',
    }).format(new Date(ms));
  } catch {
    return iso;
  }
}

/**
 * Map an engine result + the user profile to the Home view-model for `locale`.
 * Pure: same inputs → same output. The big number and survival limit are the SAME value
 * (the daily allowance); survival merely tightens the framing, never the figure.
 *
 * `spentThisCycleMinor` is the engine *input* (sum of this cycle's expenses) — it is not
 * carried on `BudgetResult`, so the screen passes it through for the "spent this cycle" fact.
 */
export function toHomeView(
  result: BudgetResult,
  user: User,
  spentThisCycleMinor: number,
  locale: string,
): HomeView {
  const survival = result.survival;
  const state: BudgetState = survival ? 'survival' : 'safe';

  const dailyAllowance = Money.fromFils(result.dailyAllowanceMinor);
  const remaining = Money.fromFils(result.remainingMinor);
  const spent = Money.fromFils(spentThisCycleMinor);
  const threshold = Money.fromFils(user.survivalThresholdMinor);

  const cycleRange: I18nText = {
    key: 'home.cycleRange',
    params: {
      start: formatCycleDate(result.cycleStart, locale),
      end: formatCycleDate(result.cycleEnd, locale),
    },
  };

  return {
    state,
    survival,
    dailyAllowance,
    caption: { key: survival ? 'home.survivalCaption' : 'home.safeCaption' },
    daysLeft: { key: 'home.daysLeft', params: { count: result.daysLeft } },
    remaining: {
      label: { key: 'home.remainingLabel' },
      value: remaining.format(locale),
    },
    spent: {
      label: { key: 'home.spentLabel' },
      value: spent.format(locale),
    },
    cycleRange,
    banner: survival
      ? {
          title: { key: 'survival.bannerTitle' },
          body: { key: 'survival.bannerBody' },
          limitLabel: { key: 'survival.limitLabel' },
          limitValue: dailyAllowance.format(locale),
          thresholdLabel: { key: 'survival.thresholdLabel' },
          thresholdValue: threshold.format(locale),
        }
      : null,
  };
}
