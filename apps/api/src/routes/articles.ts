/**
 * Статьи: публичное чтение + создание/редактирование по ролям.
 * author — свои черновики; admin/super_admin — всё + публикация.
 */
import { Router } from 'express';
import { z } from 'zod';
import { and, desc, eq, sql, type SQL } from 'drizzle-orm';
import {
  db, articles, ARTICLE_TYPES, type ArticleType,
  companies, trends, articleCompanies, articleTrends, media,
  metaFields, articleViews, users,
} from '@newinvest/db';
import { uniqueSlug, plainTextToHtml } from '../utils/slug.js';
import { optionalAuth, authRequired, requireRole, ADMIN_ROLES } from '../middleware/auth.js';

export const articlesRouter = Router();

const createSchema = z.object({
  type: z.enum(ARTICLE_TYPES),
  slug: z.string().regex(/^[a-z0-9-]+$/, 'slug: латиница, цифры, дефис'),
  title: z.string().min(1),
  contentHtml: z.string().min(1),
  excerpt: z.string().optional(),
  thesis: z.string().optional(), // тезис идеи
  coverMediaId: z.number().int().optional(),
  metaDescription: z.string().max(300).optional(), // SEO (meta_fields)
  sourceUrl: z.string().url().optional(),
  status: z.enum(['draft', 'published']).default('draft'),
});

const patchSchema = createSchema.partial();

const isAdmin = (role?: string) => role !== undefined && ADMIN_ROLES.includes(role);

// GET /api/articles?type=novost&status=published&page=1&limit=20
articlesRouter.get('/', optionalAuth, async (req, res) => {
  const type = req.query.type as ArticleType | undefined;
  const page = Math.max(1, Number(req.query.page ?? 1));
  const limit = Math.min(100, Math.max(1, Number(req.query.limit ?? 20)));

  const conditions: SQL[] = [];
  if (type && (ARTICLE_TYPES as readonly string[]).includes(type)) {
    conditions.push(eq(articles.type, type));
  }
  // Публично видны только опубликованные; админ — любые (или по выбранному статусу)
  const requestedStatus = req.query.status as string | undefined;
  if (isAdmin(req.user?.role)) {
    if (requestedStatus) conditions.push(eq(articles.status, requestedStatus));
  } else {
    conditions.push(eq(articles.status, 'published'));
  }

  const where = conditions.length > 0 ? and(...conditions) : undefined;
  const rows = await db
    .select({
      id: articles.id,
      type: articles.type,
      slug: articles.slug,
      title: articles.title,
      excerpt: articles.excerpt,
      status: articles.status,
      publishedAt: articles.publishedAt,
      coverUrl: media.filePath,
    })
    .from(articles)
    .leftJoin(media, eq(articles.coverMediaId, media.id))
    .where(where)
    .orderBy(sql`${articles.publishedAt} desc nulls last`)
    .limit(limit)
    .offset((page - 1) * limit);

  res.json({ articles: rows, page, limit });
});

// GET /api/articles/:type/:slug — публичный просмотр
articlesRouter.get('/:type/:slug', optionalAuth, async (req, res) => {
  const { type, slug } = req.params;
  const [row] = await db
    .select({ article: articles, coverUrl: media.filePath })
    .from(articles)
    .leftJoin(media, eq(articles.coverMediaId, media.id))
    .where(and(eq(articles.type, type), eq(articles.slug, slug)))
    .limit(1);
  const article = row?.article;
  if (!article || (article.status !== 'published' && !isAdmin(req.user?.role) && article.authorId !== req.user?.id)) {
    res.status(404).json({ error: 'not found' });
    return;
  }
  // Публичные связи — чипсы для навигации «проваливание из любой точки» (раздел 4.2)
  const relCompanies = await db
    .select({ slug: companies.slug, name: companies.name })
    .from(articleCompanies)
    .innerJoin(companies, eq(articleCompanies.companyId, companies.id))
    .where(eq(articleCompanies.articleId, article.id));
  const relTrends = await db
    .select({ slug: trends.slug, name: trends.name })
    .from(articleTrends)
    .innerJoin(trends, eq(articleTrends.trendId, trends.id))
    .where(eq(articleTrends.articleId, article.id));
  // фиксируем просмотр (аналитика, раздел 6.2) — не блокируем ответ
  void db.insert(articleViews).values({ userId: req.user?.id ?? null, articleId: article.id }).catch(() => {});
  // SEO meta description (meta_fields)
  const [meta] = await db.select({ value: metaFields.value }).from(metaFields)
    .where(and(eq(metaFields.ownerType, 'article'), eq(metaFields.ownerId, article.id), eq(metaFields.key, 'meta_description')))
    .limit(1);
  res.json({ article, coverUrl: row.coverUrl, meta: { description: meta?.value ?? null }, relations: { companies: relCompanies, trends: relTrends } });
});

// POST /api/articles — author+; автор может только в черновики
articlesRouter.post('/', authRequired, requireRole('author', 'admin', 'super_admin'), async (req, res) => {
  const parsed = createSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: 'validation', details: parsed.error.flatten() });
    return;
  }
  const data = parsed.data;
  const { metaDescription, ...articleData } = data;
  // автор не публикует напрямую — только через admin (раздел 6.3)
  const status = isAdmin(req.user!.role) ? data.status : 'draft';

  const [row] = await db
    .insert(articles)
    .values({ ...articleData, status, authorId: req.user!.id })
    .returning();
  if (metaDescription) {
    await saveMetaDescription(row.id, metaDescription);
  }
  res.status(201).json({ article: row });
});

// SEO meta description для статьи (meta_fields, раздел 5.4)
async function saveMetaDescription(articleId: number, value: string) {
  await db.insert(metaFields)
    .values({ ownerType: 'article', ownerId: articleId, key: 'meta_description', value })
    .onConflictDoUpdate({ target: [metaFields.ownerType, metaFields.ownerId, metaFields.key], set: { value } });
}

// PATCH /api/articles/:id — автор: свои неопубликованные; admin: любые
articlesRouter.patch('/:id', authRequired, requireRole('author', 'admin', 'super_admin'), async (req, res) => {
  const id = Number(req.params.id);
  const parsed = patchSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: 'validation', details: parsed.error.flatten() });
    return;
  }
  const [existing] = await db.select().from(articles).where(eq(articles.id, id)).limit(1);
  if (!existing) {
    res.status(404).json({ error: 'not found' });
    return;
  }
  const admin = isAdmin(req.user!.role);
  if (!admin && (existing.authorId !== req.user!.id || existing.status === 'published')) {
    res.status(403).json({ error: 'authors can edit only their own unpublished articles' });
    return;
  }
  const { metaDescription, ...updates } = parsed.data;
  if (!admin) delete updates.status; // автор не меняет статус

  const [row] = await db.update(articles).set(updates).where(eq(articles.id, id)).returning();
  if (metaDescription) {
    await saveMetaDescription(id, metaDescription);
  }
  res.json({ article: row });
});

// POST /api/articles/propose — предложить новость/идею (любой залогиненный).
// Читатель (reader) при первом предложении автоматически получает роль author.
articlesRouter.post('/propose', authRequired, async (req, res) => {
  const parsed = z.object({
    type: z.enum(['novost', 'ideya']),
    title: z.string().min(5).max(200),
    text: z.string().min(20),
    sourceUrl: z.string().url().optional(),
  }).safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: 'validation', details: parsed.error.flatten() });
    return;
  }
  const { type, title, text, sourceUrl } = parsed.data;

  if (req.user!.role === 'reader') {
    await db.update(users).set({ role: 'author' }).where(eq(users.id, req.user!.id));
  }
  const slug = await uniqueSlug(type, title);
  const [row] = await db.insert(articles).values({
    type, slug, title,
    contentHtml: plainTextToHtml(text),
    sourceUrl: sourceUrl ?? null,
    authorId: req.user!.id,
    status: 'draft',
  }).returning({ id: articles.id, type: articles.type, slug: articles.slug, title: articles.title, status: articles.status });
  res.status(201).json({ article: row, roleUpgraded: req.user!.role === 'reader' });
});

// POST /api/articles/:id/publish — только admin/super_admin
articlesRouter.post('/:id/publish', authRequired, requireRole(...ADMIN_ROLES), async (req, res) => {
  const id = Number(req.params.id);
  const [row] = await db
    .update(articles)
    .set({ status: 'published', publishedAt: new Date() })
    .where(eq(articles.id, id))
    .returning({ id: articles.id, status: articles.status, publishedAt: articles.publishedAt });
  if (!row) {
    res.status(404).json({ error: 'not found' });
    return;
  }
  res.json({ article: row });
});
