/**
 * Auth: регистрация (reader/author) и вход. JWT как во втором проекте (bcrypt + jsonwebtoken).
 */
import { Router } from 'express';
import bcrypt from 'bcrypt';
import { z } from 'zod';
import { db, users } from '@newinvest/db';
import { eq } from 'drizzle-orm';
import { signToken } from '../middleware/auth.js';

export const authRouter = Router();

const registerSchema = z.object({
  email: z.string().email(),
  password: z.string().min(6),
  displayName: z.string().min(1).optional(),
  // регистрация на сайте даёт роль reader или author (раздел 6.3)
  role: z.enum(['reader', 'author']).default('reader'),
});

const loginSchema = z.object({
  email: z.string().email(),
  password: z.string(),
});

authRouter.post('/register', async (req, res) => {
  const parsed = registerSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: 'validation', details: parsed.error.flatten() });
    return;
  }
  const { email, password, displayName, role } = parsed.data;

  const existing = await db.select({ id: users.id }).from(users).where(eq(users.email, email)).limit(1);
  if (existing.length > 0) {
    res.status(409).json({ error: 'email already registered' });
    return;
  }

  const passwordHash = await bcrypt.hash(password, 10);
  const [user] = await db
    .insert(users)
    .values({ email, passwordHash, displayName: displayName ?? email.split('@')[0], role })
    .returning({ id: users.id, email: users.email, role: users.role, displayName: users.displayName });

  res.status(201).json({ user, token: signToken(user) });
});

authRouter.post('/login', async (req, res) => {
  const parsed = loginSchema.safeParse(req.body);
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
