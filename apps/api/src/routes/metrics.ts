/**
 * Продуктовые метрики (admin/super_admin).
 * Основаны на стандартах для контент-платформ (Mixpanel/Product School/Andrew Chen):
 * рост (регистрации), активность (DAU/WAU/MAU по просмотрам), когортный retention,
 * вовлечение (избранное/подписки), рейтинги контента (темы по просмотрам).
 * Источник активности — article_views (просмотр статьи = значимое действие).
 */
import { Router } from 'express';
import { sql } from 'drizzle-orm';
import { db } from '@newinvest/db';
import { authRequired, requireRole } from '../middleware/auth.js';

export const metricsRouter = Router();
// ВАЖНО: guard на уровне роутов, НЕ router.use — router-level middleware применялся бы
// ко всем /api-запросам, проходящим через роутер, и ломал публичные эндпоинты (баг 2026-11-08).
const adminOnly = [authRequired, requireRole('admin', 'super_admin')];

const days = (req: { query: unknown }, def = 30, max = 90) => {
  const d = Number((req.query as Record<string, string>).days ?? def);
  return Math.min(max, Math.max(7, d));
};

// ---------- Обзор: KPI-карточки ----------
metricsRouter.get('/admin/metrics/overview', ...adminOnly, async (_req, res) => {
  const totals = await db.execute<{
    users: number; reads: number; favorites: number; subscriptions: number;
    dau: number; wau: number; mau: number;
    reads_30d: number; users_30d: number;
  }>(sql`
    select
      (select count(*) from users) as users,
      (select count(*) from article_views) as reads,
      (select count(*) from favorites) as favorites,
      (select count(*) from subscriptions) as subscriptions,
      (select count(distinct user_id) from article_views where user_id is not null and viewed_at >= now() - interval '1 day') as dau,
      (select count(distinct user_id) from article_views where user_id is not null and viewed_at >= now() - interval '7 days') as wau,
      (select count(distinct user_id) from article_views where user_id is not null and viewed_at >= now() - interval '30 days') as mau,
      (select count(*) from article_views where viewed_at >= now() - interval '30 days') as reads_30d,
      (select count(*) from users where created_at >= now() - interval '30 days') as users_30d
  `);
  res.json({ overview: totals.rows[0] });
});

// ---------- Регистрации: по дням + кумулятивно ----------
metricsRouter.get('/admin/metrics/registrations', ...adminOnly, async (req, res) => {
  const d = days(req);
  const rows = await db.execute<{ day: string; n: number }>(sql`
    select date_trunc('day', created_at)::date as day, count(*)::int as n
    from users
    where created_at >= now() - make_interval(days => ${d})
    group by 1 order by 1
  `);
  let cum = 0;
  const totalBefore = await db.execute<{ n: number }>(sql`
    select count(*)::int as n from users where created_at < now() - make_interval(days => ${d})
  `);
  cum = Number(totalBefore.rows[0]?.n ?? 0);
  const series = rows.rows.map((r) => {
    cum += Number(r.n);
    return { day: r.day, n: Number(r.n), cumulative: cum };
  });
  res.json({ series, periodDays: d });
});

// ---------- Когортный retention (недельные когорты регистрации × возвраты по неделям) ----------
metricsRouter.get('/admin/metrics/retention', ...adminOnly, async (_req, res) => {
  const cohorts = await db.execute<{ cohort: string; users: number }>(sql`
    select date_trunc('week', created_at) as cohort, count(*)::int as users
    from users
    where created_at >= now() - interval '8 weeks'
    group by 1 order by 1
  `);
  const activity = await db.execute<{ cohort: string; activity_week: string; users: number }>(sql`
    select c.cohort, date_trunc('week', av.viewed_at) as activity_week, count(distinct av.user_id)::int as users
    from article_views av
    join (
      select id, date_trunc('week', created_at) as cohort from users
      where created_at >= now() - interval '8 weeks'
    ) c on c.id = av.user_id
    where av.viewed_at >= now() - interval '12 weeks'
    group by 1, 2
  `);
  const actMap = new Map<string, Map<string, number>>();
  for (const a of activity.rows) {
    const key = String(a.cohort);
    if (!actMap.has(key)) actMap.set(key, new Map());
    actMap.get(key)!.set(String(a.activity_week), Number(a.users));
  }
  const WEEK = 7 * 86400_000;
  const result = cohorts.rows.map((c) => {
    const cohortDate = new Date(String(c.cohort));
    const cells: number[] = [];
    for (let w = 0; w < 5; w++) {
      const weekStart = new Date(cohortDate.getTime() + w * WEEK);
      const key = weekStart.toISOString().slice(0, 10); // date part для сравнения
      const actKey = [...(actMap.get(String(c.cohort))?.keys() ?? [])]
        .find((k) => k.slice(0, 10) === key);
      cells.push(actKey ? actMap.get(String(c.cohort))!.get(actKey)! : 0);
    }
    return {
      cohort: String(c.cohort).slice(0, 10),
      users: Number(c.users),
      // retention: доля когорты, вернувшаяся на неделе w (W0 = активность в неделю регистрации)
      retention: cells.map((n) => (Number(c.users) > 0 ? Math.round((n / Number(c.users)) * 100) : 0)),
    };
  });
  res.json({ cohorts: result, weeks: ['W0', 'W1', 'W2', 'W3', 'W4'] });
});

// ---------- Вовлечение: избранное/подписки/прочтения по дням ----------
metricsRouter.get('/admin/metrics/engagement', ...adminOnly, async (req, res) => {
  const d = days(req);
  const [fav, subs, reads] = await Promise.all([
    db.execute<{ day: string; n: number }>(sql`
      select date_trunc('day', created_at)::date as day, count(*)::int as n from favorites
      where created_at >= now() - make_interval(days => ${d}) group by 1 order by 1`),
    db.execute<{ day: string; n: number }>(sql`
      select date_trunc('day', created_at)::date as day, count(*)::int as n from subscriptions
      where created_at >= now() - make_interval(days => ${d}) group by 1 order by 1`),
    db.execute<{ day: string; n: number }>(sql`
      select date_trunc('day', viewed_at)::date as day, count(*)::int as n from article_views
      where viewed_at >= now() - make_interval(days => ${d}) group by 1 order by 1`),
  ]);
  res.json({
    favorites: fav.rows.map((r) => ({ day: r.day, n: Number(r.n) })),
    subscriptions: subs.rows.map((r) => ({ day: r.day, n: Number(r.n) })),
    reads: reads.rows.map((r) => ({ day: r.day, n: Number(r.n) })),
  });
});

// ---------- Рейтинг тем: тренды по просмотрам (что читают) ----------
metricsRouter.get('/admin/metrics/top-trends', ...adminOnly, async (req, res) => {
  const d = days(req, 30);
  const rows = await db.execute<{ id: number; name: string; articles: number; views: number }>(sql`
    select t.id, t.name,
      count(distinct a.id)::int as articles,
      count(*) filter (where av.viewed_at is not null)::int as views
    from trends t
    join article_trends at2 on at2.trend_id = t.id
    join articles a on a.id = at2.article_id and a.status = 'published'
    left join article_views av on av.article_id = a.id and av.viewed_at >= now() - make_interval(days => ${d})
    group by t.id, t.name
    order by views desc, articles desc
    limit 12
  `);
  res.json({ trends: rows.rows.map((r) => ({ ...r, articles: Number(r.articles), views: Number(r.views) })) });
});
