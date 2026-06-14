/**
 * Onboarding draft state + pure helpers (ONBOARDING, owns src/app/onboarding/**).
 *
 * The three onboarding steps are SEPARATE Expo Router screens, so the in-progress answers
 * (salary, fixed costs, pay day) must live somewhere they all share. v1 uses a tiny module
 * singleton here — no external state library (none is in the locked stack, R2). The store is
 * intentionally minimal: set salary, add/remove fixed items, set pay day, read the draft,
 * and reset.
 *
 * Everything in this file is PURE / side-effect free apart from the in-memory store object
 * (no native imports, no DB, no React). That keeps validation, the store, and the
 * draft→contract-input mapping unit-testable under jest where expo-sqlite is unavailable.
 *
 * R3: all money is integer fils — salary and fixed-item amounts are kept as `*Minor`; this
 * file never does float math on money.
 */
import type {
  AppLocale,
  CycleKind,
  FixedItemInput,
  FixedItemType,
  UserInput,
} from '@/contracts';

/**
 * Default survival threshold for v1 (fils). 20.00 AED/day. The survival threshold is NOT
 * user-edited during v1 onboarding (see WORKING.md open question — default for v1, revisit);
 * the engine compares the daily allowance against it on Home.
 */
export const DEFAULT_SURVIVAL_THRESHOLD_MINOR = 2000;

/** Currency is fixed to AED in v1 (GCC audience, single currency — R1 scope). */
export const ONBOARDING_CURRENCY = 'AED';

/** Inclusive day-of-month bounds for a valid pay day. */
export const PAY_DAY_MIN = 1;
export const PAY_DAY_MAX = 31;

/** A fixed cost as captured in the draft. Shape mirrors `FixedItemInput` (no id yet). */
export interface DraftFixedItem {
  label: string;
  amountMinor: number;
  type: FixedItemType;
  cycle: CycleKind;
}

/** The full in-progress onboarding answer set. */
export interface OnboardingDraft {
  /** Monthly salary, fils. 0 means "not yet entered". */
  salaryMinor: number;
  fixedItems: DraftFixedItem[];
  /** Pay day-of-month 1..31, or null until entered. */
  payDay: number | null;
}

function emptyDraft(): OnboardingDraft {
  return { salaryMinor: 0, fixedItems: [], payDay: null };
}

/* ------------------------------------------------------------------ *
 * Validation (pure)
 * ------------------------------------------------------------------ */

/** i18n keys returned by the validators so screens stay free of hardcoded copy (R4). */
export type ValidationErrorKey =
  | 'errors.salaryInvalid'
  | 'errors.amountTooLow'
  | 'errors.payDayInvalid'
  | 'errors.nameRequired';

/**
 * Validate a monthly salary in fils. Must be a positive integer (> 0).
 * Returns an i18n error key, or `null` when valid.
 */
export function validateSalaryMinor(salaryMinor: number): ValidationErrorKey | null {
  if (!Number.isInteger(salaryMinor) || salaryMinor <= 0) {
    return 'errors.salaryInvalid';
  }
  return null;
}

/**
 * Validate a fixed-item amount in fils. Must be a positive integer (> 0) — a zero/blank
 * fixed cost is meaningless, so adding one is blocked (the list itself may stay empty).
 */
export function validateFixedAmountMinor(amountMinor: number): ValidationErrorKey | null {
  if (!Number.isInteger(amountMinor) || amountMinor <= 0) {
    return 'errors.amountTooLow';
  }
  return null;
}

/** Validate a fixed-item label. Must be non-empty after trimming. */
export function validateFixedLabel(label: string): ValidationErrorKey | null {
  if (label.trim().length === 0) {
    return 'errors.nameRequired';
  }
  return null;
}

/**
 * Validate a pay day-of-month. Must be an integer in [1, 31]. The engine clamps the day to
 * the actual month length (e.g. 31 → 30/28); onboarding only enforces the legal range.
 * Returns an i18n error key, or `null` when valid.
 */
export function validatePayDay(payDay: number | null): ValidationErrorKey | null {
  if (
    payDay === null ||
    !Number.isInteger(payDay) ||
    payDay < PAY_DAY_MIN ||
    payDay > PAY_DAY_MAX
  ) {
    return 'errors.payDayInvalid';
  }
  return null;
}

/**
 * Parse free-typed pay-day text into a day-of-month, or `null` if it isn't a plain integer.
 * Only Western digits are accepted (the day field is a small bounded integer, not money);
 * any non-digit content yields `null` so {@link validatePayDay} reports the range error.
 */
export function parsePayDay(text: string): number | null {
  const trimmed = text.trim();
  if (trimmed === '' || !/^\d+$/.test(trimmed)) return null;
  const n = Number.parseInt(trimmed, 10);
  return Number.isSafeInteger(n) ? n : null;
}

/* ------------------------------------------------------------------ *
 * Draft -> contract inputs (pure mapping)
 * ------------------------------------------------------------------ */

/**
 * Map the validated draft + active locale to the `UserInput` the repository expects.
 * Currency and survival threshold are the fixed v1 defaults. The caller must validate
 * salary and pay day first; this asserts pay day is present so the persisted row is sound.
 */
export function draftToUserInput(draft: OnboardingDraft, locale: AppLocale): UserInput {
  if (draft.payDay === null) {
    throw new Error('draftToUserInput: payDay is required before persisting.');
  }
  return {
    salaryMinor: draft.salaryMinor,
    payDay: draft.payDay,
    currency: ONBOARDING_CURRENCY,
    locale,
    survivalThresholdMinor: DEFAULT_SURVIVAL_THRESHOLD_MINOR,
  };
}

/** Map a draft fixed item to the `FixedItemInput` the repository expects (label trimmed). */
export function draftFixedItemToInput(item: DraftFixedItem): FixedItemInput {
  return {
    label: item.label.trim(),
    amountMinor: item.amountMinor,
    type: item.type,
    cycle: item.cycle,
  };
}

/** Map every draft fixed item to its contract input shape, preserving order. */
export function draftFixedItemsToInputs(draft: OnboardingDraft): FixedItemInput[] {
  return draft.fixedItems.map(draftFixedItemToInput);
}

/* ------------------------------------------------------------------ *
 * The draft store (module singleton)
 * ------------------------------------------------------------------ */

/**
 * In-memory onboarding draft store. A plain observable singleton: screens read the current
 * draft, mutate via the setters, and subscribe so a step re-renders when an earlier step's
 * value changes. Cleared on finish (or if the user restarts onboarding).
 *
 * Not persisted — onboarding is a single short session; the DB is written only on finish.
 */
export interface OnboardingStore {
  getDraft(): OnboardingDraft;
  setSalaryMinor(salaryMinor: number): void;
  addFixedItem(item: DraftFixedItem): void;
  removeFixedItemAt(index: number): void;
  setPayDay(payDay: number | null): void;
  reset(): void;
  /** Subscribe to draft changes; returns an unsubscribe fn. */
  subscribe(listener: () => void): () => void;
}

function createOnboardingStore(): OnboardingStore {
  let draft = emptyDraft();
  const listeners = new Set<() => void>();

  const emit = () => {
    for (const l of listeners) l();
  };

  return {
    getDraft() {
      return draft;
    },
    setSalaryMinor(salaryMinor: number) {
      draft = { ...draft, salaryMinor };
      emit();
    },
    addFixedItem(item: DraftFixedItem) {
      draft = { ...draft, fixedItems: [...draft.fixedItems, item] };
      emit();
    },
    removeFixedItemAt(index: number) {
      if (index < 0 || index >= draft.fixedItems.length) return;
      draft = {
        ...draft,
        fixedItems: draft.fixedItems.filter((_, i) => i !== index),
      };
      emit();
    },
    setPayDay(payDay: number | null) {
      draft = { ...draft, payDay };
      emit();
    },
    reset() {
      draft = emptyDraft();
      emit();
    },
    subscribe(listener: () => void) {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
  };
}

/** App-wide onboarding draft singleton shared across the three step screens. */
export const onboardingStore: OnboardingStore = createOnboardingStore();
