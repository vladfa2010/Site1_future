/**
 * Генерация обложек через Kimi (Moonshot) Images API.
 * Без KIMI_API_KEY — mock-режим: фирменная PNG-заглушка (тёмный фон + оранжевый
 * акцент), чтобы весь UX редактора работал до появления ключа.
 *
 * Аудит 2026-11-14: сохраняем и отдаём ТОЛЬКО растр (jpeg/png/webp) с определением
 * формата по магическим байтам — SVG с image/svg+xml это active content (XSS),
 * а content-type от API/заголовки нельзя доверять.
 */
import { createHash } from 'node:crypto';
import { deflateSync } from 'node:zlib';
import { getKimiSettings } from './kimiSettings.js';
import { sniffImageFormat, mimeFor, extFor } from '../utils/imageSniff.js';

export interface GeneratedImage {
  buffer: Buffer;
  mime: string;
  ext: string;
}

function raster(buffer: Buffer): GeneratedImage {
  const fmt = sniffImageFormat(buffer);
  if (!fmt) throw new Error('Неподдерживаемый формат картинки: нужен jpeg/png/webp по магическим байтам');
  return { buffer, mime: mimeFor(fmt), ext: extFor(fmt) };
}

export async function generateImage(prompt: string): Promise<GeneratedImage> {
  const s = await getKimiSettings();
  if (!s.apiKey) return mockImage(prompt);
  return kimiImage(prompt, s);
}

async function kimiImage(prompt: string, s: { apiKey: string; baseUrl: string; imageModel: string }): Promise<GeneratedImage> {
  const res = await fetch(`${s.baseUrl}/images/generations`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${s.apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ model: s.imageModel, prompt, n: 1, size: '1024x1536' }),
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
    return raster(Buffer.from(item.b64_json, 'base64'));
  }
  if (item.url) {
    const img = await fetch(item.url);
    if (!img.ok) throw new Error(`Не удалось скачать картинку: ${img.status}`);
    return raster(Buffer.from(await img.arrayBuffer())); // формат — по магическим байтам, не по content-type
  }
  throw new Error('Kimi image API: пустой ответ (нет b64_json и url)');
}

// ---------- Минимальный PNG-энкодер (rgba → png через zlib) ----------

const CRC_TABLE = (() => {
  const t = new Int32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    t[n] = c;
  }
  return t;
})();

function crc32(buf: Buffer): number {
  let c = -1;
  for (let i = 0; i < buf.length; i++) c = CRC_TABLE[(c ^ buf[i]) & 0xff]! ^ (c >>> 8);
  return (c ^ -1) >>> 0;
}

function pngChunk(type: string, data: Buffer): Buffer {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length, 0);
  const body = Buffer.concat([Buffer.from(type, 'ascii'), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(body), 0);
  return Buffer.concat([len, body, crc]);
}

/** RGBA-буфер (width×height×4) → PNG. */
function encodePng(width: number, height: number, rgba: Buffer): Buffer {
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8;  // bit depth
  ihdr[9] = 6;  // color type: RGBA
  const stride = width * 4 + 1;
  const raw = Buffer.alloc(stride * height);
  for (let y = 0; y < height; y++) {
    raw[y * stride] = 0; // filter: None
    rgba.copy(raw, y * stride + 1, y * width * 4, (y + 1) * width * 4);
  }
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    pngChunk('IHDR', ihdr),
    pngChunk('IDAT', deflateSync(raw, { level: 9 })),
    pngChunk('IEND', Buffer.alloc(0)),
  ]);
}

/** hsl → [r, g, b] (h 0–360, s/l 0–1). */
function hsl(h: number, s: number, l: number): [number, number, number] {
  const a = s * Math.min(l, 1 - l);
  const f = (n: number) => {
    const k = (n + h / 30) % 12;
    return Math.round(255 * (l - a * Math.max(-1, Math.min(k - 3, Math.min(9 - k, 1)))));
  };
  return [f(0), f(8), f(4)];
}

// Фирменная заглушка: тёмный фон с градиентом из хэша промпта, оранжевое пятно-акцент.
// Только PNG: SVG-заглушка раздавалась с image/svg+xml (active content, аудит 2026-11-14).
function mockImage(prompt: string): GeneratedImage {
  const hash = createHash('sha256').update(prompt).digest();
  const hue = 18 + (hash[0]! % 18); // 18–36°: оранжевый диапазон
  const W = 768;
  const H = 1024;
  const [r1, g1, b1] = hsl(hue, 0.7, 0.18);
  const [r2, g2, b2] = hsl((hue + 200) % 360, 0.4, 0.14);
  const [ra, ga, ba] = hsl(hue, 0.9, 0.55);
  const cx = W * 0.75;
  const cy = H * 0.25;
  const R = 260; // радиус акцента
  const rgba = Buffer.alloc(W * H * 4);
  for (let y = 0; y < H; y++) {
    const t = y / H;
    const br = Math.round(r1 + (r2 - r1) * t);
    const bg = Math.round(g1 + (g2 - g1) * t);
    const bb = Math.round(b1 + (b2 - b1) * t);
    for (let x = 0; x < W; x++) {
      const i = (y * W + x) * 4;
      // акцент: мягкое свечение в точке (cx, cy)
      const d = Math.hypot(x - cx, y - cy) / R;
      const glow = Math.max(0, 1 - d);
      const a = 0.55 * glow * glow;
      rgba[i] = Math.min(255, Math.round(br + ra * a));
      rgba[i + 1] = Math.min(255, Math.round(bg + ga * a));
      rgba[i + 2] = Math.min(255, Math.round(bb + ba * a));
      rgba[i + 3] = 255;
    }
  }
  return { buffer: encodePng(W, H, rgba), mime: 'image/png', ext: 'png' };
}
