/**
 * Настройки LLM-провайдеров (Kimi/Moonshot и DeepSeek).
 * GET  /api/admin/kimi-settings — чтение (admin/super_admin), ключи маскированы,
 *      списки моделей обоих провайдеров (modelsKimi / modelsDeepseek)
 * POST /api/admin/kimi-settings — ИЗМЕНЕНИЕ (admin/super_admin).
 *      Вектор угона ключа через подмену baseUrl закрыт allowlist'ом хостов (baseUrlSchema
 *      ниже + фиксированный хост DeepSeek), аудит 2026-11-08; guard ослаблен с
 *      super_admin до admin 2026-11-09 — операции с провайдером/моделями нужны админу
 *      {provider?, apiKey?, baseUrl?, textModel?, imageModel?, embedModel?,
 *       deepseekApiKey?, deepseekModel?} (apiKey/deepseekApiKey='' — стереть)
 * DeepSeek — OpenAI-совместимый API (https://api.deepseek.com), ключ жёстко
 * привязан к официальному хосту — baseUrl для него не настраивается (SSRF-защита).
 */
import { Router } from 'express';
import { z } from 'zod';
import { authRequired, requireRole } from '../middleware/auth.js';
import { getKimiSettings, saveKimiSettings, maskKey, listModels, DEEPSEEK_BASE_URL } from '../services/kimiSettings.js';

export const kimiSettingsRouter = Router();

/** Домены, которым разрешено получать Kimi-ключ (защита от SSRF/угона ключа) */
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

function publicSettings(s: Awaited<ReturnType<typeof getKimiSettings>>) {
  return {
    provider: s.provider,
    apiKeyMasked: maskKey(s.apiKey),
    hasKey: Boolean(s.apiKey),
    baseUrl: s.baseUrl,
    textModel: s.textModel,
    imageModel: s.imageModel,
    embedModel: s.embedModel,
    deepseekApiKeyMasked: maskKey(s.deepseekApiKey),
    hasDeepseekKey: Boolean(s.deepseekApiKey),
    deepseekModel: s.deepseekModel,
    deepseekBaseUrl: DEEPSEEK_BASE_URL, // фиксирован, для подсказки в UI
  };
}

kimiSettingsRouter.get('/admin/kimi-settings', authRequired, requireRole('admin', 'super_admin'), async (_req, res) => {
  const s = await getKimiSettings();
  const [kimi, deepseek] = await Promise.all([
    listModels(s.baseUrl, s.apiKey),
    listModels(DEEPSEEK_BASE_URL, s.deepseekApiKey),
  ]);
  res.json({
    settings: publicSettings(s),
    models: kimi.models.map((m) => m.id),          // активный список — Kimi (обратная совместимость)
    modelsKimi: kimi.models.map((m) => m.id),
    modelsDeepseek: deepseek.models.map((m) => m.id),
    modelsError: kimi.error ?? null,
    modelsDeepseekError: deepseek.error ?? null,
  });
});

const patchSchema = z.object({
  provider: z.enum(['kimi', 'deepseek']).optional(),
  apiKey: z.string().max(200).optional(),
  baseUrl: baseUrlSchema.optional(),
  textModel: z.string().max(100).optional(),
  imageModel: z.string().max(100).optional(),
  embedModel: z.string().max(100).optional(),
  deepseekApiKey: z.string().max(200).optional(),
  deepseekModel: z.string().max(100).optional(),
});

kimiSettingsRouter.post('/admin/kimi-settings', authRequired, requireRole('admin', 'super_admin'), async (req, res) => {
  const parsed = patchSchema.safeParse(req.body);
  if (!parsed.success) {
    const first = Object.values(parsed.error.flatten().fieldErrors)[0]?.[0];
    res.status(400).json({ error: 'validation', message: first ?? 'Проверьте поля' });
    return;
  }
  await saveKimiSettings(parsed.data);
  const s = await getKimiSettings();
  res.json({ ok: true, settings: publicSettings(s) });
});
