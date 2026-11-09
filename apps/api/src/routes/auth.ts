/**
 * Auth: регистрация (reader/author) и вход. JWT как во втором проекте (bcrypt + jsonwebtoken).
 */
import { Router } from 'express';
import bcrypt from 'bcrypt';
import jwt from 'jsonwebtoken';
import { z } from 'zod';
import { db, users, articles, tariffPlans, passwordResetCodes } from '@newinvest/db';
import { and, eq, sql, desc } from 'drizzle-orm';
import { randomInt } from 'node:crypto';
import { signToken, authRequired } from '../middleware/auth.js';
import { sendEmail, emailEnabled } from '../services/email.js';
import { config } from '../config.js';

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

// email: допускаем и локальные домены без точки (admin@local из DEPLOY.md) —
// встроенный .email() zod их отвергает
const emailSchema = z.string()
  .trim() // пробелы по краям (копипаст из писем) не должны ломать вход
  .regex(/^[^\s@]+@[^\s@]+$/, 'Некорректный email')
  .max(254);

const registerSchema = z.object({
  username: z.string().trim().min(2, 'Минимум 2 символа').max(40),
  email: emailSchema,
  password: passwordSchema,
});

const loginSchema = z.object({
  email: emailSchema,
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
  // case-insensitive, как в PULSE: регистр почты не должен блокировать вход
  const [user] = await db.select().from(users).where(sql`lower(${users.email}) = lower(${parsed.data.email})`).limit(1);
  if (!user || !(await bcrypt.compare(parsed.data.password, user.passwordHash))) {
    res.status(401).json({ error: 'invalid credentials' });
    return;
  }
  if (user.isBlocked) {
    res.status(403).json({ error: 'Аккаунт заблокирован' });
    return;
  }
  res.json({
    user: { id: user.id, email: user.email, role: user.role, displayName: user.displayName },
    token: signToken(user),
  });
});

// ---------- Восстановление пароля (порт PULSE: forgot → verify-code → reset) ----------

const forgotSchema = z.object({ email: emailSchema });
const verifyCodeSchema = z.object({ email: emailSchema, code: z.string().regex(/^\d{6}$/) });
const resetPasswordSchema = z.object({
  resetToken: z.string().min(10),
  password: passwordSchema,
});

// POST /api/auth/forgot-password — 6-значный код на почту, TTL 15 минут.
// Анти-перебор: ответ всегда {success:true} — не раскрываем, существует ли email.
// Без RESEND_API_KEY письмо не уходит: в dev код пишется в лог (подсказка в ответе).
authRouter.post('/forgot-password', async (req, res) => {
  const parsed = forgotSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: 'validation', details: parsed.error.flatten() });
    return;
  }
  const email = parsed.data.email;
  const [user] = await db.select({ id: users.id, email: users.email, displayName: users.displayName })
    .from(users).where(sql`lower(${users.email}) = lower(${email})`).limit(1);
  if (!user) {
    res.json({ success: true }); // не раскрываем существование аккаунта
    return;
  }
  await db.delete(passwordResetCodes).where(eq(passwordResetCodes.userId, user.id));
  const code = randomInt(100000, 1000000).toString();
  await db.insert(passwordResetCodes).values({
    userId: user.id,
    code,
    expiresAt: new Date(Date.now() + 15 * 60 * 1000),
  });
  if (emailEnabled()) {
    const name = user.displayName ?? '';
    await sendEmail(
      email,
      'Код восстановления пароля — Инвестиционно.рф',
      `<p>${name ? `${name}, здравствуйте!` : 'Здравствуйте!'}</p>
       <p>Код для восстановления пароля: <b style="font-size:20px">${code}</b></p>
       <p>Код действует 15 минут. Если вы не запрашивали восстановление — просто проигнорируйте это письмо.</p>`,
    ).catch((e) => console.error('[auth] reset email failed:', (e as Error).message));
  } else {
    // dev-режим без почты: код в лог, чтобы поток можно было пройти локально
    console.log(`[auth] reset code для ${email}: ${code} (RESEND_API_KEY не задан)`);
  }
  res.json({ success: true, delivered: emailEnabled() });
});

// POST /api/auth/verify-code — проверка кода → resetToken (JWT purpose=password_reset, 15 минут)
authRouter.post('/verify-code', async (req, res) => {
  const parsed = verifyCodeSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: 'validation', details: parsed.error.flatten() });
    return;
  }
  const [user] = await db.select({ id: users.id }).from(users)
    .where(sql`lower(${users.email}) = lower(${parsed.data.email})`).limit(1);
  if (!user) {
    res.status(400).json({ error: 'Неверный или просроченный код' });
    return;
  }
  const [row] = await db.select().from(passwordResetCodes)
    .where(and(eq(passwordResetCodes.userId, user.id), eq(passwordResetCodes.used, false)))
    .orderBy(desc(passwordResetCodes.createdAt))
    .limit(1);
  if (!row || row.code !== parsed.data.code || row.expiresAt < new Date()) {
    res.status(400).json({ error: 'Неверный или просроченный код' });
    return;
  }
  await db.update(passwordResetCodes).set({ used: true, usedAt: new Date() }).where(eq(passwordResetCodes.id, row.id));
  const resetToken = jwt.sign(
    { purpose: 'password_reset' },
    config.jwtSecret,
    { subject: String(user.id), expiresIn: '15m' },
  );
  res.json({ resetToken });
});

// POST /api/auth/reset-password — смена пароля по resetToken; отвечает новой сессией (как логин)
authRouter.post('/reset-password', async (req, res) => {
  const parsed = resetPasswordSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: 'validation', details: parsed.error.flatten() });
    return;
  }
  let payload: jwt.JwtPayload;
  try {
    payload = jwt.verify(parsed.data.resetToken, config.jwtSecret, { algorithms: ['HS256'] }) as jwt.JwtPayload;
  } catch {
    res.status(401).json({ error: 'Недействительная или просроченная ссылка' });
    return;
  }
  if (payload.purpose !== 'password_reset' || typeof payload.sub !== 'string') {
    res.status(401).json({ error: 'Недействительная или просроченная ссылка' });
    return;
  }
  const [user] = await db.select().from(users).where(eq(users.id, Number(payload.sub))).limit(1);
  if (!user) {
    res.status(404).json({ error: 'Пользователь не найден' });
    return;
  }
  const passwordHash = await bcrypt.hash(parsed.data.password, 12);
  await db.update(users).set({ passwordHash }).where(eq(users.id, user.id));
  res.json({
    user: { id: user.id, email: user.email, role: user.role, displayName: user.displayName },
    token: signToken(user),
  });
});
