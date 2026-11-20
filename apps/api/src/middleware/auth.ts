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
  /** iat принятого токена (сек) — для абсолютного потолка сессии в /auth/refresh */
  tokenIssuedAt?: number;
}

declare module 'express-serve-static-core' {
  interface Request {
    user?: AuthUser;
  }
}

async function verifyToken(token: string): Promise<AuthUser | null> {
  try {
    // алгоритм пиннется: защита от alg-confusion (RS256/None-атаки)
    const payload = jwt.verify(token, config.jwtSecret, {
      algorithms: ['HS256'],
      issuer: config.jwtIssuer, // ТЗ 4.1: токен чужого назначения не принимаем
      audience: config.jwtAudience,
    }) as jwt.JwtPayload;
    if (typeof payload.sub !== 'string' || !Number.isFinite(Number(payload.sub))) return null;
    // Роль и тариф — ТОЛЬКО из БД, payload не доверяем (подделка прав/пейволла при утечке секрета, аудит 2026-11-14)
    const [u] = await db
      .select({
        id: users.id,
        role: users.role,
        tariffId: users.tariffId,
        tariffExpiresAt: users.tariffExpiresAt,
        isBlocked: users.isBlocked,
        passwordChangedAt: users.passwordChangedAt, // аудит 2026-11-20: смена пароля инвалидирует сессии
      })
      .from(users)
      .where(eq(users.id, Number(payload.sub)))
      .limit(1);
    if (!u || u.isBlocked) return null; // удалён/заблокирован — токен не принимаем
    // Сессионные JWT, выданные ДО смены пароля, не принимаем — иначе украденный
    // токен живёт до конца TTL после смены пароля (аудит 2026-11-20). Строгое «раньше»:
    // токен, выданный в ту же секунду, что и смена, или позже — валиден (иначе свежая
    // сессия сразу после reset отлетала бы — гонка секундного разрешения iat).
    if (u.passwordChangedAt && typeof payload.iat === 'number'
        && payload.iat * 1000 < u.passwordChangedAt.getTime()) {
      return null;
    }
    return {
      id: u.id,
      role: u.role,
      tariffId: u.tariffId ?? null,
      tariffExpiresAt: u.tariffExpiresAt ? u.tariffExpiresAt.toISOString() : null,
      tokenIssuedAt: typeof payload.iat === 'number' ? payload.iat : undefined,
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
    { subject: String(user.id), expiresIn: isAdmin ? '12h' : '7d', issuer: config.jwtIssuer, audience: config.jwtAudience },
  );
}

export const ADMIN_ROLES = ['admin', 'super_admin'];
