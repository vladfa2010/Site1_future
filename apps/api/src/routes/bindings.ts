/**
 * Привязки статьи к сущностям графа (тикер/компания/индустрия/тренд/сюжет)
 * + автоподстановка цепочки: выбрал тикер → предложились компания и индустрия.
 *
 * Монтируется ПЕРЕД articlesRouter (пути /:id/... конфликтуют с /:type/:slug).
 */
import { Router } from 'express';
import { z } from 'zod';
import { eq, inArray, and, desc, sql } from 'drizzle-orm';
import {
  db,
  tickers,
  companies,
  industries,
  companyIndustries,
  articleCompanies,
  articleTickers,
  articleIndustries,
  articleTrends,
  articleStories,
  articles,
  media,
  ARTICLE_TYPES,
} from '@newinvest/db';
import { optionalAuth, authRequired, requireRole, ADMIN_ROLES } from '../middleware/auth.js';
import { accessCondition } from './articles.js';
import { virtualViewsSql } from '../services/viewsBump.js';

export const bindingsRouter = Router();

const JUNCTIONS = [
  { table: articleCompanies, articleKey: articleCompanies.articleId, entityJsKey: 'companyId', entityKey: articleCompanies.companyId, name: 'companyIds' },
  { table: articleTickers, articleKey: articleTickers.articleId, entityJsKey: 'tickerId', entityKey: articleTickers.tickerId, name: 'tickerIds' },
  { table: articleIndustries, articleKey: articleIndustries.articleId, entityJsKey: 'industryId', entityKey: articleIndustries.industryId, name: 'industryIds' },
  { table: articleTrends, articleKey: articleTrends.articleId, entityJsKey: 'trendId', entityKey: articleTrends.trendId, name: 'trendIds' },
  { table: articleStories, articleKey: articleStories.articleId, entityJsKey: 'storyId', entityKey: articleStories.storyId, name: 'storyIds' },
] as const;

async function getRelations(articleId: number) {
  const result: Record<string, number[]> = {};
  for (const j of JUNCTIONS) {
    const rows = await db.select({ id: j.entityKey }).from(j.table).where(eq(j.articleKey, articleId));
    result[j.name] = rows.map((r) => r.id);
  }
  return result as { companyIds: number[]; tickerIds: number[]; industryIds: number[]; trendIds: number[]; storyIds: number[] };
}

// GET /api/articles/:id/relations
bindingsRouter.get('/articles/:id/relations', authRequired, requireRole('admin', 'super_admin'), async (req, res) => {
  res.json({ relations: await getRelations(Number(req.params.id)) });
});

// GET /api/articles/:id/bindings-suggest — цепочка из графа
bindingsRouter.get('/articles/:id/bindings-suggest', authRequired, requireRole('admin', 'super_admin'), async (req, res) => {
  const articleId = Number(req.params.id);
  const rels = await getRelations(articleId);

  // тикеры → их компании
  const tickerRows = rels.tickerIds.length
    ? await db.select().from(tickers).where(inArray(tickers.id, rels.tickerIds))
    : [];
  const chainCompanyIds = [...new Set(tickerRows.map((t) => t.companyId).filter((v): v is number => v !== null))];

  const suggestedCompanies = chainCompanyIds
    .filter((id) => !rels.companyIds.includes(id))
    .map((id) => {
      const t = tickerRows.find((tr) => tr.companyId === id);
      return { id, reason: `тикер ${t?.symbol ?? ''}`.trim() };
    });

  // компании (уже привязанные + из цепочки) → их индустрии
  const allCompanyIds = [...new Set([...rels.companyIds, ...chainCompanyIds])];
  const industryRows = allCompanyIds.length
    ? await db
        .select({ industryId: companyIndustries.industryId, companyName: companies.name })
        .from(companyIndustries)
        .innerJoin(companies, eq(companyIndustries.companyId, companies.id))
        .where(inArray(companyIndustries.companyId, allCompanyIds))
    : [];
  const suggestedIndustries = industryRows
    .filter((r) => !rels.industryIds.includes(r.industryId))
    .map((r) => ({ id: r.industryId, reason: `компания ${r.companyName}` }));

  const industryDetails = suggestedIndustries.length
    ? await db.select({ id: industries.id, name: industries.name }).from(industries).where(inArray(industries.id, suggestedIndustries.map((s) => s.id)))
    : [];
  const industryNames = new Map(industryDetails.map((d) => [d.id, d.name]));

  res.json({
    suggestions: {
      companies: suggestedCompanies,
      industries: suggestedIndustries.map((s) => ({ ...s, name: industryNames.get(s.id) ?? String(s.id) })),
    },
  });
});

// GET /api/articles/:id/events — материалы по этой идее (публично).
// ?type=sobytie|novost|analitika|interesnoe|ideya (по умолчанию sobytie).
// Фильтр: тот же тип + опубликованные + общие привязки (компании/тикеры/индустрии/тренды),
// пейволл-соблюдение, свежие первыми.
bindingsRouter.get('/articles/:id/events', optionalAuth, async (req, res) => {
  const articleId = Number(req.params.id);
  const type = String(req.query.type ?? 'sobytie');
  if (!ARTICLE_TYPES.includes(type as (typeof ARTICLE_TYPES)[number])) {
    res.status(400).json({ error: 'invalid type' });
    return;
  }
  const [idea] = await db.select({ id: articles.id }).from(articles)
    .where(and(eq(articles.id, articleId), eq(articles.type, 'ideya'))).limit(1);
  if (!idea) {
    res.status(404).json({ error: 'not found' });
    return;
  }
  const rels = await getRelations(articleId);

  // собираем id материалов с пересечением по любой связке — один UNION-запрос
  // (ids — из своей БД, числа, sql.raw безопасен)
  const parts = [
    rels.companyIds.length ? sql`select article_id from article_companies where company_id in (${sql.raw(rels.companyIds.join(','))})` : null,
    rels.tickerIds.length ? sql`select article_id from article_tickers where ticker_id in (${sql.raw(rels.tickerIds.join(','))})` : null,
    rels.industryIds.length ? sql`select article_id from article_industries where industry_id in (${sql.raw(rels.industryIds.join(','))})` : null,
    rels.trendIds.length ? sql`select article_id from article_trends where trend_id in (${sql.raw(rels.trendIds.join(','))})` : null,
  ].filter((p): p is NonNullable<typeof p> => p !== null);

  let candidateIds: number[] = [];
  if (parts.length > 0) {
    const union = parts.reduce((acc, p, i) => (i === 0 ? p : sql`${acc} union ${p}`));
    const rows = await db.execute<{ article_id: number }>(sql`select distinct article_id from (${union}) t where article_id <> ${articleId}`);
    candidateIds = rows.rows.map((r) => r.article_id);
  }

  if (candidateIds.length === 0) {
    res.json({ events: [] });
    return;
  }

  const admin = req.user?.role !== undefined && ADMIN_ROLES.includes(req.user.role);
  const acc = accessCondition(req.user, admin);
  const events = await db
    .select({
      id: articles.id,
      type: articles.type,
      slug: articles.slug,
      title: articles.title,
      excerpt: articles.excerpt,
      publishedAt: articles.publishedAt,
      coverUrl: media.filePath,
      viewsCount: virtualViewsSql, // ТЗ-03
    })
    .from(articles)
    .leftJoin(media, eq(articles.coverMediaId, media.id))
    .where(and(
      inArray(articles.id, [...candidateIds]),
      eq(articles.type, type),
      eq(articles.status, 'published'),
      acc ?? sql`true`,
    ))
    .orderBy(desc(sql`coalesce(${articles.publishedAt}, ${articles.createdAt})`))
    .limit(10);
  res.json({ events });
});

const putSchema = z.object({
  companyIds: z.array(z.number().int()).optional(),
  tickerIds: z.array(z.number().int()).optional(),
  industryIds: z.array(z.number().int()).optional(),
  trendIds: z.array(z.number().int()).optional(),
  storyIds: z.array(z.number().int()).optional(),
});

// PUT /api/articles/:id/relations — заменить привязки (транзакционно)
bindingsRouter.put('/articles/:id/relations', authRequired, requireRole('admin', 'super_admin'), async (req, res) => {
  const articleId = Number(req.params.id);
  const parsed = putSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: 'validation', details: parsed.error.flatten() });
    return;
  }

  await db.transaction(async (tx) => {
    for (const j of JUNCTIONS) {
      await tx.delete(j.table).where(eq(j.articleKey, articleId));
      const ids = parsed.data[j.name as keyof typeof parsed.data];
      if (ids?.length) {
        await tx.insert(j.table).values(ids.map((id) => ({ articleId, [j.entityJsKey]: id }) as never));
      }
    }
  });

  res.json({ relations: await getRelations(articleId) });
});
