/**
 * Эмбеддинги через Moonshot (OpenAI-совместимый /v1/embeddings).
 * Модель — 1024-мерная (под колонку vector(1024) в article_embeddings).
 * Без ключа — null: поиск честно работает только в FTS-режиме.
 */
import { config } from '../config.js';

export interface EmbedResult {
  vector: number[];
  model: string;
}

export async function embedText(text: string): Promise<EmbedResult | null> {
  if (!config.moonshotApiKey || !config.moonshotEmbedModel) return null;
  const res = await fetch(`${config.moonshotBaseUrl}/embeddings`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${config.moonshotApiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ model: config.moonshotEmbedModel, input: text.slice(0, 8000) }),
  });
  const data = (await res.json().catch(() => ({}))) as {
    data?: { embedding?: number[] }[];
    error?: { message?: string };
  };
  if (!res.ok || !data.data?.[0]?.embedding) {
    throw new Error(`embeddings API: ${res.status} ${data.error?.message ?? 'no data'}`);
  }
  return { vector: data.data[0].embedding, model: config.moonshotEmbedModel };
}
