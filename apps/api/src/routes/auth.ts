/**
 * Auth: регистрация (reader/author) и вход. JWT как во втором проекте (bcrypt + jsonwebtoken).
 */
import { Router } from 'express';
import bcrypt from 'bcrypt';
import { z } from 'zod';
import { db, users, articles, tariffPlans } from '@newinvest/db';
import { and, eq, sql } from 'drizzle-orm';
import { signToken, authRequired } from '../middleware/auth.js';

export const authRouter = Router();

const passwordSchema = z.string()
  .min(8, 'Минимум 8 символов')
  .max(100)
  .refine((p) => {
    // минимум 2 класса символов из: буквы / цифры / спецсимволы; не все символы одинаковые
    const hasLetters = /[a-zA-Zа-яА-ЯёЁ]/.test(p);
    const hasDigits = /\d/.test(p);
    const hasSpecial = /[^a-zA-Zа-яА-ЯёЁ0-9\s]/.test(p);
    const classes = [hasLetters, hasDigits, hasSpecial].filter(Boolean).length;
    return classes >= 2 && !/^(.)\1+$/.test(p);
  }, 'Пароль должен содержать буквы и цифры (или спецсимволы)');

const registerSchema = z.object({
  username: z.string().trim().min(2, 'Минимум 2 символа').max(40),
  email: z.string().email(),
  password: passwordSchema,
});

const loginSchema = z.object({
  email: z.string().email(),
  password: z.string(),
});

authRouter.post('/register', async (req, res) => {
  const parsed = registerSchema.safeParse(req.body);
  if (!parsed.success) {
    const first = Object.values(parsed.error.flatten().fieldErrors)[0]?.[0];
    res.status(400).json({ error: 'validation', message: first ?? 'Проверьте поля' });
    return;
  }
  const { email, password, username } = parsed.data;

  // email занят (case-insensitive) — как в PULSE
  const existingEmail = await db.select({ id: users.id }).from(users)
    .where(sql`lower(${users.email}) = lower(${email})`).limit(1);
  if (existingEmail.length > 0) {
    res.status(409).json({ error: 'На эту почту уже зарегистрирован аккаунт', code: 'EMAIL_EXISTS' });
    return;
  }
  // имя занято (case-insensitive) — как в PULSE
  const existingName = await db.select({ id: users.id }).from(users)
    .where(sql`lower(${users.displayName}) = lower(${username})`).limit(1);
  if (existingName.length > 0) {
    res.status(409).json({ error: 'Это имя уже занято — придумайте другое', code: 'USERNAME_EXISTS' });
    return;
  }

  const passwordHash = await bcrypt.hash(password, 12);
  const [user] = await db
    .insert(users)
    .values({ email, passwordHash, displayName: username, role: 'reader' })
    .returning({ id: users.id, email: users.email, displayName: users.displayName, role: users.role });

  res.status(201).json({ user, token: signToken(user) });
});

// GET /api/auth/me — текущий пользователь по токену (SSO-проброс между сайтом и админкой)
authRouter.get('/me', authRequired, async (req, res) => {
  const [user] = await db.select({
    id: users.id, email: users.email, displayName: users.displayName, role: users.role, avatar: users.avatar,
    bio: users.bio, // ТЗ-05: «о себе» — редактируется через PATCH /me
    tariffId: users.tariffId, tariffExpiresAt: users.tariffExpiresAt, tariffName: tariffPlans.name,
  }).from(users).leftJoin(tariffPlans, eq(users.tariffId, tariffPlans.id)).where(eq(users.id, req.user!.id)).limit(1);
  if (!user) {
    res.status(401).json({ error: 'unauthorized' });
    return;
  }
  res.json({ user });
});

// PATCH /api/auth/me — частичное обновление своего профиля (ТЗ-05: bio «о себе»).
// Свой профиль, любая роль; лимит 500 — только zod (в БД ограничения нет, решение ТЗ).
const patchMeSchema = z.object({ bio: z.string().trim().max(500, 'Максимум 500 символов') }).partial();
authRouter.patch('/me', authRequired, async (req, res) => {
  const parsed = patchMeSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: 'validation', details: parsed.error.flatten() });
    return;
  }
  if (parsed.data.bio === undefined) {
    // пустой PATCH — текущий профиль без изменений (пустой .set() крашил процесс, как в articles.ts)
    const [user] = await db.select({
      id: users.id, email: users.email, displayName: users.displayName, role: users.role, avatar: users.avatar,
      bio: users.bio, tariffId: users.tariffId,
    }).from(users).where(eq(users.id, req.user!.id)).limit(1);
    res.json({ user });
    return;
  }
  const [user] = await db
    .update(users)
    .set({ bio: parsed.data.bio })
    .where(eq(users.id, req.user!.id)) // чужой профиль изменить нельзя — только свой id
    .returning({
      id: users.id, email: users.email, displayName: users.displayName, role: users.role, avatar: users.avatar,
      bio: users.bio, tariffId: users.tariffId,
    });
  res.json({ user });
});

// DELETE /api/auth/me — удаление аккаунта (подтверждение паролем).
// Черновики автора удаляются; опубликованный контент остаётся (author_id → NULL,
// см. миграцию 0005); избранное/подписки/просмотры — каскадом.
authRouter.delete('/me', authRequired, async (req, res) => {
  const password = String(req.body?.password ?? '');
  const [user] = await db.select().from(users).where(eq(users.id, req.user!.id)).limit(1);
  if (!user || !(await bcrypt.compare(password, user.passwordHash))) {
    res.status(403).json({ error: 'Неверный пароль' });
    return;
  }
  // транзакция: черновики и профиль удаляются атомарно (иначе падение между
  // запросами = потерянные черновики или сиротский профиль)
  await db.transaction(async (tx) => {
    await tx.delete(articles).where(and(eq(articles.authorId, user.id), eq(articles.status, 'draft')));
    await tx.delete(users).where(eq(users.id, user.id));
  });
  res.json({ ok: true });
});

authRouter.post('/login', async (req, res) => {  const parsed = loginSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: 'validation', details: parsed.error.flatten() });
    return;
  }
  const [user] = await db.select().from(users).where(eq(users.email, parsed.data.email)).limit(1);
  if (!user || !(await bcrypt.compare(parsed.data.password, user.passwordHash))) {
    res.status(401).json({ error: 'invalid credentials' });
    return;
  }
  res.json({
    user: { id: user.id, email: user.email, role: user.role, displayName: user.displayName },
    token: signToken(user),
  });
});
