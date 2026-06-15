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

## Transaction capture — three-bucket model
Do NOT try to "detect every transaction." Three buckets:

**Bucket 1 — ELIMINATE (no capture tech, cross-platform, zero permissions).** Recurring items
(rent, remittance, loan, bills, salary) are entered once and auto-post on their due date via a
pure scheduler in the engine. Covers the largest part of the budget. Pure JS, fully tested.

**Bucket 2 — AUTO-CAPTURE digital transactions (confirm-first).** A shared, PURE
transaction-parser (per-source templates/regex → `{ amount, merchant, date, raw }`), built and
unit-tested in isolation FIRST, no platform code. Every parsed result is a CANDIDATE, proposed
to the user for one-tap confirm/edit — never silently added (R8). Feeds, in increasing policy
risk: (1) share-sheet/paste intake (both platforms) → (2) on-device OCR receipt scan (ML Kit on
Android / Vision on iOS; catches cash) → (3) notification listener (Android-only, config plugin,
feature-flagged, LAST).

**Bucket 3 — FRICTIONLESS MANUAL (always available, cross-platform).** Quick-add in ≤2 taps
(built), recent-merchant suggestions, home-screen widget, optional voice/Shortcuts later.

**Platform-interface pattern.** Each native capture method implements a clean TS interface (e.g.
`CaptureSource`) with a mockable stub for tests; the parser + engine + UI never import native
code directly. Android-first; iOS = share-sheet + OCR + manual only.

## Recurring auto-post (Bucket 1)
- A pure scheduler in the engine posts due recurring items into the cycle on/after their due
  date, **idempotent** (never double-posts). Edge cases that MUST have tests: due in the past
  (backfill from install), due today, multiple periods missed, cycle boundary.

## Testing
- Jest. Engine, Money, and the transaction parser have full coverage including the edge cases above.
- The parser and recurring scheduler are pure and tested before any platform/native code.
- Native capture modules ship with a mockable stub; real behaviour is verified on a device.
- Run tests before committing engine/parser changes.

## Commits
- Small and scoped: `feat(engine): daily allowance calc`, `test(engine): past pay-date rollover`.
