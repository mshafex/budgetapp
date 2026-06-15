/**
 * Repository implementation — the ONLY data access surface (PATTERNS: no raw queries
 * in screens/engine). Implements the frozen `@/contracts` `Repository` plus the additive
 * Bucket-1 methods (`RecurringRepository`, defined below — the contract is not edited).
 *
 * R2/R5: backed by local SQLite (single source of truth, offline-first).
 * R3: every amount is integer fils; arithmetic stays integer (see `sumSpendableMinor`).
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
import { computeDuePostings } from '@/engine';
import { and, asc, eq, gte, isNotNull, lt } from 'drizzle-orm';
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
  sumSpendableMinor,
  userToInsert,
} from './mappers';

/**
 * The `Repository` contract (frozen, LEAD-owned) plus the Bucket-1 recurring auto-post
 * surface. These two methods are additive — they extend the contract without editing it,
 * so contract consumers are unaffected and the factory stays type-checked.
 */
export interface RecurringRepository extends Repository {
  /**
   * `recurringKey`s of already-posted recurring expenses whose `createdAt` (the due date)
   * is in `[fromISO, toISO)` — feeds `computeDuePostings`' idempotency check.
   */
  listPostedRecurringKeys(fromISO: string, toISO: string): Promise<string[]>;
  /**
   * Post every recurring fixed item due in `[cycleStart, min(today, cycleEnd)]` that hasn't
   * been posted yet (Model A, source='recurring'). Pure scheduling is delegated to
   * `computeDuePostings`; this only reads the inputs and inserts the result. Idempotent —
   * returns the number of NEW postings inserted (0 on a re-run with nothing newly due).
   */
  postDueRecurring(today: string, cycleStart: string, cycleEnd: string): Promise<number>;
}

export function createRepository(db: Database): RecurringRepository {
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

    /**
     * Sum of expense amounts (fils) with createdAt in [fromISO, toISO), EXCLUDING
     * `source = 'recurring'`. Recurring postings are amortized fixed items recorded as
     * history (Model A); counting them here would double-charge against `disposable`.
     * 'manual' and 'captured' are included. The exclusion rule lives in the pure
     * `sumSpendableMinor` helper (unit-tested) so it stays in one place.
     */
    async sumExpensesMinor(fromISO: string, toISO: string): Promise<number> {
      const rows = db
        .select({ amountMinor: expenseTable.amountMinor, source: expenseTable.source })
        .from(expenseTable)
        .where(createdAtInRange(fromISO, toISO))
        .all();
      return sumSpendableMinor(rows);
    },

    /* --- Recurring auto-post (Bucket 1) ---------------------------- */

    async listPostedRecurringKeys(fromISO: string, toISO: string): Promise<string[]> {
      return selectPostedRecurringKeys(db, fromISO, toISO);
    },

    async postDueRecurring(
      today: string,
      cycleStart: string,
      cycleEnd: string,
    ): Promise<number> {
      // 1. Read the inputs the PURE scheduler needs.
      const fixedItems = db
        .select()
        .from(fixedItemTable)
        .orderBy(asc(fixedItemTable.id))
        .all()
        .map(rowToFixedItem);

      // Posted keys are dated by their due date (createdAt); the scheduler only proposes
      // due dates inside [cycleStart, min(today, cycleEnd)], so scanning [cycleStart, cycleEnd)
      // covers every key that could collide. Same query as listPostedRecurringKeys (one rule).
      const postedKeys = selectPostedRecurringKeys(db, cycleStart, cycleEnd);

      // 2. Pure scheduling — no I/O inside computeDuePostings.
      const duePostings = computeDuePostings({
        fixedItems,
        today,
        cycleStart,
        cycleEnd,
        postedKeys,
      });
      if (duePostings.length === 0) {
        return 0;
      }

      // 3. Insert the new postings. createdAt is the due date the scheduler set, so the
      // posting falls in the cycle it belongs to — expenseToInsert preserves it.
      for (const posting of duePostings) {
        db.insert(expenseTable).values(expenseToInsert(posting)).run();
      }
      return duePostings.length;
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
 * The recurringKeys already posted in [fromISO, toISO) — the single query behind both
 * `listPostedRecurringKeys` and `postDueRecurring`'s idempotency read (one place for the
 * rule, and `this`-free so a destructured method call can't break it). Synchronous, like the
 * rest of the expo-sqlite access; the public methods wrap it to satisfy the async contract.
 */
function selectPostedRecurringKeys(db: Database, fromISO: string, toISO: string): string[] {
  const rows = db
    .select({ recurringKey: expenseTable.recurringKey })
    .from(expenseTable)
    .where(
      and(
        eq(expenseTable.source, 'recurring'),
        isNotNull(expenseTable.recurringKey),
        createdAtInRange(fromISO, toISO),
      ),
    )
    .all();
  // The isNotNull predicate guarantees a string; the filter narrows the type for TS.
  return rows.map((r) => r.recurringKey).filter((k): k is string => k !== null);
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
