/**
 * Клиент БД и реэкспорт схемы для всех приложений монорепо.
 */
import 'dotenv/config';
import pg from 'pg';
import { drizzle } from 'drizzle-orm/node-postgres';
import * as schema from './schema.js';

const pool = new pg.Pool({
  connectionString:
    process.env.DATABASE_URL ?? 'postgres://localhost:5432/newinvest',
});

export const db = drizzle(pool, { schema });
export * from './schema.js';
export { schema };
