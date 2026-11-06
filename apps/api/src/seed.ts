/**
 * Создание супер-админа (idempotent). Запуск: npm run seed -w @newinvest/api
 */
import bcrypt from 'bcrypt';
import { db, users } from '@newinvest/db';
import { eq } from 'drizzle-orm';
import { config } from './config.js';

const [existing] = await db.select({ id: users.id }).from(users).where(eq(users.email, config.adminEmail)).limit(1);

if (existing) {
  console.log(`Супер-админ уже есть: ${config.adminEmail} (id=${existing.id})`);
} else {
  const passwordHash = await bcrypt.hash(config.adminPassword, 10);
  const [user] = await db
    .insert(users)
    .values({ email: config.adminEmail, passwordHash, displayName: 'Super Admin', role: 'super_admin' })
    .returning({ id: users.id, email: users.email, role: users.role });
  console.log(`Создан супер-админ: ${user.email} (id=${user.id}, role=${user.role})`);
}
process.exit(0);
