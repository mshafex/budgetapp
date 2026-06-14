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
 * Idempotent v1 bootstrap: create the four tables if they do not exist yet.
 *
 * This is a deliberately simple "create if absent" step, not a migration system —
 * appropriate for a fresh offline-only v1. Generated Drizzle migrations can replace
 * this later without touching the repository or callers. The DDL mirrors `schema.ts`
 * exactly; integer columns hold every fils amount (R3).
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
      cycle TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS expense (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      amount_minor INTEGER NOT NULL,
      category TEXT NOT NULL,
      note TEXT,
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
}
