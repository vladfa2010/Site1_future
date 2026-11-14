/**
 * JWT-аутентификация и роли.
 * Роли (раздел 6.3 документа): super_admin | admin | author | reader
 */
import type { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import { eq } from 'drizzle-orm';
import { db, users } from '@newinvest/db';
import { config } from '../config.js';

export interface AuthUser {
  id: number;
  role: string;
  tariffId?: number | null;
  tariffExpiresAt?: string | null;
}

declare module 'express-serve-static-core' {
  interface Request {
    user?: AuthUser;
  }
}

async function verifyToken(token: string): Promise<AuthUser | null> {
  try {
    // алгоритм пиннется: защита от alg-confusion (RS256/None-атаки)
    const payload = jwt.verify(token, config.jwtSecret, { algorithms: ['HS256'] }) as jwt.JwtPayload;
    if (typeof payload.sub !== 'string' || !Number.isFinite(Number(payload.sub))) return null;
    // Роль и тариф — ТОЛЬКО из БД, payload не доверяем (подделка прав/пейволла при утечке секрета, аудит 2026-11-14)
    const [u] = await db
      .select({
        id: users.id,
        role: users.role,
        tariffId: users.tariffId,
        tariffExpiresAt: users.tariffExpiresAt,
        isBlocked: users.isBlocked,
      })
      .from(users)
      .where(eq(users.id, Number(payload.sub)))
      .limit(1);
    if (!u || u.isBlocked) return null; // удалён/заблокирован — токен не принимаем
    return {
      id: u.id,
      role: u.role,
      tariffId: u.tariffId ?? null,
      tariffExpiresAt: u.tariffExpiresAt ? u.tariffExpiresAt.toISOString() : null,
    };
  } catch {
    return null;
  }
}

/** Опциональная авторизация: токен есть — заполняем req.user, нет — пропускаем */
export async function optionalAuth(req: Request, _res: Response, next: NextFunction) {
  const header = req.headers.authorization;
  if (header?.startsWith('Bearer ')) {
    req.user = (await verifyToken(header.slice(7))) ?? undefined;
  }
  next();
}

/** Обязательная авторизация */
export async function authRequired(req: Request, res: Response, next: NextFunction) {
  const header = req.headers.authorization;
  const user = header?.startsWith('Bearer ') ? await verifyToken(header.slice(7)) : null;
  if (!user) {
    res.status(401).json({ error: 'unauthorized' });
    return;
  }
  req.user = user;
  next();
}

/** Проверка роли: requireRole('admin', 'super_admin').
 *  Порт ТЗ-120 PULSE: is_blocked проверяется и здесь, а не только при логине —
 *  иначе заблокированный админ продолжал бы работать с уже выданным JWT. */
export function requireRole(...roles: string[]) {
  return async (req: Request, res: Response, next: NextFunction) => {
    if (!req.user || !roles.includes(req.user.role)) {
      res.status(403).json({ error: 'forbidden', need: roles, got: req.user?.role ?? null });
      return;
    }
    const [u] = await db.select({ isBlocked: users.isBlocked }).from(users).where(eq(users.id, req.user.id)).limit(1);
    if (u?.isBlocked) {
      res.status(403).json({ error: 'Аккаунт заблокирован' });
      return;
    }
    next();
  };
}

export function signToken(user: { id: number; role: string; tariffId?: number | null; tariffExpiresAt?: Date | string | null }): string {
  // Админам — короткий TTL: утечка admin-токена необратима 7 дней (аудит 2026-11-08)
  const isAdmin = ADMIN_ROLES.includes(user.role);
  return jwt.sign(
    { role: user.role, tariffId: user.tariffId ?? null, tariffExpiresAt: user.tariffExpiresAt ? new Date(user.tariffExpiresAt).toISOString() : null },
    config.jwtSecret,
    { subject: String(user.id), expiresIn: isAdmin ? '12h' : '7d' },
  );
}

export const ADMIN_ROLES = ['admin', 'super_admin'];
