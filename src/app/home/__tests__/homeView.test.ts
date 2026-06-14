/**
 * Unit tests for the PURE Home view-model mapper (`toHomeView`) + `formatCycleDate`.
 *
 * These need no database and no renderer — that's the point of factoring the decisions
 * out of the screen. We assert the *semantic* outputs (state selection, i18n keys +
 * params, money carried as fils, banner presence) and that formatted strings match an
 * independent `Money.format(locale)` call, rather than pinning ICU/Node-specific output.
 */
import type { BudgetResult, User } from '@/contracts';
import { Money } from '@/money';

import { formatCycleDate, toHomeView } from '../homeView';

const baseUser: User = {
  id: 1,
  salaryMinor: 600000, // 6,000 AED
  payDay: 1,
  currency: 'AED',
  locale: 'en',
  survivalThresholdMinor: 5000, // 50 AED/day threshold
};

/** A comfortably-safe result: daily allowance well above the threshold. */
const safeResult: BudgetResult = {
  disposableMinor: 450000,
  remainingMinor: 300000,
  daysLeft: 15,
  dailyAllowanceMinor: 20000, // 200 AED/day > 50 AED threshold
  survival: false,
  cycleStart: '2026-06-01',
  cycleEnd: '2026-07-01',
};

/** A survival result: allowance below threshold. */
const survivalResult: BudgetResult = {
  disposableMinor: 450000,
  remainingMinor: 40000,
  daysLeft: 20,
  dailyAllowanceMinor: 2000, // 20 AED/day < 50 AED threshold
  survival: true,
  cycleStart: '2026-06-01',
  cycleEnd: '2026-07-01',
};

describe('toHomeView — state selection', () => {
  it('selects the safe state when not in survival', () => {
    const view = toHomeView(safeResult, baseUser, 150000, 'en');
    expect(view.state).toBe('safe');
    expect(view.survival).toBe(false);
  });

  it('selects the survival state when result.survival is true', () => {
    const view = toHomeView(survivalResult, baseUser, 410000, 'en');
    expect(view.state).toBe('survival');
    expect(view.survival).toBe(true);
  });

  it('mirrors the engine survival flag exactly (does not re-derive it)', () => {
    // Even if the numbers look "safe", the view trusts result.survival.
    const contrived: BudgetResult = { ...safeResult, survival: true };
    expect(toHomeView(contrived, baseUser, 0, 'en').state).toBe('survival');
  });
});

describe('toHomeView — caption copy', () => {
  it('uses the safe caption key in safe state', () => {
    expect(toHomeView(safeResult, baseUser, 0, 'en').caption.key).toBe('home.safeCaption');
  });

  it('uses the survival caption key in survival state', () => {
    expect(toHomeView(survivalResult, baseUser, 0, 'en').caption.key).toBe('home.survivalCaption');
  });
});

describe('toHomeView — the focal number (Money, integer fils)', () => {
  it('carries the daily allowance as a Money value in fils (no float math)', () => {
    const view = toHomeView(safeResult, baseUser, 0, 'en');
    expect(view.dailyAllowance.fils).toBe(safeResult.dailyAllowanceMinor);
  });

  it('formats secondary money via Money.format for the active locale', () => {
    const spentMinor = 150000;
    const view = toHomeView(safeResult, baseUser, spentMinor, 'en');
    // Match an independent Money.format() rather than a hardcoded ICU string.
    expect(view.remaining.value).toBe(Money.fromFils(safeResult.remainingMinor).format('en'));
    expect(view.spent.value).toBe(Money.fromFils(spentMinor).format('en'));
  });

  it('formats money with the Arabic locale when locale is ar', () => {
    const view = toHomeView(safeResult, baseUser, 0, 'ar');
    expect(view.remaining.value).toBe(Money.fromFils(safeResult.remainingMinor).format('ar'));
  });
});

describe('toHomeView — secondary facts', () => {
  it('passes daysLeft through as the count interpolation param', () => {
    const view = toHomeView(safeResult, baseUser, 0, 'en');
    expect(view.daysLeft.key).toBe('home.daysLeft');
    expect(view.daysLeft.params).toEqual({ count: safeResult.daysLeft });
  });

  it('labels remaining and spent with their i18n keys', () => {
    const view = toHomeView(safeResult, baseUser, 0, 'en');
    expect(view.remaining.label.key).toBe('home.remainingLabel');
    expect(view.spent.label.key).toBe('home.spentLabel');
  });

  it('builds a localized cycle range from cycleStart/cycleEnd', () => {
    const view = toHomeView(safeResult, baseUser, 0, 'en');
    expect(view.cycleRange.key).toBe('home.cycleRange');
    expect(view.cycleRange.params).toEqual({
      start: formatCycleDate(safeResult.cycleStart, 'en'),
      end: formatCycleDate(safeResult.cycleEnd, 'en'),
    });
  });
});

describe('toHomeView — survival banner', () => {
  it('is null in safe state', () => {
    expect(toHomeView(safeResult, baseUser, 0, 'en').banner).toBeNull();
  });

  it('is populated in survival state with the daily limit and the user threshold', () => {
    const view = toHomeView(survivalResult, baseUser, 0, 'en');
    expect(view.banner).not.toBeNull();
    const banner = view.banner!;
    expect(banner.title.key).toBe('survival.bannerTitle');
    expect(banner.body.key).toBe('survival.bannerBody');
    expect(banner.limitLabel.key).toBe('survival.limitLabel');
    expect(banner.thresholdLabel.key).toBe('survival.thresholdLabel');
    // Limit shown == the focal daily-allowance number; threshold == the user's setting.
    expect(banner.limitValue).toBe(Money.fromFils(survivalResult.dailyAllowanceMinor).format('en'));
    expect(banner.thresholdValue).toBe(Money.fromFils(baseUser.survivalThresholdMinor).format('en'));
  });
});

describe('formatCycleDate', () => {
  it('formats an ISO date to a short, localized day/month string', () => {
    // Don't pin the exact ICU output; assert it is non-empty and not the raw ISO string.
    const formatted = formatCycleDate('2026-06-14', 'en');
    expect(typeof formatted).toBe('string');
    expect(formatted.length).toBeGreaterThan(0);
    expect(formatted).not.toBe('2026-06-14');
  });

  it('does not drift across the day boundary (parses as UTC)', () => {
    // June 1 must render as the 1st, never May 31, regardless of the test runner's TZ.
    const formatted = formatCycleDate('2026-06-01', 'en');
    expect(formatted).toContain('1');
  });

  it('falls back to the raw string for an unparseable input', () => {
    expect(formatCycleDate('not-a-date', 'en')).toBe('not-a-date');
  });
});
