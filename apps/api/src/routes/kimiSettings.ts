/**
 * Настройки Kimi/Moonshot API (только admin/super_admin).
 * GET  /api/admin/kimi-settings — текущие (ключ маскирован) + список моделей аккаунта
 * POST /api/admin/kimi-settings — сохранить {apiKey?, baseUrl?, textModel?, imageModel?, embedModel?}
 *       (передать только изменяемые поля; apiKey='' — стереть ключ)
 */
import { Router } from 'express';
import { z } from 'zod';
import { authRequired, requireRole } from '../middleware/auth.js';
import { getKimiSettings, saveKimiSettings, maskKey, listModels } from '../services/kimiSettings.js';

export const kimiSettingsRouter = Router();

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
  baseUrl: z.string().url().max(200).optional(),
  textModel: z.string().max(100).optional(),
  imageModel: z.string().max(100).optional(),
  embedModel: z.string().max(100).optional(),
});

kimiSettingsRouter.post('/admin/kimi-settings', authRequired, requireRole('admin', 'super_admin'), async (req, res) => {
  const parsed = patchSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: 'validation', details: parsed.error.flatten() });
    return;
  }
  await saveKimiSettings(parsed.data);
  const s = await getKimiSettings();
  res.json({ ok: true, settings: { apiKeyMasked: maskKey(s.apiKey), hasKey: Boolean(s.apiKey), baseUrl: s.baseUrl, textModel: s.textModel, imageModel: s.imageModel, embedModel: s.embedModel } });
});
