/**
 * CONTRACT — i18n. Frozen in Phase 1. Strings provided by DESIGN in `src/i18n/locales`.
 * R4: AR + EN, no hardcoded user-facing strings; full RTL.
 */

export type AppLocale = 'en' | 'ar';

export const RTL_LOCALES: readonly AppLocale[] = ['ar'];

export function isRTL(locale: AppLocale): boolean {
  return RTL_LOCALES.includes(locale);
}

/**
 * Top-level translation namespaces. DESIGN fills en.json + ar.json with these objects;
 * screen owners reference keys within their namespace and never hardcode strings.
 */
export type I18nNamespace =
  | 'common' // app name, shared actions (save/next/cancel/done), units
  | 'onboarding' // salary / fixed-items / pay-date steps
  | 'home' // the number, days-left, cycle copy
  | 'survival' // survival-mode banner + tightened-limit copy
  | 'log' // add-expense screen
  | 'categories' // ExpenseCategory + FixedItemType labels
  | 'errors'; // validation + empty states
