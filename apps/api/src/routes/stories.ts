/**
 * Сюжеты (stories): публичное чтение хронологии, создание — admin.
 */
import { Router } from 'express';
import { z } from 'zod';
import { and, asc, eq, sql } from 'drizzle-orm';
import { db, stories, articles, articleStories } from '@newinvest/db';
import { authRequired, requireRole } from '../middleware/auth.js';
import { virtualViewsSql } from '../services/viewsBump.js';

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
      videoUrl: articles.videoUrl, // ТЗ-08 R7: без него плеер на StoryPage не построить
      isPrimary: articleStories.isPrimary,
      viewsCount: virtualViewsSql, // ТЗ-03
    })
    .from(articleStories)
    .innerJoin(articles, eq(articleStories.articleId, articles.id))
    .where(and(eq(articleStories.storyId, story.id), eq(articles.status, 'published')))
    .orderBy(asc(articleStories.sortOrder), asc(articles.publishedAt)) // ТЗ-08 R6: порядок серий, fallback на дату
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

// PATCH /api/stories/:id
storiesRouter.patch('/stories/:id', authRequired, requireRole('admin', 'super_admin'), async (req, res) => {
  const parsed = storySchema.partial().safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: 'validation', details: parsed.error.flatten() });
    return;
  }
  const [row] = await db.update(stories).set(parsed.data).where(eq(stories.id, Number(req.params.id))).returning();
  if (!row) {
    res.status(404).json({ error: 'not found' });
    return;
  }
  res.json({ story: row });
});

// GET /api/stories/:id/articles — состав (admin)
storiesRouter.get('/stories/:id/articles', authRequired, requireRole('admin', 'super_admin'), async (req, res) => {
  const rows = await db
    .select({ articleId: articles.id, title: articles.title, publishedAt: articles.publishedAt, isPrimary: articleStories.isPrimary, sortOrder: articleStories.sortOrder })
    .from(articleStories)
    .innerJoin(articles, eq(articleStories.articleId, articles.id))
    .where(eq(articleStories.storyId, Number(req.params.id)))
    .orderBy(asc(articleStories.sortOrder), asc(articles.publishedAt)); // ТЗ-08 R6
  res.json({ articles: rows });
});

// PUT /api/stories/:id/articles — состав сюжета (транзакционно) + главная статья
const storyArticlesSchema = z.object({
  articleIds: z.array(z.number().int()),
  primaryArticleId: z.number().int().optional(),
});

storiesRouter.put('/stories/:id/articles', authRequired, requireRole('admin', 'super_admin'), async (req, res) => {
  const storyId = Number(req.params.id);
  const parsed = storyArticlesSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: 'validation', details: parsed.error.flatten() });
    return;
  }
  const { articleIds, primaryArticleId } = parsed.data;

  await db.transaction(async (tx) => {
    await tx.delete(articleStories).where(eq(articleStories.storyId, storyId));
    if (articleIds.length) {
      await tx.insert(articleStories).values(
        // ТЗ-08 R6: индекс массива articleIds — порядок серий (sort_order)
        articleIds.map((articleId, i) => ({ articleId, storyId, isPrimary: articleId === primaryArticleId, sortOrder: i })),
      );
    }
    await tx.update(stories).set({ primaryArticleId: primaryArticleId ?? null }).where(eq(stories.id, storyId));
  });

  const storyArticlesRows = await db
    .select({ articleId: articles.id, title: articles.title, publishedAt: articles.publishedAt, isPrimary: articleStories.isPrimary, sortOrder: articleStories.sortOrder })
    .from(articleStories)
    .innerJoin(articles, eq(articleStories.articleId, articles.id))
    .where(eq(articleStories.storyId, storyId))
    .orderBy(asc(articleStories.sortOrder), asc(articles.publishedAt)); // ТЗ-08 R6
  res.json({ articles: storyArticlesRows });
});
