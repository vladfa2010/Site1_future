/**
 * Граф знаний: компании, тикеры, индустрии, тренды.
 * Чтение — публичное, создание — admin/super_admin.
 */
import { Router } from 'express';
import { z } from 'zod';
import { and, desc, eq, ilike, or, type SQL } from 'drizzle-orm';
import {
  db,
  companies,
  tickers,
  industries,
  trends,
  articles,
  companyIndustries,
  articleCompanies,
  articleTrends,
} from '@newinvest/db';
import { authRequired, requireRole } from '../middleware/auth.js';

export const entitiesRouter = Router();

const slugSchema = z.string().regex(/^[a-z0-9-]+$/, 'slug: латиница, цифры, дефис');

// ---------- Компании ----------

entitiesRouter.get('/companies', async (req, res) => {
  const q = req.query.q as string | undefined;
  const conditions: SQL[] = q ? [ilike(companies.name, `%${q}%`)] : [];
  const rows = await db
    .select()
    .from(companies)
    .where(conditions.length > 0 ? and(...conditions) : undefined)
    .orderBy(companies.name)
    .limit(100);
  res.json({ companies: rows });
});

// GET /api/companies/spacex — карточка: тикеры, индустрии, статьи (главный SEO-шаблон)
entitiesRouter.get('/companies/:slug', async (req, res) => {
  const [company] = await db.select().from(companies).where(eq(companies.slug, req.params.slug)).limit(1);
  if (!company) {
    res.status(404).json({ error: 'not found' });
    return;
  }
  const companyTickers = await db.select().from(tickers).where(eq(tickers.companyId, company.id));
  const companyIndustriesList = await db
    .select({ id: industries.id, name: industries.name, slug: industries.slug })
    .from(companyIndustries)
    .innerJoin(industries, eq(companyIndustries.industryId, industries.id))
    .where(eq(companyIndustries.companyId, company.id));
  const companyArticles = await db
    .select({
      id: articles.id,
      type: articles.type,
      slug: articles.slug,
      title: articles.title,
      excerpt: articles.excerpt,
      publishedAt: articles.publishedAt,
    })
    .from(articleCompanies)
    .innerJoin(articles, eq(articleCompanies.articleId, articles.id))
    .where(and(eq(articleCompanies.companyId, company.id), eq(articles.status, 'published')))
    .orderBy(desc(articles.publishedAt))
    .limit(50);

  res.json({ company, tickers: companyTickers, industries: companyIndustriesList, articles: companyArticles });
});

const companySchema = z.object({
  slug: slugSchema,
  name: z.string().min(1),
  description: z.string().optional(),
  website: z.string().url().optional(),
  country: z.string().optional(),
  isPublic: z.boolean().optional(),
  industryIds: z.array(z.number().int()).optional(),
});

entitiesRouter.post('/companies', authRequired, requireRole('admin', 'super_admin'), async (req, res) => {
  const parsed = companySchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: 'validation', details: parsed.error.flatten() });
    return;
  }
  const { industryIds, ...data } = parsed.data;
  const [company] = await db.insert(companies).values(data).returning();
  if (industryIds?.length) {
    await db.insert(companyIndustries).values(industryIds.map((industryId) => ({ companyId: company.id, industryId })));
  }
  res.status(201).json({ company });
});

// ---------- Тикеры ----------

// GET /api/tickers?q=spc — автодополнение для привязок в админке
entitiesRouter.get('/tickers', async (req, res) => {
  const q = req.query.q as string | undefined;
  const rows = await db
    .select({
      id: tickers.id,
      symbol: tickers.symbol,
      slug: tickers.slug,
      exchange: tickers.exchange,
      companyId: tickers.companyId,
      companyName: companies.name,
    })
    .from(tickers)
    .leftJoin(companies, eq(tickers.companyId, companies.id))
    .where(
      q
        ? or(ilike(tickers.symbol, `%${q.toUpperCase()}%`), ilike(tickers.slug, `%${q.toLowerCase()}%`))
        : undefined,
    )
    .orderBy(tickers.symbol)
    .limit(50);
  res.json({ tickers: rows });
});

const tickerSchema = z.object({
  slug: slugSchema,
  symbol: z.string().min(1),
  companyId: z.number().int().optional(),
  exchange: z.string().optional(),
  currency: z.string().optional(),
  instrument: z.string().optional(),
});

entitiesRouter.post('/tickers', authRequired, requireRole('admin', 'super_admin'), async (req, res) => {
  const parsed = tickerSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: 'validation', details: parsed.error.flatten() });
    return;
  }
  const [ticker] = await db.insert(tickers).values(parsed.data).returning();
  res.status(201).json({ ticker });
});

// ---------- Индустрии ----------

entitiesRouter.get('/industries', async (_req, res) => {
  const rows = await db.select().from(industries).orderBy(industries.name).limit(100);
  res.json({ industries: rows });
});

entitiesRouter.post('/industries', authRequired, requireRole('admin', 'super_admin'), async (req, res) => {
  const parsed = z.object({ slug: slugSchema, name: z.string().min(1), description: z.string().optional() }).safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: 'validation', details: parsed.error.flatten() });
    return;
  }
  const [row] = await db.insert(industries).values(parsed.data).returning();
  res.status(201).json({ industry: row });
});

// ---------- Тренды ----------

entitiesRouter.get('/trends', async (_req, res) => {
  const rows = await db.select().from(trends).orderBy(trends.name).limit(100);
  res.json({ trends: rows });
});

// GET /api/trends/kosmos — лендинг-тренд: лонгрид + статьи
entitiesRouter.get('/trends/:slug', async (req, res) => {
  const [trend] = await db.select().from(trends).where(eq(trends.slug, req.params.slug)).limit(1);
  if (!trend) {
    res.status(404).json({ error: 'not found' });
    return;
  }
  const trendArticles = await db
    .select({
      id: articles.id,
      type: articles.type,
      slug: articles.slug,
      title: articles.title,
      excerpt: articles.excerpt,
      publishedAt: articles.publishedAt,
    })
    .from(articleTrends)
    .innerJoin(articles, eq(articleTrends.articleId, articles.id))
    .where(and(eq(articleTrends.trendId, trend.id), eq(articles.status, 'published')))
    .orderBy(desc(articles.publishedAt))
    .limit(50);
  res.json({ trend, articles: trendArticles });
});

const trendSchema = z.object({
  slug: slugSchema,
  name: z.string().min(1),
  description: z.string().optional(), // лонгрид лендинга
  status: z.enum(['active', 'closed']).optional(),
});

entitiesRouter.post('/trends', authRequired, requireRole('admin', 'super_admin'), async (req, res) => {
  const parsed = trendSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: 'validation', details: parsed.error.flatten() });
    return;
  }
  const [row] = await db.insert(trends).values(parsed.data).returning();
  res.status(201).json({ trend: row });
});
