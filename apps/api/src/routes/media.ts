/**
 * Медиатека: генерация обложек, отдача загруженных файлов.
 * POST /api/media/generate {prompt, articleId?} — генерирует картинку,
 * сохраняет в uploadDir, создаёт media-запись, при articleId ставит обложку статье.
 */
import { Router } from 'express';
import { mkdir, unlink, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { createHash } from 'node:crypto';
import multer from 'multer';
import { z } from 'zod';
import { desc, eq } from 'drizzle-orm';
import { db, media, articles, companies, trends, industries } from '@newinvest/db';
import { authRequired, requireRole } from '../middleware/auth.js';
import { generateImage } from '../services/mediaGen.js';
import { generateText } from '../services/textGen.js';
import { getKimiSettings } from '../services/kimiSettings.js';
import { config } from '../config.js';
import { sniffImageFormat } from '../utils/imageSniff.js';
import { optimizeImage } from '../utils/imageOptimize.js';

export const mediaRouter = Router();

// ---------- Медиатека ----------

mediaRouter.get('/media', authRequired, requireRole('admin', 'super_admin'), async (_req, res) => {
  const rows = await db.select().from(media).orderBy(desc(media.createdAt)).limit(200);
  res.json({ media: rows });
});

// DELETE /api/media/:id — только admin/super_admin.
// Ссылки на файл (обложки статей/компаний/трендов/отраслей) — FK БЕЗ cascade:
// обнуляем, иначе удаление упадёт. Файл с диска стираем после транзакции.
mediaRouter.delete('/media/:id', authRequired, requireRole('admin', 'super_admin'), async (req, res) => {
  const id = Number(req.params.id);
  const [existing] = await db.select().from(media).where(eq(media.id, id)).limit(1);
  if (!existing) {
    res.status(404).json({ error: 'not found' });
    return;
  }
  await db.transaction(async (tx) => {
    await tx.update(articles).set({ coverMediaId: null }).where(eq(articles.coverMediaId, id));
    await tx.update(companies).set({ logoMediaId: null }).where(eq(companies.logoMediaId, id));
    await tx.update(companies).set({ coverMediaId: null }).where(eq(companies.coverMediaId, id));
    await tx.update(trends).set({ coverMediaId: null }).where(eq(trends.coverMediaId, id));
    await tx.update(industries).set({ coverMediaId: null }).where(eq(industries.coverMediaId, id));
    await tx.delete(media).where(eq(media.id, id));
  });
  // физический файл — только если он наш (в uploadDir), basename отсекает ../
  if (existing.filePath.startsWith('/uploads/')) {
    await unlink(path.join(path.resolve(config.uploadDir), path.basename(existing.filePath))).catch(() => {});
  }
  res.json({ ok: true });
});

// загрузка файла (картинка) — multer в память, валидация типа, запись в uploadDir
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 10 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    // Только растровые: SVG с клиента — stored-XSS вектор (<script> внутри)
    const ok = ['image/jpeg', 'image/png', 'image/webp'].includes(file.mimetype);
    cb(null, ok);
  },
});

mediaRouter.post('/media/upload', authRequired, requireRole('admin', 'super_admin'), upload.single('file'), async (req, res) => {
  if (!req.file) {
    res.status(400).json({ error: 'file required (jpeg, png, webp, до 10 МБ)' });
    return;
  }
  // магические байты: mimetype от клиента подделывается — проверяем сигнатуру файла
  const sniffed = sniffImageFormat(req.file.buffer);
  if (!sniffed) {
    res.status(400).json({ error: 'содержимое не похоже на jpeg/png/webp' });
    return;
  }
  const dir = path.resolve(config.uploadDir);
  await mkdir(dir, { recursive: true });
  // пережатие: до 1600px по ширине + WebP q80 — иначе многомегабайтные оригиналы убивают скорость
  const optimized = await optimizeImage(req.file.buffer, sniffed);
  const name = `${Date.now()}-${createHash('sha1').update(optimized.buffer).digest('hex').slice(0, 10)}.${optimized.ext}`;
  await writeFile(path.join(dir, name), optimized.buffer);
  const url = `/uploads/${name}`;
  const [row] = await db.insert(media).values({ filePath: url, alt: req.body.alt ?? null, sourceUrl: 'upload' }).returning();
  res.status(201).json({ media: row, url, optimized: { from: optimized.originalBytes, to: optimized.optimizedBytes } });
});

const generateSchema = z.object({
  prompt: z.string().min(10),
  articleId: z.number().int().optional(),
});

mediaRouter.post('/media/generate', authRequired, requireRole('admin', 'super_admin'), async (req, res) => {
  const parsed = generateSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: 'validation', details: parsed.error.flatten() });
    return;
  }
  const { prompt, articleId } = parsed.data;

  try {
    const s = await getKimiSettings();
    const img = await generateImage(prompt);
    const dir = path.resolve(config.uploadDir);
    await mkdir(dir, { recursive: true });
    // пережимаем и сгенерированное: PNG 1024² ~1–2 МБ → WebP обычно 100–300 КБ
    const optimized = await optimizeImage(img.buffer, img.ext);
    const name = `${Date.now()}-${createHash('sha1').update(prompt).digest('hex').slice(0, 10)}.${optimized.ext}`;
    await writeFile(path.join(dir, name), optimized.buffer);

    const url = `/uploads/${name}`;
    const [row] = await db
      .insert(media)
      .values({ filePath: url, alt: prompt.slice(0, 120), sourceUrl: s.apiKey ? 'kimi-image-api' : 'mock-generator' })
      .returning();

    if (articleId) {
      await db.update(articles).set({ coverMediaId: row.id }).where(eq(articles.id, articleId));
    }

    res.status(201).json({ media: row, url, mock: !s.apiKey });
  } catch (e) {
    res.status(502).json({ error: 'generation failed', message: e instanceof Error ? e.message : 'unknown' });
  }
});

// ---------- Генерация текста (лиды, выжимки) ----------

const generateTextSchema = z.object({
  prompt: z.string().min(10),
  maxChars: z.number().int().min(50).max(2000).default(400),
  persona: z.enum(['editor', 'seo', 'visual']).default('editor'), // системный промпт — только из этого списка (сервер)
});

// POST /api/media/generate-text {prompt, maxChars, persona} — текст по промпту (клиент собирает контекст)
mediaRouter.post('/media/generate-text', authRequired, requireRole('admin', 'super_admin'), async (req, res) => {
  const parsed = generateTextSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: 'validation', details: parsed.error.flatten() });
    return;
  }
  try {
    const text = await generateText(parsed.data.prompt, parsed.data.maxChars, parsed.data.persona);
    if (!text) {
      res.status(422).json({ error: 'empty result', message: 'Недостаточно контекста — заполните текст статьи' });
      return;
    }
    const s = await getKimiSettings();
    const activeKey = s.provider === 'deepseek' ? s.deepseekApiKey : s.apiKey;
    res.json({ text, mock: !activeKey });
  } catch (e) {
    res.status(502).json({ error: 'generation failed', message: e instanceof Error ? e.message : 'unknown' });
  }
});

// PATCH /api/media/:id — переименование (alt — подпись/название картинки)
mediaRouter.patch('/media/:id', authRequired, requireRole('admin', 'super_admin'), async (req, res) => {
  const id = Number(req.params.id);
  const parsed = z.object({ alt: z.string().trim().max(200) }).safeParse(req.body);
  if (!Number.isInteger(id) || !parsed.success) {
    res.status(400).json({ error: 'validation' });
    return;
  }
  const [row] = await db.update(media).set({ alt: parsed.data.alt }).where(eq(media.id, id)).returning();
  if (!row) {
    res.status(404).json({ error: 'not found' });
    return;
  }
  res.json({ media: row });
});
