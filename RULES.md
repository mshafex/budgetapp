# RULES.md

Hard constraints. These are not suggestions. If a request conflicts with one,
stop and flag it before acting.

## R1 — Scope is frozen to MVP v1
Build **only** these five things:
1. Onboarding (3 screens): salary → fixed expenses → pay date.
2. Home / "The Number": safe daily allowance + days until payday.
3. Expense logging in ≤2 taps (amount + category).
4. Survival Mode: tighter limit + warning state when allowance drops below threshold.
5. Fully offline; no login, no accounts, no server.

Any other feature idea → add to `WORKING.md` under **Deferred** and do NOT build it.

## R2 — Tech stack is locked (do not propose alternatives)
- React Native + Expo, Expo Router, TypeScript.
- Local SQLite via Drizzle ORM (`expo-sqlite`) is the **single source of truth**.
- **No backend, no server, no auth, no cloud sync** in v1.

## R3 — Money is always integer minor units
- Store and compute all money as `Int` fils. **Never** use floats/`Number` for money.
- All money flows through a single typed `Money` helper. No exceptions.

## R4 — Bilingual + RTL from the start
- Arabic and English, full RTL layout, from the first screen.
- No hardcoded user-facing strings — everything through i18n.

## R5 — Offline-first
- The app must be fully functional with no network. Local DB is authoritative.

## R6 — This is a PFM tool only (regulatory line — non-negotiable)
- Holds no funds, moves no money, gives no financial advice.
- Payoff/savings features are **calculators the user runs**, never "advice."
- **No remittance / money-movement features.** Track and categorize only.
- Copy stays informational. Never tell the user what they "should" do with money.

## R7 — Working discipline
- Money/engine logic gets Jest tests **before** any screen is built.
- Small, reviewable commits. No big-bang drops.
- Ambiguity → ask one focused question, don't guess.
- Update `WORKING.md` before ending a session.
