# Capture — native feeds handoff (C4b / C5 / C6)

_The non-native capture work is done, tested, and on `main`. The remaining feeds are native and
need your EAS account + a real device. This doc scopes each + the exact on-device test steps._

## What's done (buildable + verified here)
- **C1** recurring auto-post (Model A — amortize kept; postings tagged `source:'recurring'`, excluded from spend; idempotent).
- **C3** pure transaction parser + per-source UAE templates (`@/capture`).
- **C4a** paste intake → confirm flow (`/capture`, reachable from the Log screen's "Read a bank alert").
- **C3 baseline** manual quick-add (`/log`).
- 348 jest tests, tsc clean, bundles. The pipeline is:

  **raw string → `parseTransaction` (`@/capture`) → candidate → `/capture` confirm screen → `addExpense({ source: 'captured' })`**

  Any native source only needs to feed raw strings into that pipeline via the frozen
  `CaptureSource` interface (`@/contracts/capture`). The parser + confirm UI are reused unchanged.

## Why C4b/C5/C6 stop here
They need native modules + config plugins → an **EAS dev build** (not Expo Go) + **real-device**
testing. Per RULES R8 ("no unverified native claims") I will not write blind native code and
claim it works. One-time prereqs you run:

```bash
eas login            # your Expo account (mshafex)
eas init             # writes extra.eas.projectId into app.json
eas build --profile development -p android    # Android APK dev client (eas.json already set up)
# install the APK on a device/emulator, then:
npx expo start --dev-client
```

## C4b — Share-sheet (iOS Share Extension + Android Send intent) — do next
- **Lib:** `expo-share-intent` (config plugin) is the least-native path; or a custom plugin.
- **Build:** add the plugin to app.json; implement `ShareCaptureSource: CaptureSource` whose
  `subscribe` delivers shared text; route it into `/capture` (prefill the paste field → parser).
- **Device test:** from a banking SMS/app, Share → BudgetApp → confirm the text lands in
  `/capture`, parses, Confirm saves a `captured` expense, Home recomputes.

## C5 — On-device OCR receipt scan
- **Lib:** `expo-camera` + on-device text recognition — Android `@react-native-ml-kit/text-recognition`,
  iOS Vision (or `react-native-vision-camera` + frame processor). All recognition **on-device** (R8).
- **Build:** camera screen → recognize text → feed the text block to `parseTransaction` → `/capture`.
  Implement `OcrCaptureSource: CaptureSource`.
- **Device test:** photograph a receipt → extracted text → candidate → Confirm saves; verify nothing
  leaves the device (works in airplane mode).

## C6 — Notification listener (Android only, feature-flagged, LAST)
- **Lib:** custom Expo config plugin exposing Android `NotificationListenerService`. iOS:
  `isAvailable()` returns false (cannot read other apps' notifications).
- **Policy:** NO `READ_SMS` (R8). Off by default behind a settings flag; the user explicitly enables
  it and grants Notification access in system settings. Parse → candidate → confirm only; raw
  notification text never leaves the device (Play-policy requirement).
- **Build:** native module emitting posted-notification text → `NotificationCaptureSource: CaptureSource`
  → parser → `/capture`, behind the flag.
- **Device test (Android):** enable the flag + grant Notification access → trigger a bank push →
  a candidate appears for confirm; verify iOS shows the feature unavailable; verify on-device-only.

## Shared rules (all three)
- Implement the frozen `CaptureSource` (`@/contracts`); reuse the parser + `/capture` confirm flow.
- Ship each with a **mockable JS stub** so the pipeline is unit-tested without a device.
- **Confirm-don't-assume (R8):** every candidate goes through `/capture` confirm; nothing auto-saves.
- **On-device only:** no raw SMS/notification/receipt content is uploaded.

## Carry-over (unrelated to capture)
- Arabic-RTL runtime pass on device (static audit + LTR run done).
- Final app name + icons.
- Optional: fold C1's `listPostedRecurringKeys`/`postDueRecurring` into the `Repository` contract;
  add a captured-date field to `ExpenseInput` if you want the parsed date persisted.
