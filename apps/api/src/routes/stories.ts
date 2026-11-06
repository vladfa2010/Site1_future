/**
 * Сюжеты (stories): публичное чтение хронологии, создание — admin.
 */
import { Router } from 'express';
import { z } from 'zod';
import { and, asc, eq } from 'drizzle-orm';
import { db, stories, articles, articleStories } from '@newinvest/db';
import { authRequired, requireRole } from '../middleware/auth.js';

export const storiesRouter = Router();

storiesRouter.get('/stories', async (_req, res) => {
  const rows = await db.select().from(stories).orderBy(stories.name).limit(100);
  res.json({ stories: rows });
});

// GET /api/stories/spacex-ipo — хронология сюжета
storiesRouter.get('/stories/:slug', async (req, res) => {
  const [story] = await db.select().from(stories).where(eq(stories.slug, req.params.slug)).limit(1);
  if (!story) {
    res.status(404).json({ error: 'not found' });
    return;
  }
  const storyArticles = await db
    .select({
      id: articles.id,
      type: articles.type,
      slug: articles.slug,
      title: articles.title,
      excerpt: articles.excerpt,
      publishedAt: articles.publishedAt,
      status: articles.status,
      isPrimary: articleStories.isPrimary,
    })
    .from(articleStories)
    .innerJoin(articles, eq(articleStories.articleId, articles.id))
    .where(and(eq(articleStories.storyId, story.id), eq(articles.status, 'published')))
    .orderBy(asc(articles.publishedAt))
    .limit(100);
  res.json({ story, articles: storyArticles });
});

const storySchema = z.object({
  slug: z.string().regex(/^[a-z0-9-]+$/, 'slug: латиница, цифры, дефис'),
  name: z.string().min(1),
  description: z.string().optional(),
  status: z.enum(['active', 'closed']).optional(),
});

storiesRouter.post('/stories', authRequired, requireRole('admin', 'super_admin'), async (req, res) => {
  const parsed = storySchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: 'validation', details: parsed.error.flatten() });
    return;
  }
  const [row] = await db.insert(stories).values(parsed.data).returning();
  res.status(201).json({ story: row });
});
