/**
 * Auth: регистрация (reader/author) и вход. JWT как во втором проекте (bcrypt + jsonwebtoken).
 */
import { Router } from 'express';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { z } from 'zod';
import { db, users, articles, tariffPlans, passwordResetCodes } from '@newinvest/db';
import { and, eq, sql, desc } from 'drizzle-orm';
import { randomInt, timingSafeEqual } from 'node:crypto';
import { signToken, authRequired } from '../middleware/auth.js';
import { sendEmail, emailEnabled, renderResetCodeEmail } from '../services/email.js';
import { config } from '../config.js';

export const authRouter = Router();

const passwordSchema = z.string()
  .min(8, 'Минимум 8 символов')
  .max(100)
  .refine((p) => Buffer.byteLength(p, 'utf8') <= 72, 'Пароль длиннее 72 байт — сократите (кириллица занимает 2 байта на символ)')
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

// Аудит 2026-11-14: защита восстановления пароля от перебора и email-бомбинга
const MAX_CODE_ATTEMPTS = 5;        // промахов подряд → код инвалидируется
const RESEND_INTERVAL_MS = 60_000;  // повторная отправка письма на email — не чаще раза в минуту

// POST /api/auth/forgot-password — 6-значный код на почту, TTL 15 минут.
// Анти-перебор: ответ всегда {success:true} — не раскрываем, существует ли email.
// Анти-бомбинг (аудит 2026-11-14): живой код не пересоздаём, а повторно шлём тот же;
// плюс не чаще раза в минуту на email и отдельный лимитер forgotPasswordLimiter на IP.
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
  const now = new Date();
  const [active] = await db.select().from(passwordResetCodes)
    .where(and(eq(passwordResetCodes.userId, user.id), eq(passwordResetCodes.used, false)))
    .orderBy(desc(passwordResetCodes.createdAt))
    .limit(1);
  let code: string;
  if (active && active.expiresAt > now) {
    // код жив — не пересоздаём (иначе бесконечный поток писем на чужую почту);
    // но и не флудим: повторная отправка не чаще раза в минуту на email
    if (now.getTime() - active.createdAt.getTime() < RESEND_INTERVAL_MS) {
      res.json({ success: true, delivered: emailEnabled() });
      return;
    }
    code = active.code; // пересылаем тот же код
  } else {
    await db.delete(passwordResetCodes).where(eq(passwordResetCodes.userId, user.id));
    code = randomInt(100000, 1000000).toString();
    await db.insert(passwordResetCodes).values({
      userId: user.id,
      code,
      expiresAt: new Date(now.getTime() + 15 * 60 * 1000),
    });
  }
  if (emailEnabled()) {
    await sendEmail(email, 'Код восстановления пароля — Инвестиционно.рф', renderResetCodeEmail(user.displayName ?? '', code))
      .catch((e) => console.error('[auth] reset email failed:', (e as Error).message));
  } else {
    // dev-режим без почты: код в лог, чтобы поток можно было пройти локально
    console.log(`[auth] reset code для ${email}: ${code} (RESEND_API_KEY не задан)`);
  }
  res.json({ success: true, delivered: emailEnabled() });
});

// POST /api/auth/verify-code — проверка кода → resetToken (JWT purpose=password_reset, 15 минут)
// Анти-перебор (аудит 2026-11-14): счётчик попыток на код, MAX_CODE_ATTEMPTS промахов →
// код инвалидируется; сравнение через timingSafeEqual; плюс лимитер verifyCodeLimiter на IP.
authRouter.post('/verify-code', async (req, res) => {
  const parsed = verifyCodeSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: 'validation', details: parsed.error.flatten() });
    return;
  }
  const invalid = () => res.status(400).json({ error: 'Неверный или просроченный код' });
  const [user] = await db.select({ id: users.id }).from(users)
    .where(sql`lower(${users.email}) = lower(${parsed.data.email})`).limit(1);
  if (!user) {
    invalid();
    return;
  }
  const [row] = await db.select().from(passwordResetCodes)
    .where(and(eq(passwordResetCodes.userId, user.id), eq(passwordResetCodes.used, false)))
    .orderBy(desc(passwordResetCodes.createdAt))
    .limit(1);
  if (!row || row.expiresAt < new Date()) {
    invalid();
    return;
  }
  // безопасное сравнение без раннего выхода по различию (паддинг на случай смены формата кода)
  const a = Buffer.from(row.code.padEnd(8, '\0'));
  const b = Buffer.from(parsed.data.code.padEnd(8, '\0'));
  if (a.length !== b.length || !timingSafeEqual(a, b)) {
    const attempts = row.attempts + 1;
    if (attempts >= MAX_CODE_ATTEMPTS) {
      await db.update(passwordResetCodes)
        .set({ used: true, usedAt: new Date() })
        .where(eq(passwordResetCodes.id, row.id)); // код исчерпан — инвалидируем
    } else {
      await db.update(passwordResetCodes)
        .set({ attempts })
        .where(eq(passwordResetCodes.id, row.id));
    }
    invalid();
    return;
  }
  await db.update(passwordResetCodes).set({ used: true, usedAt: new Date() }).where(eq(passwordResetCodes.id, row.id));
  const resetToken = jwt.sign(
    { purpose: 'password_reset' },
    config.jwtSecret,
    { subject: String(user.id), expiresIn: '15m', issuer: config.jwtIssuer, audience: config.jwtAudience },
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
    // iss/aud (ТЗ 4.1) + пиннинг алгоритма; resetToken не принимает сессионные JWT
    payload = jwt.verify(parsed.data.resetToken, config.jwtSecret, {
      algorithms: ['HS256'],
      issuer: config.jwtIssuer,
      audience: config.jwtAudience,
    }) as jwt.JwtPayload;
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
  // ТЗ 4.2 (2026-11-15): токен, выданный ДО последней смены пароля, не принимаем —
  // украденный resetToken не живёт 15 минут после того, как владелец сменил пароль.
  // Сравнение в миллисекундах с допуском 1 с (iat — с секундным разрешением).
  if (user.passwordChangedAt && typeof payload.iat === 'number'
      && payload.iat * 1000 <= user.passwordChangedAt.getTime() + 1000) {
    res.status(401).json({ error: 'Недействительная или просроченная ссылка' });
    return;
  }
  const passwordHash = await bcrypt.hash(parsed.data.password, 12);
  await db.update(users)
    .set({ passwordHash, passwordChangedAt: new Date() })
    .where(eq(users.id, user.id));
  res.json({
    user: { id: user.id, email: user.email, role: user.role, displayName: user.displayName },
    token: signToken(user),
  });
});
