/**
 * Скринер проектов: идеи с фильтрами по параметрам сделки.
 * GET /api/screener?phase=portfel&stage=pre-ipo&industry=ai
 * Возвращает идеи с бейджами стадий/фаз/индустрий.
 */
import { Router } from 'express';
import { and, eq, sql, type SQL } from 'drizzle-orm';
import { db, articles, dealPhases, dealStages, media } from '@newinvest/db';
import { optionalAuth, ADMIN_ROLES } from '../middleware/auth.js';
import { accessCondition } from './articles.js';
import { virtualViewsSql } from '../services/viewsBump.js';

export const screenerRouter = Router();

screenerRouter.get('/deal-phases', async (_req, res) => {
  res.json({ phases: await db.select().from(dealPhases).orderBy(dealPhases.id) });
});

screenerRouter.get('/deal-stages', async (_req, res) => {
  res.json({ stages: await db.select().from(dealStages).orderBy(dealStages.sortOrder) });
});

screenerRouter.get('/screener', optionalAuth, async (req, res) => {
  const { phase, stage, industry, trend } = req.query as Record<string, string | undefined>;

  // квалифицированная ссылка на articles.id (иначе в подзапросе "id" биндится к внутренней таблице)
  const aid = sql`${sql.identifier('articles')}.${sql.identifier('id')}`;

  const admin = req.user?.role !== undefined && ADMIN_ROLES.includes(req.user.role);
  const conditions: SQL[] = [
    eq(articles.type, 'ideya'),
    eq(articles.status, 'published'),
    accessCondition(req.user, admin) ?? sql`true`, // пейволл: аноним видит только public (аудит 2026-11-08)
  ];
  const existsFilter = (junction: string, dict: string, fk: string, slug?: string) => sql`exists(
    select 1 from ${sql.identifier(junction)} j
    join ${sql.identifier(dict)} d on d.id = j.${sql.identifier(fk)}
    where j.article_id = ${aid} and d.slug = ${slug ?? ''}
  )`;
  if (phase) conditions.push(existsFilter('article_deal_phases', 'deal_phases', 'phase_id', phase));
  if (stage) conditions.push(existsFilter('article_deal_stages', 'deal_stages', 'stage_id', stage));
  if (industry) conditions.push(existsFilter('article_industries', 'industries', 'industry_id', industry));
  if (trend) conditions.push(existsFilter('article_trends', 'trends', 'trend_id', trend));

  const badges = (junction: string, dict: string, fk: string) => sql<string[]>`
    coalesce((
      select array_agg(d.name order by d.name)
      from ${sql.identifier(junction)} j
      join ${sql.identifier(dict)} d on d.id = j.${sql.identifier(fk)}
      where j.article_id = ${aid}
    ), '{}')`;

  const rows = await db
    .select({
      id: articles.id,
      type: articles.type,
      slug: articles.slug,
      title: articles.title,
      excerpt: articles.excerpt,
      thesis: articles.thesis,
      publishedAt: articles.publishedAt,
      coverUrl: media.filePath,
      readingTime: articles.readingTime,
      viewsCount: virtualViewsSql, // ТЗ-03: счётчик на карточках идей
      likesCount: articles.likesCount, // ТЗ-04: счётчики вовлечения в скринере (liked нет — публичный список)
      sharesCount: articles.sharesCount,
      phases: badges('article_deal_phases', 'deal_phases', 'phase_id'),
      stages: badges('article_deal_stages', 'deal_stages', 'stage_id'),
      industries: badges('article_industries', 'industries', 'industry_id'),
      companies: badges('article_companies', 'companies', 'company_id'),
      trends: badges('article_trends', 'trends', 'trend_id'),
      // стадия финансирования — последний раунд компаний идеи (по дате)
      fundingStage: sql<string | null>`
        (select r.stage from funding_rounds r
         where r.company_id in (select company_id from article_companies where article_id = ${aid})
         order by r.date desc nulls last, r.id desc limit 1)`,
    })
    .from(articles)
    .leftJoin(media, eq(articles.coverMediaId, media.id))
    .where(and(...conditions))
    .orderBy(sql`${articles.publishedAt} desc nulls last`)
    .limit(100);

  res.json({ ideas: rows, total: rows.length });
});
