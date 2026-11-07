/**
 * Настройки Kimi/Moonshot API — хранятся в meta_fields (ownerType='app', ownerId=0),
 * поверх env-переменных. Сервисы генерации (обложки, тексты, эмбеддинги) читают
 * ключ и модели отсюда — админ меняет без перезапуска и без правки env.
 * Кэш в памяти, инвалидация при сохранении.
 */
import { eq, and } from 'drizzle-orm';
import { db, metaFields } from '@newinvest/db';
import { config } from '../config.js';

export interface KimiSettings {
  apiKey: string;
  baseUrl: string;
  textModel: string;
  imageModel: string;
  embedModel: string;
}

const OWNER = { ownerType: 'app', ownerId: 0 };
const KEYS = ['kimi_api_key', 'kimi_base_url', 'kimi_text_model', 'kimi_image_model', 'kimi_embed_model'] as const;

let cache: KimiSettings | null = null;

async function load(): Promise<KimiSettings> {
  const rows = await db.select().from(metaFields)
    .where(and(eq(metaFields.ownerType, OWNER.ownerType), eq(metaFields.ownerId, OWNER.ownerId)));
  const get = (key: string) => rows.find((r) => r.key === key)?.value ?? '';
  return {
    apiKey: get('kimi_api_key') || config.moonshotApiKey,
    baseUrl: get('kimi_base_url') || config.moonshotBaseUrl,
    textModel: get('kimi_text_model') || config.moonshotTextModel,
    imageModel: get('kimi_image_model') || config.moonshotImageModel,
    embedModel: get('kimi_embed_model') || config.moonshotEmbedModel,
  };
}

export async function getKimiSettings(): Promise<KimiSettings> {
  if (!cache) cache = await load();
  return cache;
}

export async function saveKimiSettings(patch: Partial<KimiSettings>): Promise<void> {
  const map: Record<string, string | undefined> = {
    kimi_api_key: patch.apiKey,
    kimi_base_url: patch.baseUrl,
    kimi_text_model: patch.textModel,
    kimi_image_model: patch.imageModel,
    kimi_embed_model: patch.embedModel,
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

interface MoonshotModel { id: string; object?: string; owned_by?: string }

/** Список моделей аккаунта через GET {baseUrl}/models (OpenAI-совместимый) */
export async function listModels(s: KimiSettings): Promise<{ models: MoonshotModel[]; error?: string }> {
  if (!s.apiKey) return { models: [], error: 'Ключ не задан' };
  try {
    const res = await fetch(`${s.baseUrl}/models`, {
      headers: { Authorization: `Bearer ${s.apiKey}` },
    });
    const data = (await res.json().catch(() => ({}))) as { data?: MoonshotModel[]; error?: { message?: string } };
    if (!res.ok) return { models: [], error: data.error?.message ?? `HTTP ${res.status}` };
    return { models: data.data ?? [] };
  } catch (e) {
    return { models: [], error: e instanceof Error ? e.message : 'network error' };
  }
}
