# WORKING.md

**Live project state. Update this every session — it is how the next session knows where things stand.**

---

## Status
✅ MVP v1 complete (218 jest tests, tsc clean, verified live on iPhone 17 sim).
🟢 Capture: all buildable-here work DONE — C0, C1 (recurring), C3 (parser), C4a (paste→confirm),
manual quick-add. Merged to `main`, tsc clean, **348 jest tests**. Native feeds C4b/C5/C6
(share-sheet, OCR, notification-listener) are scoped + handed off in `CAPTURE_NATIVE_HANDOFF.md` —
they need the user's EAS account + a real device to build/verify (R8).

## Current focus
Capture's non-native work is complete (paste→confirm shipped, wired from Log). To proceed with the
native feeds (C4b share-sheet, C5 OCR, C6 notification-listener) I need `eas login` / `eas init` on
the user's Expo account + a real Android device/emulator — see `CAPTURE_NATIVE_HANDOFF.md`. Also
still open: Arabic-RTL runtime pass + final app name/icons (see `COMPLETION_REPORT.md`).

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

### Phase 3 — Screens — DONE
- [x] Onboarding (salary → fixed expenses → pay date) (PR #6)
- [x] Home / "The Number" (state-driven: safe vs survival, distinct colors) (PR #5)
- [x] Expense logging (≤2 taps) (PR #4)
- [x] Survival Mode state + warning UI (part of Home, PR #5)

### Capture architecture (v1.x) — three-bucket model (RULES R8, PATTERNS)
*(Phase numbers mirror the prompt: phase 2 = core screens, already done above.)*
- [x] **C0** EAS dev-build config (`eas.json`, `expo-dev-client`) + Android package id (commit 059662d)
- [x] **C1** Bucket 1: recurring auto-post scheduler (pure, Model A; idempotent; +48 tests) — PR #7; trigger wired in `src/app/index.tsx`
- [x] **C3** Bucket 2 core: pure transaction-parser + per-source UAE templates (+58 tests) — PR #8
- [x] **C4a** paste intake → parser → confirm flow (PR #9; route `/capture`, wired from Log)
- [ ] **C4b** share-sheet native (iOS extension + Android intent) — NATIVE: needs EAS+device (CAPTURE_NATIVE_HANDOFF.md)
- [ ] **C5** on-device OCR receipt scan — NATIVE: needs EAS+device (handoff)
- [ ] **C6** notification listener (Android-only, flagged) — NATIVE: needs EAS+device (handoff)
- [x] Bucket 3 baseline: manual quick-add ≤2 taps (done in MVP, PR #4)

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
- 2026-06-14 (Phase 3 prep): disabled `experiments.typedRoutes` in app.json — brittle across isolated worktrees (routes on sibling branches fail typecheck); navigate via the frozen `ROUTES` string map. Lead seeded `src/app/index.tsx` (initial routing via `getUser()`) + placeholder route files; screen owners replaced their own.
- 2026-06-14 (GATE 3): screens merged via PRs #4 (log), #5 (home), #6 (onboarding). Survival threshold v1 default = 2000 fils (20 AED/day), set in onboarding (`DEFAULT_SURVIVAL_THRESHOLD_MINOR`); not user-editable in v1. Onboarding worker stopped after code-review without committing — lead salvaged its worktree, applied its 4 findings, and shipped PR #6. Hardened `jest.config.js` with `roots: ['<rootDir>/src']` (transient worktrees under `.claude/` were being glob-matched into the run). `log.savedToast` i18n key currently unused (no toast dep in v1).
- 2026-06-15 (capture architecture): scope EXTENDED (R1 amended) to the three-bucket capture model, **Android-first**. (1) ELIMINATE = recurring auto-post (pure engine scheduler); (2) AUTO-CAPTURE = pure parser → candidates → **confirm-don't-assume** → feeds in risk order (share-sheet → OCR → notification-listener last, Android-only, flagged); (3) MANUAL quick-add (done). Hard rules in R8: on-device only (raw content never leaves device), no `READ_SMS`, no bank connection, native behind a TS interface, no unverified native claims. Native pieces need an EAS dev build (not Expo Go) + real-device testing. Build phases: C0 EAS/Android → C1 recurring → C3 parser → C4 share-sheet → C5 OCR → C6 notif-listener.

## Deferred (do NOT build — parking lot)
- Bank sync / Open Finance / account aggregation (licensed TPP) — explicitly NOT the capture
  model; capture is on-device only (R8). Still out of scope.
- Debt payoff optimizer (frame as calculator if/when built)
- Affiliate / partner referrals (licensed remittance only, post-launch)
- Multi-currency conversion engine
- AI advisor / insights
- Cloud sync, accounts/login, social, *sending* push notifications (the Android notification
  *listener* for capture IS in scope per R8 — that's reading, not sending)

## Open questions
- App name not chosen. Using placeholder slug `budgetapp` (app.json name "BudgetApp"); rename when final name picked.
- Survival threshold: user-set vs sensible default? (default for v1, revisit.)
- Remote/PRs: `gh` CLI not installed; needs auth as personal `mshafex` (device login or PAT) before repo creation + PR fan-out. SSH push as `mshafex` already verified working. (gh now installed + authed as mshafex; resolved.)
- EAS dev build needs the user's Expo account (`eas login`) to run cloud builds. Phase C0 only writes config (`eas.json` + dev-client dep); actually building/installing a dev client on a device is the user's step.
- Recurring auto-post (C1): RESOLVED 2026-06-15 — recurring items auto-post WITHOUT re-confirm (user-authored once); confirm-don't-assume applies only to Bucket-2 *parsed* candidates.
- Number model: RESOLVED 2026-06-15 — **keep Model A (amortize)**. Recurring items stay amortized into disposable (stable, pre-reserves rent — the tested/demoed number). C1 auto-posts them as `source='recurring'` expense records (history + no manual re-entry), and the spend sum EXCLUDES `source='recurring'` so they never double-count. Cash-flow/ledger model (B) rejected for v1 (tempts overspend before bills hit). Salary-as-income-record deferred.

## Session log
*(Append one entry per session: date — what changed — what's next.)*
- 2026-06-14 — Phase 0 bootstrap. Scaffolded Expo SDK 56 (Router/TS), added Drizzle+expo-sqlite, i18next+react-i18next+expo-localization (+RTL), Jest. Renamed app → budgetapp, reset example to minimal `src/app`. Verified `tsc`, `jest`, and metro ios export all green. Committed (`ed531ab`, tag `gate-0`), local only. Next: GATE 0 review → resolve `gh` auth → Phase 1 contracts → Phase 2 worktree fan-out.
- 2026-06-14 — GATE 0 review passed; chose worktree+PR model + public GitHub repo on `github-mshafex`. Repo: https://github.com/mshafex/budgetapp (public). Phase 1 contracts frozen (`gate-1`, `99a7ae0`). Phase 2: 3 parallel worktree workers → PRs #1 (data), #2 (engine), #3 (design), all squash-merged to `main` (`e947c25`, tag `gate-2`). Integrated `tsc` clean + 154 jest tests pass. Next: Phase 3 screens fan-out, then Phase 4 integration.
- 2026-06-14 — Phase 3: lead seeded route skeleton (`6481429`), then 3 worktree workers → PRs #4 (log), #5 (home), #6 (onboarding). Onboarding worker stalled post-review; lead salvaged + fixed + shipped it. All merged to `main` (`ad95d2c`, tag `gate-3`). Integrated tsc clean, 213 jest tests pass, full app bundles. Next: Phase 4 integration smoke + Arabic RTL pass + COMPLETION_REPORT.
- 2026-06-14 — Phase 4 (integration & polish): added headless e2e integration smoke (`src/__tests__/integration.smoke.test.ts`) wiring real onboarding→engine→Money→Home-view→log through safe→survival→overspend. Static RTL/i18n audit clean (no physical left/right in styles; en/ar key parity 77=77). Final: 218 tests green, tsc clean, app bundles. Wrote `COMPLETION_REPORT.md`. MVP v1 complete. Open: manual on-device UI smoke; final app name + icons; carryover rollover still deferred.
- 2026-06-15 — Live on-device smoke (iPhone 17 simulator). Built natively via `expo run:ios` after fixing a CocoaPods crash (shell needs `LANG=en_US.UTF-8`). Drove the real UI: onboarding (salary 3,000 → pay day 1) → Home **AED 188 "Safe"** → logged **2,800** → Home recomputed to **AED 12 "Survival mode"** (red + banner, threshold AED 20). Real expo-sqlite persistence + recompute-on-focus confirmed; figures match the engine exactly. `expo prebuild` added `ios.bundleIdentifier` + run scripts (committed; `ios/` stays gitignored). Web export unsupported (expo-sqlite `wa-sqlite.wasm`). Remaining: Arabic-RTL runtime pass.
- 2026-06-15 — Capture C4a (paste intake + confirm) via worktree PR #9 (+24 tests); lead wired `ROUTES.capture` + a "Read a bank alert" entry on the Log screen. Merged (`907637b`), 348 jest pass, bundles. Wrote `CAPTURE_NATIVE_HANDOFF.md` scoping the native feeds C4b/C5/C6 (share-sheet, OCR, notification-listener) + EAS prereqs + on-device test steps. STOP: those need the user's EAS account + a real device (R8) — handed off.
- 2026-06-15 — Capture C1 + C3 (pure phases) via 2 parallel worktree PRs. C1 (PR #7): recurring auto-post scheduler — Model A (amortize kept, `computeBudget` untouched; postings tagged `source='recurring'`, excluded from spend; idempotent UTC; +48 tests). C3 (PR #8): pure transaction parser + UAE bank templates (+58 tests; a ReDoS was caught + fixed in review). Merged to `main` (`5fd0f17`). Lead wired `postDueRecurring` at app start (`src/app/index.tsx`). Integrated tsc clean, 324 jest pass. Note: C1's 2 new repo methods are exposed via `RecurringRepository extends Repository` (frozen contract not edited — fold in later if wanted). Next: C4 share-sheet (native — stub + device handoff).
- 2026-06-15 — Capture architecture kickoff. Folded the three-bucket model + R8 hard rules into RULES / PATTERNS / ANTIPATTERNS / WORKING (R1 scope amended; capture is on-device only, confirm-first, Android-first). Phase C0: added `eas.json` (dev/preview/prod; dev = Android APK + iOS-simulator dev-client), `expo-dev-client` (~56.0.20), and `android.package` `com.mshafex.budgetapp`. tsc clean, 218 jest pass. PAUSED for review before C1 (recurring auto-post scheduler). Note: running an EAS dev build needs `eas login` (user's Expo account) + `eas init` to create the project id.
