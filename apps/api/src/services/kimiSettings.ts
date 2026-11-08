/**
 * Настройки LLM-провайдеров (Kimi/Moonshot и DeepSeek) — хранятся в meta_fields
 * (ownerType='app', ownerId=0), поверх env-переменных. Сервисы генерации
 * (обложки, тексты, эмбеддинги) читают ключ и модели отсюда — админ меняет
 * без перезапуска и без правки env. Провайдера текста выбирает поле provider.
 * Кэш в памяти, инвалидация при сохранении.
 */
import { eq, and } from 'drizzle-orm';
import { db, metaFields } from '@newinvest/db';
import { config } from '../config.js';

export type LlmProvider = 'kimi' | 'deepseek';

export interface KimiSettings {
  provider: LlmProvider; // кто генерирует ТЕКСТЫ (обложки/эмбеддинги — пока только Kimi)
  apiKey: string;
  baseUrl: string;
  textModel: string;
  imageModel: string;
  embedModel: string;
  deepseekApiKey: string;
  deepseekModel: string;
}

export const DEEPSEEK_BASE_URL = 'https://api.deepseek.com';
export const DEEPSEEK_MODEL_HINTS = ['deepseek-chat', 'deepseek-reasoner', 'deepseek-flash', 'deepseek-v4-pro'];

const OWNER = { ownerType: 'app', ownerId: 0 };

let cache: KimiSettings | null = null;

async function load(): Promise<KimiSettings> {
  const rows = await db.select().from(metaFields)
    .where(and(eq(metaFields.ownerType, OWNER.ownerType), eq(metaFields.ownerId, OWNER.ownerId)));
  const get = (key: string) => rows.find((r) => r.key === key)?.value ?? '';
  return {
    provider: get('llm_provider') === 'deepseek' ? 'deepseek' : 'kimi',
    apiKey: get('kimi_api_key') || config.moonshotApiKey,
    baseUrl: get('kimi_base_url') || config.moonshotBaseUrl,
    textModel: get('kimi_text_model') || config.moonshotTextModel,
    imageModel: get('kimi_image_model') || config.moonshotImageModel,
    embedModel: get('kimi_embed_model') || config.moonshotEmbedModel,
    deepseekApiKey: get('deepseek_api_key') || config.deepseekApiKey,
    deepseekModel: get('deepseek_model') || 'deepseek-chat',
  };
}

export async function getKimiSettings(): Promise<KimiSettings> {
  if (!cache) cache = await load();
  return cache;
}

export async function saveKimiSettings(patch: Partial<KimiSettings>): Promise<void> {
  const map: Record<string, string | undefined> = {
    llm_provider: patch.provider,
    kimi_api_key: patch.apiKey,
    kimi_base_url: patch.baseUrl,
    kimi_text_model: patch.textModel,
    kimi_image_model: patch.imageModel,
    kimi_embed_model: patch.embedModel,
    deepseek_api_key: patch.deepseekApiKey,
    deepseek_model: patch.deepseekModel,
  };
  for (const [key, value] of Object.entries(map)) {
    if (value === undefined) continue;
    await db.insert(metaFields)
      .values({ ...OWNER, key, value })
      .onConflictDoUpdate({ target: [metaFields.ownerType, metaFields.ownerId, metaFields.key], set: { value } });
  }
  cache = null; // инвалидация
}

/** Маскированный ключ для отдачи в админку (полный — только при вводе) */
export function maskKey(key: string): string {
  if (!key) return '';
  return key.length <= 8 ? '••••' + key.slice(-2) : '••••••••' + key.slice(-4);
}

interface LlmModel { id: string; object?: string; owned_by?: string }

/** Список моделей аккаунта через GET {baseUrl}/models (OpenAI-совместимый) */
export async function listModels(baseUrl: string, apiKey: string): Promise<{ models: LlmModel[]; error?: string }> {
  if (!apiKey) return { models: [], error: 'Ключ не задан' };
  try {
    const res = await fetch(`${baseUrl}/models`, {
      headers: { Authorization: `Bearer ${apiKey}` },
    });
    const data = (await res.json().catch(() => ({}))) as { data?: LlmModel[]; error?: { message?: string } };
    if (!res.ok) return { models: [], error: data.error?.message ?? `HTTP ${res.status}` };
    return { models: data.data ?? [] };
  } catch (e) {
    return { models: [], error: e instanceof Error ? e.message : 'network error' };
  }
}
