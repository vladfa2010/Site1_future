/**
 * Граф знаний: компании, тикеры, индустрии, тренды.
 * Чтение — публичное, создание — admin/super_admin.
 */
import { Router } from 'express';
import { z } from 'zod';
import { and, desc, eq, ilike, or, sql, type SQL } from 'drizzle-orm';
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
  fundingRounds,
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
    .orderBy(sql`${articles.publishedAt} desc nulls last`)
    .limit(50);

  // Раунды финансирования — только если внесены (раздел 4.3)
  const rounds = await db
    .select()
    .from(fundingRounds)
    .where(eq(fundingRounds.companyId, company.id))
    .orderBy(desc(fundingRounds.date))
    .limit(50);

  res.json({ company, tickers: companyTickers, industries: companyIndustriesList, articles: companyArticles, fundingRounds: rounds });
});

const companySchema = z.object({
  slug: slugSchema,
  name: z.string().min(1),
  oneLiner: z.string().optional(),
  description: z.string().optional(),
  logoMediaId: z.number().int().optional(),
  website: z.string().url().optional(),
  country: z.string().optional(),
  foundedYear: z.number().int().optional(),
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

// PATCH /api/companies/:id — редактирование карточки (admin)
entitiesRouter.patch('/companies/:id', authRequired, requireRole('admin', 'super_admin'), async (req, res) => {
  const id = Number(req.params.id);
  const parsed = companySchema.partial().safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: 'validation', details: parsed.error.flatten() });
    return;
  }
  const { industryIds, ...data } = parsed.data;
  const [company] = await db.update(companies).set(data).where(eq(companies.id, id)).returning();
  if (!company) {
    res.status(404).json({ error: 'not found' });
    return;
  }
  if (industryIds) {
    await db.delete(companyIndustries).where(eq(companyIndustries.companyId, id));
    if (industryIds.length) {
      await db.insert(companyIndustries).values(industryIds.map((industryId) => ({ companyId: id, industryId })));
    }
  }
  res.json({ company });
});

// POST /api/companies/:id/rounds — раунд финансирования (admin).
// sourceUrl обязателен: каждая цифра — со ссылкой на новость/раскрытие.
const roundSchema = z.object({
  stage: z.string().optional(), // seed | series-a..e | ipo | grant | mna
  date: z.coerce.date().optional(),
  amount: z.string().optional(), // NUMERIC приходит строкой, чтобы не терять точность
  currency: z.string().optional(),
  postMoneyValuation: z.string().optional(),
  investors: z.array(z.string()).optional(),
  sourceUrl: z.string().url(),
  status: z.string().optional(),
});

entitiesRouter.post('/companies/:id/rounds', authRequired, requireRole('admin', 'super_admin'), async (req, res) => {
  const companyId = Number(req.params.id);
  const parsed = roundSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: 'validation', details: parsed.error.flatten() });
    return;
  }
  const [company] = await db.select({ id: companies.id }).from(companies).where(eq(companies.id, companyId)).limit(1);
  if (!company) {
    res.status(404).json({ error: 'company not found' });
    return;
  }
  const { date, ...rest } = parsed.data;
  const [round] = await db
    .insert(fundingRounds)
    .values({ ...rest, date: date ? date.toISOString().slice(0, 10) : undefined, companyId })
    .returning();
  res.status(201).json({ round });
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
    .orderBy(sql`${articles.publishedAt} desc nulls last`)
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

// PATCH /api/trends/:id — редактирование тренда (admin)
entitiesRouter.patch('/trends/:id', authRequired, requireRole('admin', 'super_admin'), async (req, res) => {
  const parsed = trendSchema.partial().safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: 'validation', details: parsed.error.flatten() });
    return;
  }
  const [row] = await db.update(trends).set(parsed.data).where(eq(trends.id, Number(req.params.id))).returning();
  if (!row) {
    res.status(404).json({ error: 'not found' });
    return;
  }
  res.json({ trend: row });
});
