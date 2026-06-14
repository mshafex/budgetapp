# WORKING.md

**Live project state. Update this every session — it is how the next session knows where things stand.**

---

## Status
🔴 Not started — project not yet scaffolded.

## Current focus
Step 1: scaffold Expo + TS project, install deps (Expo Router, Drizzle, expo-sqlite,
i18n, Jest), set up RTL, and confirm this file reflects the plan. Pause for review
after scaffolding before building features.

## Task checklist

### Phase 1 — Foundation
- [ ] Scaffold Expo + TypeScript project, Expo Router
- [ ] Install + configure Drizzle ORM with expo-sqlite
- [ ] Configure i18n (AR + EN) and RTL layout
- [ ] Set up Jest
- [ ] Implement `Money` helper (integer fils) + tests

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

## Deferred (do NOT build — parking lot)
- Bank sync / auto-import (needs Open Finance / licensed TPP — much later phase)
- Debt payoff optimizer (frame as calculator if/when built)
- Affiliate / partner referrals (licensed remittance only, post-launch)
- Multi-currency conversion engine
- AI advisor / insights
- Cloud sync, accounts/login, push notifications, social

## Open questions
- App name not chosen (don't bake into package/file names until decided).
- Survival threshold: user-set vs sensible default? (default for v1, revisit.)

## Session log
*(Append one entry per session: date — what changed — what's next.)*
- _(none yet)_
