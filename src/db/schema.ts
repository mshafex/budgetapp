/**
 * Drizzle schema (sqlite-core) — mirrors `@/contracts/entities`.
 *
 * R3: every money value is an integer column of fils. No floats anywhere.
 * R2/R5: this local SQLite database is the single source of truth (offline-first).
 *
 * Conventions:
 * - snake_case columns (PATTERNS data layer) mapped to the camelCase contract fields.
 * - `integer({ mode: 'number' })` for all `*Minor` amounts, ids, and `payDay`.
 * - `text({ enum })` for the closed enums (`type`, `cycle`, `category`) and `locale`.
 * - ISO date / timestamp strings are stored as plain `text`.
 * - `user` is effectively a single-row profile (onboarding writes it).
 */
import { integer, sqliteTable, text } from 'drizzle-orm/sqlite-core';
import type {
  CycleKind,
  ExpenseCategory,
  FixedItemType,
} from '@/contracts';

const FIXED_ITEM_TYPES = [
  'rent',
  'loan',
  'remittance',
  'bill',
  'other',
] as const satisfies readonly FixedItemType[];

const CYCLE_KINDS = [
  'weekly',
  'monthly',
  'quarterly',
  'yearly',
] as const satisfies readonly CycleKind[];

const EXPENSE_CATEGORIES = [
  'food',
  'transport',
  'bills',
  'shopping',
  'health',
  'family',
  'other',
] as const satisfies readonly ExpenseCategory[];

const LOCALES = ['en', 'ar'] as const;

/** Single-row profile written during onboarding. */
export const userTable = sqliteTable('user', {
  id: integer('id', { mode: 'number' }).primaryKey({ autoIncrement: true }),
  /** Monthly salary, fils. */
  salaryMinor: integer('salary_minor', { mode: 'number' }).notNull(),
  /** Day of month pay lands, 1..31 (clamped to month length by the engine). */
  payDay: integer('pay_day', { mode: 'number' }).notNull(),
  /** ISO currency code; default 'AED'. */
  currency: text('currency').notNull().default('AED'),
  locale: text('locale', { enum: LOCALES }).notNull(),
  /** Daily allowance below this triggers survival mode, fils. */
  survivalThresholdMinor: integer('survival_threshold_minor', {
    mode: 'number',
  }).notNull(),
});

export const fixedItemTable = sqliteTable('fixed_item', {
  id: integer('id', { mode: 'number' }).primaryKey({ autoIncrement: true }),
  label: text('label').notNull(),
  /** Amount per its own `cycle`, fils. */
  amountMinor: integer('amount_minor', { mode: 'number' }).notNull(),
  type: text('type', { enum: FIXED_ITEM_TYPES }).notNull(),
  cycle: text('cycle', { enum: CYCLE_KINDS }).notNull(),
});

export const expenseTable = sqliteTable('expense', {
  id: integer('id', { mode: 'number' }).primaryKey({ autoIncrement: true }),
  amountMinor: integer('amount_minor', { mode: 'number' }).notNull(),
  category: text('category', { enum: EXPENSE_CATEGORIES }).notNull(),
  /** Optional free-text note. */
  note: text('note'),
  /** ISO 8601 timestamp. */
  createdAt: text('created_at').notNull(),
});

/** Derived/cached cycle row; see budget contract for carryover semantics. */
export const cycleTable = sqliteTable('cycle', {
  id: integer('id', { mode: 'number' }).primaryKey({ autoIncrement: true }),
  /** ISO date 'YYYY-MM-DD' — pay date that opened this cycle. */
  startDate: text('start_date').notNull(),
  /** ISO date 'YYYY-MM-DD' — next pay date (cycle end, exclusive). */
  payDate: text('pay_date').notNull(),
  /** Leftover (may be negative) carried from the previous cycle, fils. */
  carryoverMinor: integer('carryover_minor', { mode: 'number' }).notNull(),
});

/** Inferred row types (select shapes) for the mappers. */
export type UserRow = typeof userTable.$inferSelect;
export type FixedItemRow = typeof fixedItemTable.$inferSelect;
export type ExpenseRow = typeof expenseTable.$inferSelect;
export type CycleRow = typeof cycleTable.$inferSelect;

/** Inferred insert shapes for the insert-shapers. */
export type UserInsert = typeof userTable.$inferInsert;
export type FixedItemInsert = typeof fixedItemTable.$inferInsert;
export type ExpenseInsert = typeof expenseTable.$inferInsert;
export type CycleInsert = typeof cycleTable.$inferInsert;
