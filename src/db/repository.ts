/**
 * Repository implementation — the ONLY data access surface (PATTERNS: no raw queries
 * in screens/engine). Implements `@/contracts` `Repository` exactly.
 *
 * R2/R5: backed by local SQLite (single source of truth, offline-first).
 * R3: every amount is integer fils; arithmetic stays integer (see `sumAmountsMinor`).
 *
 * `createRepository` is a factory over the (sync, native) drizzle handle so wiring is
 * explicit and the impl is decoupled from the singleton. The expo-sqlite driver runs
 * synchronously; each method wraps the sync calls in an `async` function to satisfy the
 * Promise-returning contract. PURE row<->domain logic lives in `./mappers`.
 */
import type {
  Cycle,
  Expense,
  ExpenseInput,
  FixedItem,
  FixedItemInput,
  Repository,
  User,
  UserInput,
} from '@/contracts';
import { and, asc, eq, gte, lt } from 'drizzle-orm';
import type { Database } from './client';
import { cycleTable, expenseTable, fixedItemTable, userTable } from './schema';
import {
  applyUserPatch,
  cycleToInsert,
  expenseToInsert,
  fixedItemToInsert,
  rowToCycle,
  rowToExpense,
  rowToFixedItem,
  rowToUser,
  sumAmountsMinor,
  userToInsert,
} from './mappers';

export function createRepository(db: Database): Repository {
  return {
    /* --- User (single-row profile) --------------------------------- */

    async getUser(): Promise<User | null> {
      const row = db.select().from(userTable).limit(1).get();
      return row ? rowToUser(row) : null;
    },

    async saveUser(input: UserInput): Promise<User> {
      // `user` is a single-row profile: replace the existing row rather than
      // inserting a duplicate that getUser()/updateUser() (which target the first
      // row) would silently ignore. Mirrors upsertCurrentCycle.
      const existing = db.select().from(userTable).limit(1).get();
      const values = userToInsert(input);
      const row = existing
        ? db
            .update(userTable)
            .set(values)
            .where(eq(userTable.id, existing.id))
            .returning()
            .get()
        : db.insert(userTable).values(values).returning().get();
      return rowToUser(row);
    },

    async updateUser(patch: Partial<UserInput>): Promise<User> {
      const current = db.select().from(userTable).limit(1).get();
      if (!current) {
        throw new Error('updateUser: no user row exists; call saveUser first.');
      }
      const row = db
        .update(userTable)
        .set(applyUserPatch(rowToUser(current), patch))
        .where(eq(userTable.id, current.id))
        .returning()
        .get();
      return rowToUser(row);
    },

    /* --- Fixed items ----------------------------------------------- */

    async listFixedItems(): Promise<FixedItem[]> {
      const rows = db
        .select()
        .from(fixedItemTable)
        .orderBy(asc(fixedItemTable.id))
        .all();
      return rows.map(rowToFixedItem);
    },

    async addFixedItem(input: FixedItemInput): Promise<FixedItem> {
      const row = db
        .insert(fixedItemTable)
        .values(fixedItemToInsert(input))
        .returning()
        .get();
      return rowToFixedItem(row);
    },

    async removeFixedItem(id: number): Promise<void> {
      db.delete(fixedItemTable).where(eq(fixedItemTable.id, id)).run();
    },

    /* --- Expenses -------------------------------------------------- */

    async addExpense(input: ExpenseInput): Promise<Expense> {
      const row = db
        .insert(expenseTable)
        .values(expenseToInsert(input))
        .returning()
        .get();
      return rowToExpense(row);
    },

    async listExpenses(opts?: {
      fromISO?: string;
      toISO?: string;
    }): Promise<Expense[]> {
      const rows = db
        .select()
        .from(expenseTable)
        .where(expenseRangeWhere(opts?.fromISO, opts?.toISO))
        .orderBy(asc(expenseTable.createdAt))
        .all();
      return rows.map(rowToExpense);
    },

    /** Sum of expense amounts (fils) with createdAt in [fromISO, toISO). */
    async sumExpensesMinor(fromISO: string, toISO: string): Promise<number> {
      const rows = db
        .select({ amountMinor: expenseTable.amountMinor })
        .from(expenseTable)
        .where(createdAtInRange(fromISO, toISO))
        .all();
      return sumAmountsMinor(rows.map((r) => r.amountMinor));
    },

    /* --- Cycle cache (single derived row) -------------------------- */

    async getCurrentCycle(): Promise<Cycle | null> {
      const row = db.select().from(cycleTable).limit(1).get();
      return row ? rowToCycle(row) : null;
    },

    async upsertCurrentCycle(cycle: Omit<Cycle, 'id'>): Promise<Cycle> {
      const existing = db.select().from(cycleTable).limit(1).get();
      const values = cycleToInsert(cycle);
      const row = existing
        ? db
            .update(cycleTable)
            .set(values)
            .where(eq(cycleTable.id, existing.id))
            .returning()
            .get()
        : db.insert(cycleTable).values(values).returning().get();
      return rowToCycle(row);
    },
  };
}

/** Half-open `createdAt ∈ [fromISO, toISO)` predicate. Single source of the range semantics. */
function createdAtInRange(fromISO: string, toISO: string) {
  return and(gte(expenseTable.createdAt, fromISO), lt(expenseTable.createdAt, toISO));
}

/**
 * Build the optional filter for `listExpenses`: full `[from, to)` range when both bounds
 * are given, an open lower/upper bound when only one is, or `undefined` (select-all) when
 * neither is present.
 */
function expenseRangeWhere(fromISO?: string, toISO?: string) {
  if (fromISO !== undefined && toISO !== undefined) {
    return createdAtInRange(fromISO, toISO);
  }
  if (fromISO !== undefined) return gte(expenseTable.createdAt, fromISO);
  if (toISO !== undefined) return lt(expenseTable.createdAt, toISO);
  return undefined;
}
