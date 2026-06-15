/**
 * Pure glue for the paste-intake confirm flow (Capture C4, Bucket 2 feed 1).
 *
 * A parsed bank-alert is only ever a CANDIDATE (`ParsedTransaction`). The user reviews and may
 * edit it, then confirms. This module turns "the candidate + the user's edits" into the
 * `ExpenseInput` the repository persists. It is isolated from the React screen so the mapping
 * rules can be unit-tested without a renderer or the native expo-sqlite driver (unavailable
 * under jest/node).
 *
 * Invariants enforced here:
 *  - R8 (confirm-don't-assume): this function NEVER stores anything — it only shapes the input
 *    the screen saves AFTER an explicit confirm. The raw text is not carried into the expense;
 *    only the structured fields (amount, category, note) cross into the ledger.
 *  - A captured expense ALWAYS has `source: 'captured'` (counts toward spend, unlike 'recurring').
 *  - R3: `amountMinor` stays an integer number of fils; no float math.
 *  - R4-friendly: this module emits no user-facing strings; the screen owns all copy.
 *
 * No I/O, no side effects.
 */
import type { ExpenseCategory, ExpenseInput, ParsedTransaction } from '@/contracts';

/** Fallback category when the parser couldn't guess one and the user didn't pick. */
export const DEFAULT_CATEGORY: ExpenseCategory = 'food';

/**
 * The user's (possibly edited) values from the confirm card. Every field is optional: an absent
 * field falls back to the candidate's value (or a sensible default). This lets the screen pass
 * only what it tracks, and lets a caller express "no change" by omission.
 */
export interface CaptureEdits {
  amountMinor?: number;
  category?: ExpenseCategory;
  /** Free-text note (e.g. the merchant). Trimmed; blank → null on the resulting input. */
  note?: string;
}

/**
 * An amount is valid to confirm only when it is a positive integer number of fils.
 * Zero (a cleared field) and non-integer/non-finite values are rejected so the screen can keep
 * the user on the card. Mirrors the LOGGING screen's rule, plus an integer guard (R3).
 */
export function isAmountValid(amountMinor: number): boolean {
  return Number.isInteger(amountMinor) && amountMinor > 0;
}

/**
 * Normalize the free-text note for storage.
 * - Trims surrounding whitespace.
 * - Empty / whitespace-only → `null` (the contract's "no note" value), never `''`.
 */
export function normalizeNote(raw: string): string | null {
  const trimmed = raw.trim();
  return trimmed.length > 0 ? trimmed : null;
}

/**
 * The note the confirm card is seeded with: the parsed merchant, if any. (The raw text is
 * deliberately NOT used as the note — only the structured merchant field crosses into the ledger.)
 */
export function defaultNoteFromCandidate(candidate: ParsedTransaction): string {
  return candidate.merchant ?? '';
}

/**
 * Build the `ExpenseInput` to persist once the user confirms a candidate.
 *
 * Resolution order per field: explicit `edits` value → candidate value → default.
 * `source` is ALWAYS `'captured'` (never overridable). `createdAt` is intentionally omitted —
 * the data layer stamps it.
 */
export function candidateToExpenseInput(
  candidate: ParsedTransaction,
  edits: CaptureEdits = {},
): ExpenseInput {
  const amountMinor = edits.amountMinor ?? candidate.amountMinor;
  const category = edits.category ?? candidate.category ?? DEFAULT_CATEGORY;
  // An undefined note edit means "the screen didn't track it" → fall back to the merchant.
  // An explicit '' means the user cleared it → becomes null via normalizeNote.
  const rawNote = edits.note ?? defaultNoteFromCandidate(candidate);

  return {
    amountMinor,
    category,
    note: normalizeNote(rawNote),
    source: 'captured',
  };
}
