/**
 * Drizzle Kit config — Expo SQLite.
 *
 * Lets `drizzle-kit generate` emit SQL migrations from `src/db/schema.ts` for the Expo
 * SQLite migrator when v1's simple `ensureSchema()` bootstrap is outgrown. No DB
 * credentials here: expo-sqlite is local/offline (R2/R5), so the `expo` driver runs
 * migrations on-device.
 */
import { defineConfig } from 'drizzle-kit';

export default defineConfig({
  dialect: 'sqlite',
  driver: 'expo',
  schema: './src/db/schema.ts',
  out: './src/db/migrations',
});
