/**
 * Auth: регистрация (reader/author) и вход. JWT как во втором проекте (bcrypt + jsonwebtoken).
 */
import { Router } from 'express';
import bcrypt from 'bcrypt';
import { z } from 'zod';
import { db, users, articles } from '@newinvest/db';
import { and, eq, sql } from 'drizzle-orm';
import { signToken, authRequired } from '../middleware/auth.js';

export const authRouter = Router();

const registerSchema = z.object({
  username: z.string().trim().min(2, 'Минимум 2 символа').max(40),
  email: z.string().email(),
  password: z.string().min(8, 'Минимум 8 символов').max(100),
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

  const passwordHash = await bcrypt.hash(password, 10);
  const [user] = await db
    .insert(users)
    .values({ email, passwordHash, displayName: username, role: 'reader' })
    .returning({ id: users.id, email: users.email, displayName: users.displayName, role: users.role });

  res.status(201).json({ user, token: signToken(user) });
});

// GET /api/auth/me — текущий пользователь по токену (SSO-проброс между сайтом и админкой)
authRouter.get('/me', authRequired, async (req, res) => {
  const [user] = await db.select({
    id: users.id, email: users.email, displayName: users.displayName, role: users.role,
  }).from(users).where(eq(users.id, req.user!.id)).limit(1);
  if (!user) {
    res.status(401).json({ error: 'unauthorized' });
    return;
  }
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
  await db.delete(articles).where(and(eq(articles.authorId, user.id), eq(articles.status, 'draft')));
  await db.delete(users).where(eq(users.id, user.id));
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
