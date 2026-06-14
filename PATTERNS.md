# PATTERNS.md

How to build things in this repo. Consult before writing code.

## Money
- Store as `Int` fils. Define a `Money` type/helper that owns all arithmetic,
  parsing, and formatting. UI never does raw math on money.
- Format for display at the very edge (render time), localized (AR/EN).
- Example surface: `Money.fromFils(n)`, `.add()`, `.subtract()`, `.divide(days)`,
  `.format(locale)`. Division rounds explicitly (define and test the rounding rule).

## The budget engine (pure, tested first)
- Pure functions, no I/O, no side effects. This is the product's core — keep it
  isolated and fully unit-tested before any UI exists.
- Core formulas:
  ```
  disposable      = salary − sum(fixed_expenses_for_cycle)
  days_left       = pay_date − today
  remaining       = disposable − spent_this_cycle
  daily_allowance = remaining / days_left          // Money.divide, defined rounding
  survival_mode   = daily_allowance < survival_threshold
  ```
- Edge cases that MUST have tests: past pay date (roll to next cycle),
  `days_left <= 0`, negative remaining, mid-cycle first install, zero fixed expenses.

## Data layer
- Drizzle schema mirrors the entities below. Access through small repository
  functions (`getUser`, `addExpense`, `currentCycle`…), never raw queries in UI.
- Entities:
  ```
  User      { id, salary_minor, pay_day, currency, locale, survival_threshold_minor }
  FixedItem { id, label, amount_minor, type, cycle }   // type: rent|loan|remittance|bill|other
  Expense   { id, amount_minor, category, note, created_at }
  Cycle     { id, start_date, pay_date, carryover_minor }   // derived/cached
  ```
- Cycle logic lives in one place (engine/repository), never duplicated in screens.

## Screens (Expo Router)
- Build order: onboarding → home → logging → survival mode.
- Home is **state-driven**: `safe` vs `survival` must be obvious in <0.5s via
  distinct color + copy. The big number is the focal point; minimal chrome.
- Logging is optimized for speed: amount + category, ≤2 taps, no friction.

## i18n / RTL
- All strings in locale files (AR + EN). Layouts use logical
  `start`/`end` (not left/right) so RTL works without per-component flips.

## Testing
- Jest. Engine and Money have full coverage including the edge cases above.
- Run tests before committing engine changes.

## Commits
- Small and scoped: `feat(engine): daily allowance calc`, `test(engine): past pay-date rollover`.
