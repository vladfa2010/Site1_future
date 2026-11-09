/**
 * Генерация текстов через выбранный LLM-провайдер (Kimi/Moonshot или DeepSeek —
 * переключается в админке, поле provider). Оба API OpenAI-совместимые.
 * Используется для лидов/выжимок: промпт собирается из всех полей статьи.
 * Без ключа активного провайдера — mock-режим: экстракция первых предложений.
 */
import { getKimiSettings, DEEPSEEK_BASE_URL } from './kimiSettings.js';

/** Генерирует текст по промпту. maxChars — мягкое ограничение длины результата. */
export async function generateText(prompt: string, maxChars = 400, persona: TextPersona = 'editor'): Promise<string> {
  const s = await getKimiSettings();
  const key = s.provider === 'deepseek' ? s.deepseekApiKey : s.apiKey;
  if (!key) return mockExtract(prompt);
  if (s.provider === 'deepseek') return chatCompletion(DEEPSEEK_BASE_URL, key, s.deepseekModel, prompt, maxChars, persona, 'DeepSeek');
  return chatCompletion(s.baseUrl, key, s.textModel, prompt, maxChars, persona, 'Kimi');
}

export type TextPersona = 'editor' | 'seo';

const PERSONA_PROMPTS: Record<TextPersona, string> = {
  editor: 'Ты редактор инвестиционного медиа. Пишешь короткие ёмкие лиди на русском. Отвечаешь ТОЛЬКО готовым текстом без пояснений и кавычек.',
  seo: 'Ты опытный SEO-специалист. Читаешь статью целиком и пишешь meta description: уникально, информативно, с ключевыми словами из текста, с призывом к действию где уместно. Без кликбейта и обещаний. Отвечаешь ТОЛЬКО готовым текстом без пояснений и кавычек.',
};

/** OpenAI-совместимый chat/completions — общий для Kimi и DeepSeek. */
export async function chatCompletion(
  baseUrl: string,
  apiKey: string,
  model: string,
  prompt: string,
  maxChars: number,
  persona: TextPersona,
  label: string,
): Promise<string> {
  const res = await fetch(`${baseUrl}/chat/completions`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model,
      messages: [
        { role: 'system', content: PERSONA_PROMPTS[persona] },
        { role: 'user', content: prompt },
      ],
      max_tokens: Math.min(512, Math.ceil(maxChars / 2) + 80),
      temperature: persona === 'seo' ? 0.3 : 0.4,
    }),
  });
  const data = (await res.json().catch(() => ({}))) as {
    choices?: { message?: { content?: string; reasoning_content?: string } }[];
    error?: { message?: string };
  };
  // reasoner-модели DeepSeek отдают мысль в reasoning_content, ответ — в content
  const text = data.choices?.[0]?.message?.content ?? '';
  if (!res.ok || !text) {
    throw new Error(`${label} chat API: ${res.status} ${data.error?.message ?? 'пустой ответ'}`);
  }
  return text.trim();
}

/**
 * Mock без ключа: ищет в промпте блок «ТЕКСТ: ...» и берёт первые предложения,
 * чтобы UX кнопки работал до появления ключа.
 */
function mockExtract(prompt: string): string {
  const m = prompt.match(/ТЕКСТ:\s*([\s\S]+)/);
  if (!m) return '';
  const text = m[1].replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
  // первые 2–3 предложения, до ~300 символов
  const sentences = text.match(/[^.!?…]+[.!?…]+/g) ?? [text];
  let out = '';
  for (const s of sentences.slice(0, 3)) {
    if ((out + s).length > 300) break;
    out += s.trim() + ' ';
  }
  return out.trim() || text.slice(0, 300);
}
