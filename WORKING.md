# WORKING.md

**Live project state. Update this every session — it is how the next session knows where things stand.**

---

## Status
🟡 Phase 0 complete — scaffold builds, typechecks, and tests pass. At GATE 0 (human checkpoint).

## Current focus
At GATE 0. Next: Phase 1 — write `CONTRACTS.md` + frozen TS type stubs (Money, engine
I/O, DB entities, repository signatures, i18n namespaces, theme tokens, route map),
then fan out Phase 2 core (ENGINE / DATA / DESIGN) as parallel worktree PRs.
Blocked on: GitHub repo creation needs `gh` auth as personal user (see Open questions).

## Task checklist

### Phase 1 — Foundation
- [x] Scaffold Expo + TypeScript project, Expo Router (SDK 56, src/ layout)
- [x] Install + configure Drizzle ORM with expo-sqlite (deps + config plugin)
- [x] Configure i18n (AR + EN) and RTL layout (i18next + expo-localization + I18nManager)
- [x] Set up Jest (jest-expo preset, sanity test green)
- [ ] Implement `Money` helper (integer fils) + tests  ← Phase 2 ENGINE

### Phase 2 — Engine (pure, tested before any screen)
- [ ] Define DB schema (User, FixedItem, Expense, Cycle) via Drizzle
- [ ] Implement budget engine (disposable, days_left, remaining, daily_allowance, survival_mode)
- [ ] Engine tests: past pay date rollover, days_left ≤ 0, negative remaining, mid-cycle install, zero fixed expenses

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
