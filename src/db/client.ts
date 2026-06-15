/**
 * expo-sqlite + Drizzle client.
 *
 * R2/R5: a single local SQLite file (`budget.db`) is the source of truth. No network.
 * SDK 56: the expo-sqlite driver is synchronous — `openDatabaseSync` + `db.execSync`.
 * The drizzle handle exposes sync query builders; the repository wraps them in async
 * functions to satisfy the Promise-returning `Repository` contract.
 *
 * NOTE: `expo-sqlite`'s native module is unavailable under jest (node). This file is
 * therefore imported only by the running app (and `src/db/index.ts`), never by unit
 * tests. Pure logic lives in `mappers.ts`, which has no native imports.
 */
import { openDatabaseSync } from 'expo-sqlite';
import { drizzle } from 'drizzle-orm/expo-sqlite';
import * as schema from './schema';

export const DATABASE_NAME = 'budget.db';

/** Raw expo-sqlite handle (single shared connection for the app's lifetime). */
export const sqlite = openDatabaseSync(DATABASE_NAME);

/** Drizzle database handle, typed against the full schema. */
export const db = drizzle(sqlite, { schema });

export type Database = typeof db;

/**
 * Idempotent bootstrap: create the four tables if absent, then bring an EXISTING on-device
 * database up to the current schema by adding any missing columns.
 *
 * The `CREATE TABLE IF NOT EXISTS` DDL mirrors `schema.ts` exactly (fresh installs get the
 * full shape, including the Bucket-1 columns). For databases created by an earlier build —
 * before `fixed_item.due_day` / `expense.source` / `expense.recurring_key` existed —
 * `migrateColumns()` adds the columns in place via `ALTER TABLE ADD COLUMN` with NO data
 * loss. Each fils amount stays an integer column (R3). Generated Drizzle migrations can
 * replace this later without touching the repository or callers.
 */
export function ensureSchema(): void {
  sqlite.execSync(`
    CREATE TABLE IF NOT EXISTS user (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      salary_minor INTEGER NOT NULL,
      pay_day INTEGER NOT NULL,
      currency TEXT NOT NULL DEFAULT 'AED',
      locale TEXT NOT NULL,
      survival_threshold_minor INTEGER NOT NULL
    );

    CREATE TABLE IF NOT EXISTS fixed_item (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      label TEXT NOT NULL,
      amount_minor INTEGER NOT NULL,
      type TEXT NOT NULL,
      cycle TEXT NOT NULL,
      due_day INTEGER
    );

    CREATE TABLE IF NOT EXISTS expense (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      amount_minor INTEGER NOT NULL,
      category TEXT NOT NULL,
      note TEXT,
      source TEXT NOT NULL DEFAULT 'manual',
      recurring_key TEXT,
      created_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS cycle (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      start_date TEXT NOT NULL,
      pay_date TEXT NOT NULL,
      carryover_minor INTEGER NOT NULL
    );

    CREATE INDEX IF NOT EXISTS idx_expense_created_at ON expense (created_at);
  `);

  // Migrate pre-existing on-device DBs (created before the Bucket-1 columns existed).
  migrateColumns();

  // Speeds up listPostedRecurringKeys' source/range scan; created after the column exists.
  sqlite.execSync(
    `CREATE INDEX IF NOT EXISTS idx_expense_source ON expense (source);`,
  );
}

/** A row of SQLite's `PRAGMA table_info(...)` (only the field we need is typed). */
interface TableInfoRow {
  name: string;
}

/** True if `table` already has a column named `column` (per PRAGMA table_info). */
function hasColumn(table: string, column: string): boolean {
  // `table` is a hard-coded identifier from this module, never user input — safe to inline.
  const rows = sqlite.getAllSync<TableInfoRow>(`PRAGMA table_info(${table});`);
  return rows.some((r) => r.name === column);
}

/**
 * Add any columns introduced after the original four-table schema. `ALTER TABLE ADD COLUMN`
 * is non-destructive: existing rows keep their data and take the column default. Each add is
 * guarded by a `PRAGMA table_info` check so this is safe to run on every launch (idempotent).
 */
function migrateColumns(): void {
  if (!hasColumn('fixed_item', 'due_day')) {
    sqlite.execSync(`ALTER TABLE fixed_item ADD COLUMN due_day INTEGER;`);
  }
  if (!hasColumn('expense', 'source')) {
    sqlite.execSync(
      `ALTER TABLE expense ADD COLUMN source TEXT NOT NULL DEFAULT 'manual';`,
    );
  }
  if (!hasColumn('expense', 'recurring_key')) {
    sqlite.execSync(`ALTER TABLE expense ADD COLUMN recurring_key TEXT;`);
  }
}
