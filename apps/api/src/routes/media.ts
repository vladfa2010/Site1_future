/**
 * Медиатека: генерация обложек, отдача загруженных файлов.
 * POST /api/media/generate {prompt, articleId?} — генерирует картинку,
 * сохраняет в uploadDir, создаёт media-запись, при articleId ставит обложку статье.
 */
import { Router } from 'express';
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { createHash } from 'node:crypto';
import multer from 'multer';
import { z } from 'zod';
import { desc, eq } from 'drizzle-orm';
import { db, media, articles } from '@newinvest/db';
import { authRequired, requireRole } from '../middleware/auth.js';
import { generateImage } from '../services/mediaGen.js';
import { generateText } from '../services/textGen.js';
import { getKimiSettings } from '../services/kimiSettings.js';
import { config } from '../config.js';

export const mediaRouter = Router();

// ---------- Медиатека ----------

mediaRouter.get('/media', authRequired, requireRole('admin', 'super_admin'), async (_req, res) => {
  const rows = await db.select().from(media).orderBy(desc(media.createdAt)).limit(200);
  res.json({ media: rows });
});

// загрузка файла (картинка) — multer в память, валидация типа, запись в uploadDir
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 5 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    // Только растровые: SVG с клиента — stored-XSS вектор (<script> внутри)
    const ok = ['image/jpeg', 'image/png', 'image/webp'].includes(file.mimetype);
    cb(null, ok);
  },
});

mediaRouter.post('/media/upload', authRequired, requireRole('admin', 'super_admin'), upload.single('file'), async (req, res) => {
  if (!req.file) {
    res.status(400).json({ error: 'file required (jpeg, png, webp, до 5 МБ)' });
    return;
  }
  // магические байты: mimetype от клиента подделывается — проверяем сигнатуру файла
  const buf = req.file.buffer;
  const isPng = buf.length > 8 && buf[0] === 0x89 && buf[1] === 0x50 && buf[2] === 0x4e && buf[3] === 0x47;
  const isJpg = buf.length > 3 && buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff;
  const isWebp = buf.length > 12 && buf.toString('ascii', 0, 4) === 'RIFF' && buf.toString('ascii', 8, 12) === 'WEBP';
  if (!isPng && !isJpg && !isWebp) {
    res.status(400).json({ error: 'содержимое не похоже на jpeg/png/webp' });
    return;
  }
  const dir = path.resolve(config.uploadDir);
  await mkdir(dir, { recursive: true });
  const ext = { 'image/jpeg': 'jpg', 'image/png': 'png', 'image/webp': 'webp' }[req.file.mimetype as string] ?? 'bin';
  const name = `${Date.now()}-${createHash('sha1').update(req.file.buffer).digest('hex').slice(0, 10)}.${ext}`;
  await writeFile(path.join(dir, name), req.file.buffer);
  const url = `/uploads/${name}`;
  const [row] = await db.insert(media).values({ filePath: url, alt: req.body.alt ?? null, sourceUrl: 'upload' }).returning();
  res.status(201).json({ media: row, url });
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
    const name = `${Date.now()}-${createHash('sha1').update(prompt).digest('hex').slice(0, 10)}.${img.ext}`;
    await writeFile(path.join(dir, name), img.buffer);

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
  persona: z.enum(['editor', 'seo']).default('editor'), // системный промпт — только из этого списка (сервер)
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
