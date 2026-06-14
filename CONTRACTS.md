# CONTRACTS.md

**Frozen interfaces for parallel work. Owned by the LEAD. Do not edit during a unit's build.**

Every Phase 2/3 subagent codes against these. The TypeScript source of truth lives in
`src/contracts/*` and is imported as `@/contracts`. This file explains the **decisions and
semantics** behind those types.

## Escalation rule (inviolable)
A subagent that finds a contract is wrong, missing, or blocking does **not** change it.
It stops, reports the exact problem to the lead, and waits. The lead updates the contract +
this file, re-freezes, and re-briefs. This keeps parallel branches mergeable.

## Ownership map
| Area | Dir | Owner | Notes |
|---|---|---|---|
| Contracts | `src/contracts` | **LEAD** | Frozen. Import-only for everyone else. |
| Money | `src/money` | ENGINE | Implements `Money` + `MoneyStatic` (`@/money`). |
| Engine | `src/engine` | ENGINE | Implements `ComputeBudget` + `ResolveCycle` (`@/engine`). Pure. |
| Data | `src/db` | DATA | Drizzle schema + migrations + `Repository` impl (`@/db`). |
| Theme | `src/theme` | DESIGN | Implements `Theme` token values (`@/theme`). |
| i18n strings | `src/i18n/locales` | DESIGN | Fills en.json + ar.json per `I18nNamespace`. |
| Components | `src/components` | DESIGN | Implements primitives per `@/contracts` prop types. |
| Onboarding | `src/app/onboarding` | ONBOARDING | 3 steps. |
| Home + Survival | `src/app/home` | HOME | The Number; survival is a state of Home. |
| Logging | `src/app/log` | LOGGING | Add expense ≤ 2 taps. |
| Router shell | `src/app/_layout.tsx`, `src/app/index.tsx` | **LEAD** | Init + initial route. |
| i18n init | `src/i18n/index.ts` | **LEAD** | Wiring done in Phase 0/1; DESIGN only edits `locales/`. |

`src/i18n/index.ts` is shared wiring — DESIGN adds locale **content** under `locales/`, not the init.

## Money (`src/contracts/money.ts`)
- Integer **fils** only. 1 AED = 100 fils. Never floats for money (R3).
- `Money` is immutable; all arithmetic returns new `Money`.
- `divide`/`multiply` take an explicit `RoundingMode`. **Daily-allowance uses `floor`** so the
  app never tells the user they can spend more than is safe.
- `fromAed` rounds major→fils to nearest fil. Display only at the edge via `format(locale)`.

## Engine semantics (`src/contracts/budget.ts`) — v1 decisions
Pure functions, no I/O, no ambient clock. `today` is always an injected `'YYYY-MM-DD'` string.

1. **Cycle normalization (amortize).** Fixed items carry their own `cycle`. The engine converts
   each to a **monthly** amount: `monthly`→×1, `quarterly`→÷3, `yearly`→÷12, `weekly`→×52÷12.
   Each normalized amount is rounded **UP (ceil)** so `disposable` is never overstated.
   *(Rationale: spreads big infrequent bills evenly; a rent-due month doesn't crater the
   daily number. Alternative "reserve full amount in the due month" is explicitly NOT v1.)*
2. **Disposable.** `disposableMinor = salaryMinor − Σ amortizedFixedMonthly`.
3. **Pay-date calendar.** `payDay` is a day-of-month 1..31, **clamped to the month length**
   (payDay 31 in February → last day). `cycleStart` = most recent pay date ≤ `today`;
   `cycleEnd` = next pay date after `cycleStart` (exclusive). `daysLeft` = calendar days from
   `today` to `cycleEnd`, **clamped to ≥ 1** (so division is always safe; handles "today is
   pay day" and past-pay-date rollover).
4. **Remaining.** `remainingMinor = disposableMinor + carryoverMinor − spentThisCycleMinor`.
   `carryoverMinor` defaults to 0.
5. **Daily allowance.** `dailyAllowanceMinor = remaining ≤ 0 ? 0 : floor(remaining / daysLeft)`.
6. **Survival.** `survival = dailyAllowanceMinor < survivalThresholdMinor`.
7. **Carryover rollover is DEFERRED.** The math accepts `carryoverMinor`, but detecting a new
   cycle and snapshotting the leftover is a later DATA/Cycle concern. v1 passes 0 unless a
   Cycle row already holds one. Do not build auto-rollover now (scope, R1).

**Mandatory engine tests** (PATTERNS): past pay-date rollover, `daysLeft` clamp at the
boundary, negative remaining → allowance 0 + survival true, mid-cycle first install,
zero fixed expenses, and amortization of each `CycleKind`.

## Data (`src/contracts/entities.ts`, `repository.ts`)
- Drizzle + expo-sqlite; local DB is the single source of truth, offline-first (R2/R5).
- Tables mirror the entity interfaces; money columns are integer (`*Minor`).
- All access goes through the `Repository` interface — **no raw queries in screens** (PATTERNS).
- `User` is effectively a single-row profile (onboarding writes it).
- `Cycle` is a derived/cached row; see carryover note above.

## i18n (`src/contracts/i18n.ts`)
- `AppLocale = 'en' | 'ar'`, RTL for `ar`. `isRTL` + `RTL_LOCALES` are the single source.
- DESIGN populates en.json + ar.json under the `I18nNamespace` namespaces. No hardcoded
  user-facing strings anywhere (R4). Layout uses logical start/end, never left/right.

## Theme (`src/contracts/theme.ts`)
- DESIGN provides concrete token values. `safe` vs `survival` must read in < 0.5s.
- Serious, numbers-first palette — no celebratory/gamified styling (RULES, ANTIPATTERNS).

## Navigation (`src/contracts/navigation.ts`)
- File-based Expo Router routes per `ROUTES`. LEAD wires `_layout`/`index`; screen owners
  build only inside their route folder. `index` decides onboarding vs home from `getUser()`.

## Components (`src/contracts/components.ts`)
- `ScreenContainer`, `BigNumber`, `AmountInput`, `CategoryPicker`, `Button`. Screen owners
  consume these; they don't reimplement primitives. Props are frozen here.

## Regulatory line (R6 — applies to every unit)
PFM only. No advice copy ("you should…"), no money movement, no remittance transfer.
`remittance` is a tracking label. Payoff/savings features, if ever built, are user-run
calculators — out of scope for v1 regardless.
