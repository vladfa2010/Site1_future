/**
 * Безопасность: заголовки, CORS-allowlist, rate limiting.
 * Аудит 2026-11-06 (см. лог в docs).
 */
import type { Request, Response, NextFunction } from 'express';
import rateLimit from 'express-rate-limit';

/** Безопасные заголовки на все ответы API */
export function securityHeaders(_req: Request, res: Response, next: NextFunction) {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Frame-Options', 'DENY');
  res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
  res.setHeader('Permissions-Policy', 'camera=(), microphone=(), geolocation=()');
  res.setHeader('Content-Security-Policy', "default-src 'none'; frame-ancestors 'none'");
  next();
}

/** CORS: только доверенные origin'ы (env CORS_ORIGINS, через запятую).
 *  Запросы без Origin (curl, server-to-server) пропускаем. */
export function corsAllowlist(origins: string[]) {
  return (req: Request, res: Response, next: NextFunction) => {
    const origin = req.headers.origin;
    if (!origin || origins.includes(origin)) {
      res.setHeader('Access-Control-Allow-Origin', origin ?? '*');
      res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
      res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, PATCH, DELETE, OPTIONS');
      if (req.method === 'OPTIONS') {
        res.status(204).end();
        return;
      }
      next();
      return;
    }
    res.status(403).json({ error: 'origin not allowed' });
  };
}

const limiterDefaults = { standardHeaders: true, legacyHeaders: false };

/** Общий лимит API */
export const apiLimiter = rateLimit({ windowMs: 60_000, limit: 300, ...limiterDefaults });

/** Вход: защита от перебора пароля */
export const loginLimiter = rateLimit({
  windowMs: 15 * 60_000,
  limit: 10,
  ...limiterDefaults,
  message: { error: 'too many attempts, try later' },
});

/** Регистрация: защита от спама аккаунтами */
export const registerLimiter = rateLimit({
  windowMs: 3_600_000,
  limit: 10,
  ...limiterDefaults,
  message: { error: 'too many attempts, try later' },
});

/** Генерация картинок: дорогая операция (API Kimi) */
export const generateLimiter = rateLimit({
  windowMs: 3_600_000,
  limit: 30,
  ...limiterDefaults,
  message: { error: 'generation limit reached' },
});

/** Генерация текстов (лиды): отдельный лимит */
export const generateTextLimiter = rateLimit({
  windowMs: 3_600_000,
  limit: 60,
  ...limiterDefaults,
  message: { error: 'text generation limit reached' },
});

/** Telegram deep-link: создание кодов привязки — лимит на пользователя */
export const telegramLinkLimiter = rateLimit({
  windowMs: 3_600_000,
  limit: 20,
  ...limiterDefaults,
  message: { error: 'link limit reached, try later' },
});

/** Поиск: каждый запрос с эмбеддингом — платный вызов API */
export const searchLimiter = rateLimit({
  windowMs: 60_000,
  limit: 20,
  ...limiterDefaults,
  message: { error: 'search limit reached, try later' },
});
