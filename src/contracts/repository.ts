/**
 * CONTRACT — repository surface. Frozen in Phase 1. Implemented by DATA in `src/db`.
 * Screens and engine callers use ONLY these functions — never raw queries (PATTERNS).
 * Local SQLite is the single source of truth; offline-first (R2/R5). All amounts are fils.
 */
import type {
  Cycle,
  Expense,
  ExpenseInput,
  FixedItem,
  FixedItemInput,
  User,
  UserInput,
} from './entities';

export interface Repository {
  // --- User (single-row profile written during onboarding) ---
  getUser(): Promise<User | null>;
  saveUser(input: UserInput): Promise<User>;
  updateUser(patch: Partial<UserInput>): Promise<User>;

  // --- Fixed items ---
  listFixedItems(): Promise<FixedItem[]>;
  addFixedItem(input: FixedItemInput): Promise<FixedItem>;
  removeFixedItem(id: number): Promise<void>;

  // --- Expenses ---
  addExpense(input: ExpenseInput): Promise<Expense>;
  listExpenses(opts?: { fromISO?: string; toISO?: string }): Promise<Expense[]>;
  /** Sum of expense amounts (fils) with createdAt in [fromISO, toISO). */
  sumExpensesMinor(fromISO: string, toISO: string): Promise<number>;

  // --- Cycle cache (derived/cached; see budget contract for carryover semantics) ---
  getCurrentCycle(): Promise<Cycle | null>;
  upsertCurrentCycle(cycle: Omit<Cycle, 'id'>): Promise<Cycle>;
}
