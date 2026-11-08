/**
 * ТЗ-07: Trending Now — публичный топ материалов по реальным просмотрам.
 * Окно 6 ч, только status='published' AND access_level='public' (пейволл: тизерить
 * закрытый контент в «сейчас читают» нельзя). Просмотр пишется в article_views
 * только после пейволл-проверки (routes/articles.ts) — счётчики = реальные читатели.
 *
 * Кэш (аддендум ревью v2.1 №3): ЧИСТЫЙ TTL 5 минут, in-memory Map, БЕЗ инвалидации
 * по max(viewed_at) — иначе любой просмотр любой статьи отключает кэш (self-DDoS).
 * Guard'ы не вешаем: эндпоинт публичный; общий apiLimiter уже на /api (index.ts).
 */
import { Router } from 'express';
import { sql } from 'drizzle-orm';
import { db } from '@newinvest/db';

export const trendingRouter = Router();

const TRENDING_TTL_MIN = 5;
const DEFAULT_HOURS = 6;
const DEFAULT_LIMIT = 10;

const clamp = (req: { query: unknown }, key: 'hours' | 'limit', def: number, min: number, max: number) => {
  const v = Number((req.query as Record<string, string>)[key] ?? def);
  if (!Number.isFinite(v)) return def;
  return Math.min(max, Math.max(min, Math.round(v)));
};

interface TrendingItem {
  id: number;
  type: string;
  slug: string;
  title: string;
  views: number;
}

interface CacheEntry {
  data: { items: TrendingItem[]; windowHours: number; computedAt: string };
  computedAtMs: number;
}

const cache = new Map<string, CacheEntry>();

trendingRouter.get('/', async (req, res) => {
  const hours = clamp(req, 'hours', DEFAULT_HOURS, 1, 24);
  const limit = clamp(req, 'limit', DEFAULT_LIMIT, 1, 20);
  const key = `${hours}:${limit}`;

  const hit = cache.get(key);
  if (hit && Date.now() - hit.computedAtMs < TRENDING_TTL_MIN * 60_000) {
    res.json(hit.data);
    return;
  }

  const rows = await db.execute<{ id: number; type: string; slug: string; title: string; views: number }>(sql`
    select a.id, a.type, a.slug, a.title,
           count(*)::int as views
    from article_views av
    join articles a on a.id = av.article_id
    where av.viewed_at >= now() - make_interval(hours => ${hours})
      and a.status = 'published'
      and a.access_level = 'public'
    group by a.id, a.type, a.slug, a.title
    order by views desc, a.published_at desc
    limit ${limit}
  `);

  const data = {
    items: rows.rows.map((r) => ({
      id: Number(r.id),
      type: r.type,
      slug: r.slug,
      title: r.title,
      views: Number(r.views),
    })),
    windowHours: hours,
    computedAt: new Date().toISOString(),
  };
  cache.set(key, { data, computedAtMs: Date.now() });
  res.json(data);
});
