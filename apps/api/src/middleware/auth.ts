/**
 * JWT-аутентификация и роли.
 * Роли (раздел 6.3 документа): super_admin | admin | author | reader
 */
import type { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import { config } from '../config.js';

export interface AuthUser {
  id: number;
  role: string;
  tariffId?: number | null;
}

declare module 'express-serve-static-core' {
  interface Request {
    user?: AuthUser;
  }
}

function verifyToken(token: string): AuthUser | null {
  try {
    const payload = jwt.verify(token, config.jwtSecret) as jwt.JwtPayload;
    if (typeof payload.sub !== 'string') return null;
    return { id: Number(payload.sub), role: payload.role as string, tariffId: (payload.tariffId as number | null) ?? null };
  } catch {
    return null;
  }
}

/** Опциональная авторизация: токен есть — заполняем req.user, нет — пропускаем */
export function optionalAuth(req: Request, _res: Response, next: NextFunction) {
  const header = req.headers.authorization;
  if (header?.startsWith('Bearer ')) {
    req.user = verifyToken(header.slice(7)) ?? undefined;
  }
  next();
}

/** Обязательная авторизация */
export function authRequired(req: Request, res: Response, next: NextFunction) {
  const header = req.headers.authorization;
  const user = header?.startsWith('Bearer ') ? verifyToken(header.slice(7)) : null;
  if (!user) {
    res.status(401).json({ error: 'unauthorized' });
    return;
  }
  req.user = user;
  next();
}

/** Проверка роли: requireRole('admin', 'super_admin') */
export function requireRole(...roles: string[]) {
  return (req: Request, res: Response, next: NextFunction) => {
    if (!req.user || !roles.includes(req.user.role)) {
      res.status(403).json({ error: 'forbidden', need: roles, got: req.user?.role ?? null });
      return;
    }
    next();
  };
}

export function signToken(user: { id: number; role: string; tariffId?: number | null }): string {
  return jwt.sign({ role: user.role, tariffId: user.tariffId ?? null }, config.jwtSecret, {
    subject: String(user.id),
    expiresIn: '7d',
  });
}

export const ADMIN_ROLES = ['admin', 'super_admin'];
