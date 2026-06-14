# CLAUDE.md

Entry point for every session. Read this first, then `WORKING.md` for current state.

## What this project is
A mobile budgeting app for GCC paycheck-to-paycheck workers (salary 2,000–8,000 AED).
**The entire product is one question, answered well:** *"How much can I safely spend today?"*
Serious, numbers-first tone. Not cheerful, not gamified.

## Session protocol (follow every time)
1. Read `RULES.md` — these are inviolable. If a request conflicts with a rule, stop and flag it.
2. Read `WORKING.md` — this is the current state: what's done, what's next, open questions.
3. Consult `PATTERNS.md` before writing code, `ANTIPATTERNS.md` before you're tempted.
4. Do the work in small, reviewable commits.
5. **Before you finish:** update `WORKING.md` — move completed tasks, log decisions, append a session note. The next session depends entirely on this file being accurate.

## File map
| File | Role | Changes? |
|---|---|---|
| `CLAUDE.md` | This file. Identity + protocol. | Rarely |
| `RULES.md` | Hard constraints. Never violate. | Rarely |
| `PATTERNS.md` | How to build things here. | Occasionally |
| `ANTIPATTERNS.md` | What never to do. | Occasionally |
| `WORKING.md` | Live state, tasks, decisions, log. | **Every session** |

## Definition of done (any task)
- Matches the relevant pattern, breaks no rule.
- Money logic has passing Jest tests including edge cases.
- All user-facing strings go through i18n (AR + EN), RTL verified.
- `WORKING.md` updated.

## When unsure
Ask **one** focused question rather than guessing or expanding scope. A wrong
assumption that ships is more expensive than a question.
