/**
 * Публичная телеметрия сайта.
 * POST /api/telemetry/page-load — замер загрузки страницы из браузера
 * (открытие страницы → готовность данных). Без авторизации, данные нечувствительные.
 */
import { Router } from 'express';
import { z } from 'zod';
import { db, pageLoadEvents } from '@newinvest/db';
import { optionalAuth } from '../middleware/auth.js';

export const telemetryRouter = Router();

const schema = z.object({
  path: z.string().regex(/^\/[a-z0-9\-/а-яё]*$/i).max(120),
  // 50мс — минимальное осмысленное время; 5 минут — потолок (вкладка была в фоне)
  loadMs: z.number().int().min(50).max(300_000),
});

telemetryRouter.post('/telemetry/page-load', optionalAuth, async (req, res) => {
  const parsed = schema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: 'validation' });
    return;
  }
  await db.insert(pageLoadEvents).values({
    path: parsed.data.path,
    loadMs: parsed.data.loadMs,
    userId: req.user?.id ?? null,
  });
  res.status(201).json({ ok: true });
});
