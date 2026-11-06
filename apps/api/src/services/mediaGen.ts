/**
 * Генерация обложек через Kimi (Moonshot) Images API.
 * Без KIMI_API_KEY — mock-режим: фирменная SVG-заглушка (тёмный фон + оранжевый
 * акцент), чтобы весь UX редактора работал до появления ключа.
 */
import { createHash } from 'node:crypto';
import { config } from '../config.js';

export interface GeneratedImage {
  buffer: Buffer;
  mime: string;
  ext: string;
}

export async function generateImage(prompt: string): Promise<GeneratedImage> {
  if (!config.moonshotApiKey) return mockImage(prompt);
  return kimiImage(prompt);
}

async function kimiImage(prompt: string): Promise<GeneratedImage> {
  const res = await fetch(`${config.moonshotBaseUrl}/images/generations`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${config.moonshotApiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ model: config.moonshotImageModel, prompt, n: 1, size: '1024x1536' }),
  });
  const data = (await res.json().catch(() => ({}))) as {
    data?: { b64_json?: string; url?: string }[];
    error?: { message?: string };
  };
  if (!res.ok || !data.data?.[0]) {
    throw new Error(`Kimi image API: ${res.status} ${data.error?.message ?? JSON.stringify(data).slice(0, 200)}`);
  }
  const item = data.data[0];
  if (item.b64_json) {
    return { buffer: Buffer.from(item.b64_json, 'base64'), mime: 'image/png', ext: 'png' };
  }
  if (item.url) {
    const img = await fetch(item.url);
    if (!img.ok) throw new Error(`Не удалось скачать картинку: ${img.status}`);
    const mime = img.headers.get('content-type') ?? 'image/png';
    const ext = mime.includes('jpeg') ? 'jpg' : mime.includes('webp') ? 'webp' : 'png';
    return { buffer: Buffer.from(await img.arrayBuffer()), mime, ext };
  }
  throw new Error('Kimi image API: пустой ответ (нет b64_json и url)');
}

// Фирменная заглушка: тёмный фон, градиент из хэша промпта, оранжевый акцент
function mockImage(prompt: string): GeneratedImage {
  const hash = createHash('sha256').update(prompt).digest();
  const hue = 18 + (hash[0] % 18); // 18–36°: оранжевый диапазон
  const hue2 = (hue + 200) % 360;
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="768" height="1024" viewBox="0 0 768 1024">
  <defs>
    <linearGradient id="g" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0" stop-color="hsl(${hue}, 70%, 18%)"/>
      <stop offset="0.6" stop-color="#18181b"/>
      <stop offset="1" stop-color="hsl(${hue2}, 40%, 14%)"/>
    </linearGradient>
    <radialGradient id="a" cx="0.75" cy="0.25" r="0.6">
      <stop offset="0" stop-color="hsl(${hue}, 90%, 55%)" stop-opacity="0.55"/>
      <stop offset="1" stop-color="hsl(${hue}, 90%, 55%)" stop-opacity="0"/>
    </radialGradient>
  </defs>
  <rect width="768" height="1024" fill="url(#g)"/>
  <rect width="768" height="1024" fill="url(#a)"/>
  <circle cx="576" cy="256" r="120" fill="none" stroke="hsl(${hue}, 90%, 60%)" stroke-width="3" opacity="0.7"/>
  <circle cx="576" cy="256" r="60" fill="hsl(${hue}, 90%, 60%)" opacity="0.35"/>
  <line x1="0" y1="820" x2="768" y2="740" stroke="hsl(${hue}, 90%, 60%)" stroke-width="2" opacity="0.4"/>
  <text x="48" y="944" font-family="system-ui, sans-serif" font-size="28" font-weight="700" fill="#a1a1aa" letter-spacing="4">ИНВЕСТИЦИОННО.РФ</text>
  <text x="48" y="980" font-family="system-ui, sans-serif" font-size="16" fill="#71717a" letter-spacing="2">MOCK COVER · БЕЗ КЛЮЧА KIMI</text>
</svg>`;
  return { buffer: Buffer.from(svg, 'utf-8'), mime: 'image/svg+xml', ext: 'svg' };
}
