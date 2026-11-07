/**
 * Генерация текстов через Kimi (Moonshot) Chat API.
 * Используется для лидов/выжимок: промпт собирается из всех полей статьи.
 * Без ключа — mock-режим: выжимка делается экстракцией первых предложений текста.
 */
import { config } from '../config.js';

/** Генерирует текст по промпту. maxChars — мягкое ограничение длины результата. */
export async function generateText(prompt: string, maxChars = 400, persona: TextPersona = 'editor'): Promise<string> {
  if (!config.moonshotApiKey) return mockExtract(prompt);
  return kimiText(prompt, maxChars, persona);
}

export type TextPersona = 'editor' | 'seo';

const PERSONA_PROMPTS: Record<TextPersona, string> = {
  editor: 'Ты редактор инвестиционного медиа. Пишешь короткие ёмкие лиди на русском. Отвечаешь ТОЛЬКО готовым текстом без пояснений и кавычек.',
  seo: 'Ты опытный SEO-специалист. Читаешь статью целиком и пишешь meta description: уникально, информативно, с ключевыми словами из текста, с призывом к действию где уместно. Без кликбейта и обещаний. Отвечаешь ТОЛЬКО готовым текстом без пояснений и кавычек.',
};

async function kimiText(prompt: string, maxChars: number, persona: TextPersona): Promise<string> {
  const res = await fetch(`${config.moonshotBaseUrl}/chat/completions`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${config.moonshotApiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model: config.moonshotTextModel,
      messages: [
        { role: 'system', content: PERSONA_PROMPTS[persona] },
        { role: 'user', content: prompt },
      ],
      max_tokens: Math.min(512, Math.ceil(maxChars / 2) + 80),
      temperature: persona === 'seo' ? 0.3 : 0.4,
    }),
  });
  const data = (await res.json().catch(() => ({}))) as {
    choices?: { message?: { content?: string } }[];
    error?: { message?: string };
  };
  if (!res.ok || !data.choices?.[0]?.message?.content) {
    throw new Error(`Kimi chat API: ${res.status} ${data.error?.message ?? 'пустой ответ'}`);
  }
  return data.choices[0].message.content.trim();
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
