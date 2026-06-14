/**
 * Pure form logic for the add-expense screen (LOGGING).
 *
 * Isolated from the React component so the rules can be unit-tested without a
 * renderer or the native DB driver (expo-sqlite is unavailable under jest/node).
 * No I/O, no side effects — just validation, normalization, and shaping the
 * `ExpenseInput` the repository expects.
 *
 * Money is integer fils throughout (R3); this module never touches floats.
 */
import type { ExpenseCategory, ExpenseInput } from '@/contracts';

/**
 * An expense is valid to save only when the amount is a positive number of fils.
 * Zero (the empty-input default) and any non-positive value are rejected so the
 * UI can surface `errors.amountTooLow`.
 */
export function isAmountValid(amountMinor: number): boolean {
  return Number.isFinite(amountMinor) && amountMinor > 0;
}

/**
 * Normalize the optional free-text note for storage.
 * - Trims surrounding whitespace.
 * - Empty / whitespace-only → `null` (the contract's "no note" value), never `''`.
 */
export function normalizeNote(raw: string): string | null {
  const trimmed = raw.trim();
  return trimmed.length > 0 ? trimmed : null;
}

/**
 * Build the `ExpenseInput` passed to `repository.addExpense`.
 * `createdAt` is intentionally omitted — the data layer stamps it.
 */
export function buildExpenseInput(args: {
  amountMinor: number;
  category: ExpenseCategory;
  note: string;
}): ExpenseInput {
  return {
    amountMinor: args.amountMinor,
    category: args.category,
    note: normalizeNote(args.note),
  };
}
