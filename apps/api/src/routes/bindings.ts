/**
 * Привязки статьи к сущностям графа (тикер/компания/индустрия/тренд/сюжет)
 * + автоподстановка цепочки: выбрал тикер → предложились компания и индустрия.
 *
 * Монтируется ПЕРЕД articlesRouter (пути /:id/... конфликтуют с /:type/:slug).
 */
import { Router } from 'express';
import { z } from 'zod';
import { eq, inArray } from 'drizzle-orm';
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
} from '@newinvest/db';
import { authRequired, requireRole } from '../middleware/auth.js';

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
