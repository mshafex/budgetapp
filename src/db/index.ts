/**
 * Data layer barrel (`@/db`).
 *
 * Public surface for the rest of the app:
 * - `repository` — the single `Repository` instance (PATTERNS: all data access here).
 * - `ensureSchema` — idempotent v1 table bootstrap; call once at app init before use.
 *
 * Local SQLite is the single source of truth (R2/R5). Importing this module loads the
 * native expo-sqlite driver, so it is for the running app only — never unit tests.
 */
import type { Repository } from '@/contracts';
import { db, ensureSchema } from './client';
import { createRepository } from './repository';

export { ensureSchema };
export { DATABASE_NAME } from './client';

/** App-wide repository instance bound to the shared SQLite connection. */
export const repository: Repository = createRepository(db);
