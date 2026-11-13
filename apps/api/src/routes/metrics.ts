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

// ---------- Воронка: регистрация → чтение → избранное → подписка ----------
// ВАЖНО: все шаги вложены в когорту зарегистрированных за период (ТЗ-119 Задача 2 PULSE) —
// иначе % от регистраций бессмыслен и может превышать 100%.
metricsRouter.get('/admin/metrics/funnel', ...adminOnly, async (req, res) => {
  const d = days(req);
  const rows = await db.execute<{ step: string; n: number }>(sql`
    with cohort as (
      select id from users where created_at >= now() - make_interval(days => ${d})
    ),
    registered as (select count(*)::int as n from cohort),
    read as (
      select count(distinct av.user_id)::int as n from article_views av
      join cohort c on c.id = av.user_id
    ),
    favorited as (
      select count(distinct f.user_id)::int as n from favorites f
      join cohort c on c.id = f.user_id
    ),
    subscribed as (
      select count(distinct s.user_id)::int as n from subscriptions s
      join cohort c on c.id = s.user_id
    )
    select 'Регистрация' as step, n from registered
    union all select 'Прочитали статью', n from read
    union all select 'Добавили в избранное', n from favorited
    union all select 'Оформили подписку', n from subscribed
  `);
  const steps = rows.rows.map((r) => Number(r.n));
  const funnel = rows.rows.map((r, i) => ({
    step: r.step,
    count: Number(r.n),
    pct_of_prev: i === 0 ? 100 : (steps[i - 1] > 0 ? Math.round((Number(r.n) / steps[i - 1]) * 100) : 0),
    pct_of_total: steps[0] > 0 ? Math.round((Number(r.n) / steps[0]) * 100) : 0,
  }));
  res.json({ funnel, periodDays: d });
});

// ---------- Retention D1/D7/D30 (дневные когорты, молодые — null) ----------
// «Активен в первые N дней» = count(distinct user_id) из article_views с
// viewed_at <= регистрация + N дней. max(viewed_at) занижал D1/D7 для юзеров,
// вернувшихся позже (баг-аудит 2026-11-08).
metricsRouter.get('/admin/metrics/retention-daily', ...adminOnly, async (_req, res) => {
  const rows = await db.execute<{
    cohort: string; users: number; active_d1: number; active_d7: number; active_d30: number;
  }>(sql`
    with cohort as (
      select id, created_at::date as cohort_date, count(*) over () as users
      from users
      where created_at >= now() - interval '35 days'
    )
    select
      c.cohort_date::text as cohort,
      count(distinct c.id)::int as users,
      count(distinct c.id) filter (where av.viewed_at is not null and av.viewed_at < c.cohort_date + interval '2 days')::int as active_d1,
      count(distinct c.id) filter (where av.viewed_at is not null and av.viewed_at < c.cohort_date + interval '8 days')::int as active_d7,
      count(distinct c.id) filter (where av.viewed_at is not null and av.viewed_at < c.cohort_date + interval '31 days')::int as active_d30
    from cohort c
    left join article_views av on av.user_id = c.id
    group by c.cohort_date
    order by c.cohort_date
  `);
  const DAY = 86400_000;
  const now = Date.now();
  const result = rows.rows.map((r) => {
    const cohortDate = new Date(String(r.cohort)).getTime();
    const ageDays = Math.floor((now - cohortDate) / DAY);
    const usersInCohort = Number(r.users);
    return {
      cohort: String(r.cohort),
      users: usersInCohort,
      // null — когорте ещё не исполнилось N дней (честность, как в PULSE)
      d1: ageDays >= 1 ? Math.round((Number(r.active_d1) / usersInCohort) * 100) : null,
      d7: ageDays >= 7 ? Math.round((Number(r.active_d7) / usersInCohort) * 100) : null,
      d30: ageDays >= 30 ? Math.round((Number(r.active_d30) / usersInCohort) * 100) : null,
    };
  });
  res.json({ cohorts: result });
});

// ---------- Группы риска: счётчики + списки ----------
metricsRouter.get('/admin/metrics/at-risk', ...adminOnly, async (req, res) => {
  const type = String(req.query.type ?? 'dormant_7d');
  const valid = ['dormant_7d', 'dormant_30d', 'read_no_sub'] as const;
  if (!valid.includes(type as typeof valid[number])) {
    res.status(400).json({ error: 'invalid type' });
    return;
  }
  let rows;
  if (type === 'dormant_7d' || type === 'dormant_30d') {
    // два отдельных запроса: interval нельзя параметризовать, значение — из whitelist-константы
    const q7 = sql`
      select u.id, u.email, u.display_name,
        max(av.viewed_at) as last_view,
        count(av.viewed_at)::int as views
      from users u
      left join article_views av on av.user_id = u.id
      where u.created_at < now() - interval '1 day'
      group by u.id, u.email, u.display_name
      having (max(av.viewed_at) is null or max(av.viewed_at) < now() - interval '7 days')
      order by max(av.viewed_at) desc nulls last
      limit 100`;
    const q30 = sql`
      select u.id, u.email, u.display_name,
        max(av.viewed_at) as last_view,
        count(av.viewed_at)::int as views
      from users u
      left join article_views av on av.user_id = u.id
      where u.created_at < now() - interval '1 day'
      group by u.id, u.email, u.display_name
      having (max(av.viewed_at) is null or max(av.viewed_at) < now() - interval '30 days')
      order by max(av.viewed_at) desc nulls last
      limit 100`;
    rows = await db.execute(type === 'dormant_7d' ? q7 : q30);
  } else {
    // read_no_sub: читают, но ни на что не подписаны
    rows = await db.execute<{ id: number; email: string; display_name: string | null; last_view: string | null; views: number }>(sql`
      select u.id, u.email, u.display_name,
        max(av.viewed_at) as last_view,
        count(*)::int as views
      from users u
      join article_views av on av.user_id = u.id
      where not exists (select 1 from subscriptions s where s.user_id = u.id)
      group by u.id, u.email, u.display_name
      order by count(*) desc
      limit 100
    `);
  }
  res.json({
    users: rows.rows.map((r) => ({
      id: Number(r.id),
      email: r.email,
      displayName: r.display_name,
      lastView: r.last_view ? String(r.last_view).slice(0, 10) : 'никогда',
      views: Number(r.views),
    })),
  });
});

// ---------- Счётчики групп риска для KPI-карточек (как в PULSE) ----------
metricsRouter.get('/admin/metrics/at-risk-counts', ...adminOnly, async (_req, res) => {
  const rows = await db.execute<{ k: string; n: number }>(sql`
    select 'dormant_7d' as k, count(*)::int as n from (
      select u.id from users u
      left join article_views av on av.user_id = u.id
      where u.created_at < now() - interval '1 day'
      group by u.id
      having (max(av.viewed_at) is null or max(av.viewed_at) < now() - interval '7 days')
    ) t
    union all
    select 'dormant_30d', count(*)::int from (
      select u.id from users u
      left join article_views av on av.user_id = u.id
      where u.created_at < now() - interval '1 day'
      group by u.id
      having (max(av.viewed_at) is null or max(av.viewed_at) < now() - interval '30 days')
    ) t
    union all
    select 'read_no_sub', count(*)::int from (
      select u.id from users u
      join article_views av on av.user_id = u.id
      where not exists (select 1 from subscriptions s where s.user_id = u.id)
      group by u.id
    ) t
  `);
  const counts: Record<string, number> = {};
  for (const r of rows.rows) counts[r.k] = Number(r.n);
  res.json({ counts });
});

// ---------- Скорость страниц: телеметрия загрузки (page_load_events) ----------
metricsRouter.get('/admin/metrics/page-load', ...adminOnly, async (req, res) => {
  const d = days(req, 7, 90);
  const { rows } = await db.execute<{
    path: string; loads: string; avg_ms: string; max_ms: string; last_at: string | null;
  }>(sql`
    select path,
           count(*)::int as loads,
           round(avg(load_ms))::int as avg_ms,
           max(load_ms)::int as max_ms,
           max(created_at) as last_at
    from page_load_events
    where created_at > now() - ${`${d} days`}::interval
    group by path
    order by avg_ms desc
    limit 50
  `);
  res.json({
    pages: rows.map((r) => ({
      path: r.path,
      loads: Number(r.loads),
      avgMs: Number(r.avg_ms),
      maxMs: Number(r.max_ms),
      lastAt: r.last_at,
    })),
  });
});
