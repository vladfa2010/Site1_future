/**
 * Создание супер-админа (idempotent). Запуск: npm run seed -w @newinvest/api
 */
import bcrypt from 'bcrypt';
import { db, users } from '@newinvest/db';
import { eq } from 'drizzle-orm';
import { config } from './config.js';

// В production дефолтный пароль запрещён (аудит 2026-11-08: admin123 опубликован в репо)
if (process.env.NODE_ENV === 'production' && config.adminPassword === 'admin123') {
  console.error('ADMIN_PASSWORD не задан (production). Задайте сильный пароль в env.');
  process.exit(1);
}

const [existing] = await db.select({ id: users.id }).from(users).where(eq(users.email, config.adminEmail)).limit(1);

if (existing) {
  console.log(`Супер-админ уже есть: ${config.adminEmail} (id=${existing.id})`);
} else {
  const passwordHash = await bcrypt.hash(config.adminPassword, 12);
  const [user] = await db
    .insert(users)
    .values({ email: config.adminEmail, passwordHash, displayName: 'Super Admin', role: 'super_admin' })
    .returning({ id: users.id, email: users.email, role: users.role });
  console.log(`Создан супер-админ: ${user.email} (id=${user.id}, role=${user.role})`);
}
process.exit(0);
