/**
 * Медиатека: генерация обложек, отдача загруженных файлов.
 * POST /api/media/generate {prompt, articleId?} — генерирует картинку,
 * сохраняет в uploadDir, создаёт media-запись, при articleId ставит обложку статье.
 */
import { Router } from 'express';
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { z } from 'zod';
import { eq } from 'drizzle-orm';
import { db, media, articles } from '@newinvest/db';
import { authRequired, requireRole } from '../middleware/auth.js';
import { generateImage } from '../services/mediaGen.js';
import { config } from '../config.js';

export const mediaRouter = Router();

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
    const img = await generateImage(prompt);
    const dir = path.resolve(config.uploadDir);
    await mkdir(dir, { recursive: true });
    const name = `${Date.now()}-${createHash('sha1').update(prompt).digest('hex').slice(0, 10)}.${img.ext}`;
    await writeFile(path.join(dir, name), img.buffer);

    const url = `/uploads/${name}`;
    const [row] = await db
      .insert(media)
      .values({ filePath: url, alt: prompt.slice(0, 120), sourceUrl: config.moonshotApiKey ? 'kimi-image-api' : 'mock-generator' })
      .returning();

    if (articleId) {
      await db.update(articles).set({ coverMediaId: row.id }).where(eq(articles.id, articleId));
    }

    res.status(201).json({ media: row, url, mock: !config.moonshotApiKey });
  } catch (e) {
    res.status(502).json({ error: 'generation failed', message: e instanceof Error ? e.message : 'unknown' });
  }
});
