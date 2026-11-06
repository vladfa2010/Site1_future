/**
 * Личный кабинет — фаза 1: избранное, подписки на сущности, «Моя лента».
 * Всё требует авторизации.
 */
import { Router } from 'express';
import { z } from 'zod';
import { and, desc, eq, inArray, sql, type SQL } from 'drizzle-orm';
import {
  db, favorites, subscriptions, articles, companies, trends, stories,
  articleCompanies, articleTrends, articleIndustries, articleTickers, media,
  notificationSettings,
} from '@newinvest/db';
import { authRequired } from '../middleware/auth.js';

export const cabinetRouter = Router();
cabinetRouter.use(authRequired); // весь роутер — только для залогиненных

const FAV_TYPES = ['article', 'company', 'trend', 'story'] as const;
const entitySchema = z.object({
  entityType: z.enum(FAV_TYPES),
  entityId: z.number().int(),
});

// ---------- Избранное ----------

// PUT /api/favorites — добавить в избранное (idempotent)
cabinetRouter.put('/favorites', async (req, res) => {
  const parsed = entitySchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: 'validation' });
    return;
  }
  await db.insert(favorites).values({ userId: req.user!.id, ...parsed.data }).onConflictDoNothing();
  res.status(201).json({ ok: true });
});

// DELETE /api/favorites/:type/:id
cabinetRouter.delete('/favorites/:type/:id', async (req, res) => {
  const entityType = String(req.params.type);
  if (!(FAV_TYPES as readonly string[]).includes(entityType)) {
    res.status(400).json({ error: 'bad type' });
    return;
  }
  await db.delete(favorites).where(
    and(eq(favorites.userId, req.user!.id), eq(favorites.entityType, entityType), eq(favorites.entityId, Number(req.params.id))),
  );
  res.json({ ok: true });
});

// GET /api/favorites/keys — ключи избранного для иконок: ["article:5","trend:2"]
cabinetRouter.get('/favorites/keys', async (req, res) => {
  const rows = await db.select().from(favorites).where(eq(favorites.userId, req.user!.id));
  res.json({ keys: rows.map((r) => `${r.entityType}:${r.entityId}`) });
});

// GET /api/favorites — моё избранное, с данными сущностей
cabinetRouter.get('/favorites', async (req, res) => {
  const rows = await db.select().from(favorites)
    .where(eq(favorites.userId, req.user!.id))
    .orderBy(desc(favorites.createdAt))
    .limit(200);

  const articleIds = rows.filter((r) => r.entityType === 'article').map((r) => r.entityId);
  const companyIds = rows.filter((r) => r.entityType === 'company').map((r) => r.entityId);
  const trendIds = rows.filter((r) => r.entityType === 'trend').map((r) => r.entityId);
  const storyIds = rows.filter((r) => r.entityType === 'story').map((r) => r.entityId);

  const [articleRows, companyRows, trendRows, storyRows] = await Promise.all([
    articleIds.length
      ? db.select({ id: articles.id, type: articles.type, slug: articles.slug, title: articles.title, excerpt: articles.excerpt, publishedAt: articles.publishedAt, coverUrl: media.filePath })
          .from(articles).leftJoin(media, eq(articles.coverMediaId, media.id))
          .where(inArray(articles.id, articleIds))
      : Promise.resolve([]),
    companyIds.length ? db.select({ id: companies.id, slug: companies.slug, name: companies.name, oneLiner: companies.oneLiner }).from(companies).where(inArray(companies.id, companyIds)) : Promise.resolve([]),
    trendIds.length ? db.select({ id: trends.id, slug: trends.slug, name: trends.name }).from(trends).where(inArray(trends.id, trendIds)) : Promise.resolve([]),
    storyIds.length ? db.select({ id: stories.id, slug: stories.slug, name: stories.name }).from(stories).where(inArray(stories.id, storyIds)) : Promise.resolve([]),
  ]);

  const mapOf = <T extends { id: number }>(arr: T[]) => new Map(arr.map((x) => [x.id, x]));
  const aMap = mapOf(articleRows as { id: number }[]);
  const cMap = mapOf(companyRows as { id: number }[]);
  const tMap = mapOf(trendRows as { id: number }[]);
  const sMap = mapOf(storyRows as { id: number }[]);

  res.json({
    favorites: rows
      .map((r) => {
        const data =
          r.entityType === 'article' ? aMap.get(r.entityId)
          : r.entityType === 'company' ? cMap.get(r.entityId)
          : r.entityType === 'trend' ? tMap.get(r.entityId)
          : sMap.get(r.entityId);
        return data ? { entityType: r.entityType, entityId: r.entityId, createdAt: r.createdAt, data } : null;
      })
      .filter(Boolean),
  });
});

// ---------- Подписки на сущности ----------

const SUB_TYPES = ['ticker', 'company', 'trend', 'industry'] as const;

cabinetRouter.put('/subscriptions', async (req, res) => {
  const parsed = z.object({ entityType: z.enum(SUB_TYPES), entityId: z.number().int() }).safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: 'validation' });
    return;
  }
  await db.insert(subscriptions).values({ userId: req.user!.id, ...parsed.data }).onConflictDoNothing();
  res.status(201).json({ ok: true });
});

cabinetRouter.delete('/subscriptions/:type/:id', async (req, res) => {
  const entityType = String(req.params.type);
  if (!(SUB_TYPES as readonly string[]).includes(entityType)) {
    res.status(400).json({ error: 'bad type' });
    return;
  }
  await db.delete(subscriptions).where(
    and(eq(subscriptions.userId, req.user!.id), eq(subscriptions.entityType, entityType), eq(subscriptions.entityId, Number(req.params.id))),
  );
  res.json({ ok: true });
});

cabinetRouter.get('/subscriptions', async (req, res) => {
  const rows = await db.select().from(subscriptions).where(eq(subscriptions.userId, req.user!.id));
  res.json({ subscriptions: rows });
});

// ---------- Настройки уведомлений ----------

cabinetRouter.get('/notification-settings', async (req, res) => {
  const [row] = await db.select().from(notificationSettings).where(eq(notificationSettings.userId, req.user!.id)).limit(1);
  res.json({ settings: row ?? { emailDaily: true, emailWeekly: true } });
});

cabinetRouter.put('/notification-settings', async (req, res) => {
  const parsed = z.object({
    emailDaily: z.boolean(),
    emailWeekly: z.boolean(),
  }).safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: 'validation' });
    return;
  }
  const [row] = await db.insert(notificationSettings)
    .values({ userId: req.user!.id, ...parsed.data })
    .onConflictDoUpdate({ target: notificationSettings.userId, set: parsed.data })
    .returning();
  res.json({ settings: row });
});

// ---------- «Моя лента»: свежие материалы по моим подпискам ----------

cabinetRouter.get('/feed', async (req, res) => {
  const subs = await db.select().from(subscriptions).where(eq(subscriptions.userId, req.user!.id));
  const byType = (t: string) => subs.filter((s) => s.entityType === t).map((s) => s.entityId);
  const companyIds = byType('company');
  const trendIds = byType('trend');
  const industryIds = byType('industry');
  const tickerIds = byType('ticker');

  const existsIn = (junction: string, fk: string, ids: number[]) =>
    ids.length
      ? sql`exists(select 1 from ${sql.identifier(junction)} j where j.${sql.identifier('article_id')} = ${sql.identifier('articles')}.${sql.identifier('id')} and j.${sql.identifier(fk)} in (${sql.join(ids.map((id) => sql`${id}`), sql`, `)}))`
      : null;

  const conditions: SQL[] = [eq(articles.status, 'published')];
  const ors = [
    existsIn('article_companies', 'company_id', companyIds),
    existsIn('article_trends', 'trend_id', trendIds),
    existsIn('article_industries', 'industry_id', industryIds),
    existsIn('article_tickers', 'ticker_id', tickerIds),
  ].filter((x): x is SQL => x !== null);

  if (ors.length === 0) {
    res.json({ articles: [], hint: 'empty_subscriptions' });
    return;
  }
  conditions.push(sql`(${sql.join(ors, sql` or `)})`);

  const rows = await db
    .select({
      id: articles.id, type: articles.type, slug: articles.slug, title: articles.title,
      excerpt: articles.excerpt, publishedAt: articles.publishedAt, coverUrl: media.filePath,
    })
    .from(articles)
    .leftJoin(media, eq(articles.coverMediaId, media.id))
    .where(and(...conditions))
    .orderBy(sql`${articles.publishedAt} desc nulls last`)
    .limit(50);

  res.json({ articles: rows });
});
