/**
 * CONTRACT — budget engine I/O. Frozen in Phase 1. Implemented by ENGINE in `src/engine`.
 * Pure functions only — no I/O, no Date.now() inside; `today` is always passed in.
 * All money fields are integer fils (R3).
 *
 * v1 semantics (decisions — see CONTRACTS.md §Engine semantics):
 *  - Fixed items are AMORTIZED to a monthly amount (quarterly/3, yearly/12, weekly*52/12),
 *    each rounded UP (ceil) so `disposable` is never overstated.
 *  - dailyAllowance = floor(remaining / daysLeft) — conservative, never overstates.
 *    If remaining <= 0, dailyAllowance is 0 (and survival is true).
 *  - daysLeft = calendar days from `today` to the next pay date, clamped to >= 1.
 *  - carryover is ADDED to remaining (may be negative). v1 callers pass 0 unless a Cycle
 *    snapshot exists; automatic rollover is DEFERRED (DATA/Cycle responsibility).
 */
import type { CycleKind } from './entities';

/** The fixed-item fields the engine needs (subset of FixedItem). */
export interface FixedItemForBudget {
  amountMinor: number;
  cycle: CycleKind;
}

export interface BudgetInput {
  salaryMinor: number;
  fixedItems: FixedItemForBudget[];
  spentThisCycleMinor: number;
  survivalThresholdMinor: number;
  /** 1..31. */
  payDay: number;
  /** ISO date 'YYYY-MM-DD'. */
  today: string;
  /** Default 0. */
  carryoverMinor?: number;
}

export interface BudgetResult {
  /** salary − amortized monthly fixed cost. May be negative. */
  disposableMinor: number;
  /** disposable + carryover − spentThisCycle. May be negative. */
  remainingMinor: number;
  /** Calendar days to next pay date, >= 1. */
  daysLeft: number;
  /** floor(remaining / daysLeft); 0 when remaining <= 0. */
  dailyAllowanceMinor: number;
  /** dailyAllowanceMinor < survivalThresholdMinor. */
  survival: boolean;
  /** ISO date — pay date that opened the current cycle. */
  cycleStart: string;
  /** ISO date — next pay date (cycle end, exclusive). */
  cycleEnd: string;
}

/** Signature ENGINE must export from `@/engine`. */
export type ComputeBudget = (input: BudgetInput) => BudgetResult;

/** Pure date resolution the engine owns; also useful to screens showing cycle info. */
export interface CycleDates {
  /** Pay date that opened the cycle containing `today` (<= today). */
  cycleStart: string;
  /** Next pay date strictly after cycleStart (cycle end, exclusive). */
  cycleEnd: string;
  /** Calendar days from `today` to cycleEnd, clamped to >= 1. */
  daysLeft: number;
}

/** Signature ENGINE must export from `@/engine`. */
export type ResolveCycle = (today: string, payDay: number) => CycleDates;
