/**
 * Настройки Kimi/Moonshot API.
 * GET  /api/admin/kimi-settings — чтение (admin/super_admin), ключ маскирован
 * POST /api/admin/kimi-settings — ИЗМЕНЕНИЕ (только super_admin — иначе admin может
 *      увести ключ через подмену baseUrl, см. аудит безопасности 2026-11-08)
 *      {apiKey?, baseUrl?, textModel?, imageModel?, embedModel?} (apiKey='' — стереть)
 */
import { Router } from 'express';
import { z } from 'zod';
import { authRequired, requireRole } from '../middleware/auth.js';
import { getKimiSettings, saveKimiSettings, maskKey, listModels } from '../services/kimiSettings.js';

export const kimiSettingsRouter = Router();

/** Домены, которым разрешено получать ключ (защита от SSRF/угона ключа) */
const BASE_URL_HOSTS = ['api.moonshot.ai', 'api.moonshot.cn', 'api.kimi.com'];
const baseUrlSchema = z.string().url().max(200).refine(
  (u) => {
    try {
      // точное сравнение hostname — startsWith обходится (api.moonshot.ai.evil.com), аудит 2026-11-08
      return BASE_URL_HOSTS.includes(new URL(u).hostname);
    } catch {
      return false;
    }
  },
  { message: `baseUrl: только хосты ${BASE_URL_HOSTS.join(', ')}` },
);

kimiSettingsRouter.get('/admin/kimi-settings', authRequired, requireRole('admin', 'super_admin'), async (_req, res) => {
  const s = await getKimiSettings();
  const { models, error } = await listModels(s);
  res.json({
    settings: {
      apiKeyMasked: maskKey(s.apiKey),
      hasKey: Boolean(s.apiKey),
      baseUrl: s.baseUrl,
      textModel: s.textModel,
      imageModel: s.imageModel,
      embedModel: s.embedModel,
    },
    models: models.map((m) => m.id),
    modelsError: error ?? null,
  });
});

const patchSchema = z.object({
  apiKey: z.string().max(200).optional(),
  baseUrl: baseUrlSchema.optional(),
  textModel: z.string().max(100).optional(),
  imageModel: z.string().max(100).optional(),
  embedModel: z.string().max(100).optional(),
});

kimiSettingsRouter.post('/admin/kimi-settings', authRequired, requireRole('super_admin'), async (req, res) => {
  const parsed = patchSchema.safeParse(req.body);
  if (!parsed.success) {
    const first = Object.values(parsed.error.flatten().fieldErrors)[0]?.[0];
    res.status(400).json({ error: 'validation', message: first ?? 'Проверьте поля' });
    return;
  }
  await saveKimiSettings(parsed.data);
  const s = await getKimiSettings();
  res.json({ ok: true, settings: { apiKeyMasked: maskKey(s.apiKey), hasKey: Boolean(s.apiKey), baseUrl: s.baseUrl, textModel: s.textModel, imageModel: s.imageModel, embedModel: s.embedModel } });
});
