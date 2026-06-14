# ANTIPATTERNS.md

Never do these. Each maps to a rule or a hard-won lesson.

## Money
- ❌ Floats or `Number` for money math. Rounding drift in a budgeting app is fatal
  to trust. Integer fils only. (R3)
- ❌ Doing money arithmetic outside the `Money` helper.

## Scope
- ❌ Building anything outside the five MVP items. Deferred features (bank sync,
  debt optimizer, affiliate links, multi-currency conversion, AI advisor, social,
  cloud sync, push notifications) go in `WORKING.md` — not in code. (R1)
- ❌ "While I was in here I also added…" — stop, log it, move on.

## Regulatory / copy
- ❌ Telling the user what they "should" do with money. It's a calculator, not an
  advisor. (R6)
- ❌ Any remittance or money-movement feature.
- ❌ Cheerful/gamified tone ("Great job! 🎉"). The audience is stressed; honesty
  beats encouragement. Use direct, factual copy.

## Architecture
- ❌ Adding a backend, auth, or cloud sync in v1. Local SQLite is the truth. (R2, R5)
- ❌ Proposing stack swaps (different ORM, state lib, framework). Stack is locked.
- ❌ Network dependence for any core flow. Must work fully offline.

## Code health
- ❌ Hardcoded user-facing strings. Everything through i18n. (R4)
- ❌ Hardcoded left/right layout that breaks RTL. Use start/end.
- ❌ Duplicating cycle/date logic across screens. One source in engine/repository.
- ❌ Building screens before the engine is tested. (R7)
- ❌ Large multi-feature commits.

## Process
- ❌ Guessing when requirements are ambiguous. Ask one focused question.
- ❌ Ending a session without updating `WORKING.md`.
