# RULES.md

Hard constraints. These are not suggestions. If a request conflicts with one,
stop and flag it before acting.

## R1 — Scope: MVP v1 (done) + the transaction-capture architecture (v1.x)
MVP v1 — built and verified:
1. Onboarding (3 screens): salary → fixed expenses → pay date.
2. Home / "The Number": safe daily allowance + days until payday.
3. Expense logging in ≤2 taps (amount + category).
4. Survival Mode: tighter limit + warning state when allowance drops below threshold.
5. Fully offline; no login, no accounts, no server.

Sanctioned next scope — the **transaction-capture architecture** (three-bucket model, see
PATTERNS.md), built strictly in the phased risk order and under R8. Anything else: add to
`WORKING.md` under **Deferred** and do NOT build it.

## R2 — Tech stack is locked (do not propose alternatives)
- React Native + Expo, Expo Router, TypeScript.
- Local SQLite via Drizzle ORM (`expo-sqlite`) is the **single source of truth**.
- **No backend, no server, no auth, no cloud sync** in v1.
- **Android-first:** the audience skews Android and auto-capture is Android-only/Android-best.
  Build + test Android first; keep iOS working but manual-only where capture isn't possible.
  Native capture requires an EAS dev build (not Expo Go).

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
- **No bank connection / Open Finance / account aggregation.** Capture is on-device only
  (notifications, share-sheet, OCR) — we never link a bank or pull statements via an API.
- Copy stays informational. Never tell the user what they "should" do with money.

## R7 — Working discipline
- Money/engine logic gets Jest tests **before** any screen is built.
- Small, reviewable commits. No big-bang drops.
- Ambiguity → ask one focused question, don't guess.
- Update `WORKING.md` before ending a session.

## R8 — Transaction capture (on-device, confirm-first) — non-negotiable
- **On-device only.** Raw SMS / notification / email / receipt content NEVER leaves the device
  and is NEVER uploaded. Only confirmed, structured fields (amount, merchant, date, category)
  are stored. Privacy promise + Play-policy requirement.
- **No `READ_SMS` / no SMS permissions.** We are not the default SMS handler; do not declare
  SMS permissions. Use notifications / share-sheet / OCR instead.
- **iOS cannot read SMS or other apps' notifications** — do not attempt it. iOS capture =
  share-sheet + OCR + manual only.
- **Confirm, don't assume.** A parsed transaction is a *candidate*: never silently added.
  Always propose it for one-tap confirm/edit. This protects the trust of "the number."
- **Pure parser, native behind an interface.** The transaction parser is pure JS (no platform
  code), tested in isolation. Each native capture method sits behind a clean TS interface so
  the engine + UI stay platform-agnostic.
- **Risk order.** Build capture feeds in increasing policy-risk order: share-sheet/paste →
  on-device OCR → notification-listener (Android-only, feature-flagged, LAST).
- **No unverified native claims.** Don't claim a native capture feature works if it wasn't run
  on a real device; deliver native module + config plugin + JS interface + mockable stub, then
  stop and specify exactly what to test on-device.
