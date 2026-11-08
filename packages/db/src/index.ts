/**
 * Клиент БД и реэкспорт схемы для всех приложений монорепо.
 */
import 'dotenv/config';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { config as loadEnv } from 'dotenv';
import pg from 'pg';
import { drizzle } from 'drizzle-orm/node-postgres';
import * as schema from './schema.js';

// cwd-независимость: npm -w запускает скрипты пакета из packages/<pkg>,
// dotenv/config выше находит .env только от cwd — добираем корневой .env монорепо.
// Не переопределяет уже заданные переменные (dotenv по умолчанию).
loadEnv({ path: path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../../.env') });

const pool = new pg.Pool({
  connectionString:
    process.env.DATABASE_URL ?? 'postgres://localhost:5432/newinvest',
});

export const db = drizzle(pool, { schema });
export * from './schema.js';
export * from './text-utils.js';
export { schema };
