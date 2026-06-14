# WORKING.md

**Live project state. Update this every session — it is how the next session knows where things stand.**

---

## Status
🟢 Phase 2 complete — core modules (money, engine, db, theme, components, locales) merged to
`main`. tsc clean, 154 jest tests pass. GATE 2 passed. Next: Phase 3 screens.

## Current focus
Phase 3 — screens fan-out as parallel worktree PRs against frozen contracts + merged
primitives: ONBOARDING (salary→fixed→payday), HOME (The Number + survival state),
LOGGING (add expense ≤2 taps). Then Phase 4: wire `index`/`_layout` routing, e2e smoke,
Arabic RTL pass, COMPLETION_REPORT.

## Task checklist

### Phase 1 — Foundation
- [x] Scaffold Expo + TypeScript project, Expo Router (SDK 56, src/ layout)
- [x] Install + configure Drizzle ORM with expo-sqlite (deps + config plugin)
- [x] Configure i18n (AR + EN) and RTL layout (i18next + expo-localization + I18nManager)
- [x] Set up Jest (jest-expo preset, sanity test green)
- [x] Implement `Money` helper (integer fils) + tests (ENGINE, PR #2)

### Phase 2 — Core (pure, tested before any screen) — DONE
- [x] Define DB schema (User, FixedItem, Expense, Cycle) via Drizzle (DATA, PR #1)
- [x] Implement budget engine (disposable, days_left, remaining, daily_allowance, survival_mode) (ENGINE, PR #2)
- [x] Engine tests: past pay date rollover, days_left clamp, negative remaining, mid-cycle install, zero fixed expenses (94 tests)
- [x] Theme tokens, AR+EN strings (77 keys ×2), shared UI primitives (DESIGN, PR #3)

### Phase 3 — Screens
- [ ] Onboarding (salary → fixed expenses → pay date)
- [ ] Home / "The Number" (state-driven: safe vs survival, distinct colors)
- [ ] Expense logging (≤2 taps)
- [ ] Survival Mode state + warning UI

---

## Decisions log
*(Seeded from the plan. Append new decisions with date + reason.)*
- Stack locked: Expo/RN + TS, Expo Router, Drizzle + expo-sqlite, no backend.
- Money stored as integer fils; all math through `Money` helper.
- Offline-first; local DB is single source of truth.
- PFM-only: no advice, no money movement; payoff features framed as calculators.
- Engine is pure + fully tested before screens.
- AR + EN with full RTL from the start.
- 2026-06-14: Git identity for this repo set LOCAL to `mshafex <mshafex@gmail.com>` (personal, not work `aqar.fm`). Remote, when created, uses SSH host alias `github-mshafex` → `git@github-mshafex:mshafex/<repo>.git`.
- 2026-06-14: Expo SDK 56 (RN 0.85.3, React 19.2, TS 6). `src/` layout, `@/*`→`src/*` alias; routes under `src/app/`. Module dirs: `src/{money,engine,db,theme,i18n,components}`.
- 2026-06-14: Orchestration = worktree-per-unit + PR fan-out (user choice), applied PER PHASE with barriers (screens depend on contracts + primitives, so units are not all independent). Remote on `github-mshafex`, push approved.
- 2026-06-14: i18n = i18next + react-i18next + expo-localization; RTL via `I18nManager.allowRTL/forceRTL` in `src/i18n`. Jest via `jest-expo` preset. `tsconfig` pins `types: ["jest","node"]` (Expo bundler base suppresses auto @types).
- 2026-06-14 (GATE 2): Phase 2 merged via 3 squashed PRs. Worker decisions to remember: Money `round`/`fromAed` use half-away-from-zero; daily-allowance path uses `floor`. `ExpenseInput.note` is required (`string|null`) — callers pass `null` explicitly. expo-sqlite native I/O is NOT unit-tested in jest (node) — pure mappers are; real DB I/O verified at Phase 4. DESIGN palette: safe = teal `#3FB6A8`, survival = amber-red `#E5544B` (opposite hues, not brightness-dependent). `repository` is a factory (`createRepository(db)`) with a default instance exported from `@/db`.

## Deferred (do NOT build — parking lot)
- Bank sync / auto-import (needs Open Finance / licensed TPP — much later phase)
- Debt payoff optimizer (frame as calculator if/when built)
- Affiliate / partner referrals (licensed remittance only, post-launch)
- Multi-currency conversion engine
- AI advisor / insights
- Cloud sync, accounts/login, push notifications, social

## Open questions
- App name not chosen. Using placeholder slug `budgetapp` (app.json name "BudgetApp"); rename when final name picked.
- Survival threshold: user-set vs sensible default? (default for v1, revisit.)
- Remote/PRs: `gh` CLI not installed; needs auth as personal `mshafex` (device login or PAT) before repo creation + PR fan-out. SSH push as `mshafex` already verified working.

## Session log
*(Append one entry per session: date — what changed — what's next.)*
- 2026-06-14 — Phase 0 bootstrap. Scaffolded Expo SDK 56 (Router/TS), added Drizzle+expo-sqlite, i18next+react-i18next+expo-localization (+RTL), Jest. Renamed app → budgetapp, reset example to minimal `src/app`. Verified `tsc`, `jest`, and metro ios export all green. Committed (`ed531ab`, tag `gate-0`), local only. Next: GATE 0 review → resolve `gh` auth → Phase 1 contracts → Phase 2 worktree fan-out.
- 2026-06-14 — GATE 0 review passed; chose worktree+PR model + public GitHub repo on `github-mshafex`. Repo: https://github.com/mshafex/budgetapp (public). Phase 1 contracts frozen (`gate-1`, `99a7ae0`). Phase 2: 3 parallel worktree workers → PRs #1 (data), #2 (engine), #3 (design), all squash-merged to `main` (`e947c25`, tag `gate-2`). Integrated `tsc` clean + 154 jest tests pass. Next: Phase 3 screens fan-out, then Phase 4 integration.
