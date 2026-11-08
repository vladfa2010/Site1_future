/**
 * Тестовый админ-аккаунт (dev). Запуск: npm run seed:test -w @newinvest/api
 * Логин: test@test.ru / test
 * В PRODUCTION не работает (защита от поднятия админа с паролем "test" в проде).
 */
import bcrypt from 'bcrypt';
import { db, users } from '@newinvest/db';
import { eq } from 'drizzle-orm';

if (process.env.NODE_ENV === 'production') {
  console.error('seed:test заблокирован: production. Используйте npm run seed с ADMIN_PASSWORD.');
  process.exit(1);
}

const EMAIL = 'test@test.ru';
const PASSWORD = 'test';

const [existing] = await db.select({ id: users.id }).from(users).where(eq(users.email, EMAIL)).limit(1);
if (existing) {
  const passwordHash = await bcrypt.hash(PASSWORD, 12);
  await db.update(users).set({ passwordHash, role: 'admin' }).where(eq(users.id, existing.id));
  console.log(`Обновлён тестовый админ: ${EMAIL} / ${PASSWORD} (role=admin)`);
} else {
  const passwordHash = await bcrypt.hash(PASSWORD, 12);
  const [user] = await db
    .insert(users)
    .values({ email: EMAIL, passwordHash, displayName: 'Test Admin', role: 'admin' })
    .returning({ id: users.id, email: users.email, role: users.role });
  console.log(`Создан тестовый админ: ${user.email} / ${PASSWORD} (role=${user.role})`);
}
process.exit(0);
