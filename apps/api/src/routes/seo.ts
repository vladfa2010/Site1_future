/**
 * GET /sitemap.xml + GET /robots.txt (ТЗ-10 §6.4).
 *
 * Динамическая генерация из БД при запросе с in-memory кэшем 15 мин
 * (по стоимости эквивалентна SSG-выдаче; ~520+ URL — тривиально).
 * Кэш инвалидируется при публикации/правке статьи (тот же хук, что и §6.1 —
 * routes/articles.ts вызывает invalidateSitemapCache()).
 *
 * Sitemap: только КАНОНИЧЕСКИЕ новые адреса — старые URL из redirects НЕ
 * включаем (вес передаёт серверными 301 из /render). URL пагинации лент не
 * включаем. lastmod = coalesce(publishedAt, updatedAt).
 * Все <loc> проходят escapeXml + percent-encoding slug'ов (ревью v2.1 №4).
 */
import { Router } from 'express';
import { desc, eq, sql } from 'drizzle-orm';
import {
  db, articles, companies, trends, stories, ARTICLE_TYPES,
} from '@newinvest/db';
import { escapeXml, encodePathSegment, toW3CDate } from '../utils/html.js';
import { siteOrigin } from '../services/botRender.js';

export const seoRouter = Router();

const SITEMAP_TTL_MS = 15 * 60 * 1000;
let sitemapCache: { xml: string; expiresAt: number } | null = null;

/** Инвалидация кэша sitemap при публикации/правке/снятии статьи */
export function invalidateSitemapCache(): void {
  sitemapCache = null;
}

const SITEMAP_NS = 'http://www.sitemaps.org/schemas/sitemap/0.9';

interface SitemapEntry { loc: string; lastmod?: Date | string; changefreq: string; priority: string }

function entryXml(e: SitemapEntry): string {
  const lastmod = e.lastmod ? `\n    <lastmod>${escapeXml(toW3CDate(e.lastmod))}</lastmod>` : '';
  return `  <url>\n    <loc>${escapeXml(e.loc)}</loc>${lastmod}\n    <changefreq>${e.changefreq}</changefreq>\n    <priority>${e.priority}</priority>\n  </url>`;
}

/** Сплит на sitemapindex при > 50 000 URL (заложено на будущее, §6.4) */
export function buildSitemapXml(entries: SitemapEntry[], origin: string): string {
  if (entries.length <= 50_000) {
    return `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="${SITEMAP_NS}">\n${entries.map(entryXml).join('\n')}\n</urlset>\n`;
  }
  const parts: string[] = [];
  for (let i = 0; i * 50_000 < entries.length; i++) {
    parts.push(`  <sitemap>\n    <loc>${escapeXml(`${origin}/sitemap-${i + 1}.xml`)}</loc>\n  </sitemap>`);
  }
  return `<?xml version="1.0" encoding="UTF-8"?>\n<sitemapindex xmlns="${SITEMAP_NS}">\n${parts.join('\n')}\n</sitemapindex>\n`;
}

async function buildSitemap(origin: string): Promise<string> {
  const base = origin.replace(/\/+$/, '');
  const entries: SitemapEntry[] = [];

  // статика + ленты рубрик
  entries.push({ loc: `${base}/`, changefreq: 'daily', priority: '1.0' });
  for (const t of ARTICLE_TYPES) {
    entries.push({ loc: `${base}/${t}`, changefreq: 'daily', priority: '0.7' });
  }
  for (const p of ['o-nas', 'zachem', 'smysl', 'missiya', 'portfolio', 'pricing', 'propose', 'privacy', 'terms']) {
    entries.push({ loc: `${base}/${p}`, changefreq: 'monthly', priority: '0.4' });
  }
  for (const p of [
    'kak-tut-vsyo-ustroeno', 'portfel-kak-ispolzovat', 'paypleyn-kak-ispolzovat',
    'arhiv-sdelok-kak-ispolzovat-razdel', 'trendy-chto-ehto-takoe',
  ]) {
    entries.push({ loc: `${base}/${p}`, changefreq: 'monthly', priority: '0.3' });
  }

  // статьи: published, все типы; lastmod = coalesce(publishedAt, updatedAt)
  const articleRows = await db
    .select({
      type: articles.type, slug: articles.slug,
      lastmod: sql<Date>`coalesce(${articles.publishedAt}, ${articles.updatedAt})`,
    })
    .from(articles)
    .where(eq(articles.status, 'published'))
    .orderBy(desc(sql`coalesce(${articles.publishedAt}, ${articles.updatedAt})`));
  for (const r of articleRows) {
    entries.push({
      loc: `${base}/${r.type}/${encodePathSegment(r.slug)}`,
      lastmod: r.lastmod,
      changefreq: 'daily',
      priority: '0.8',
    });
  }

  // сущности графа знаний
  const companyRows = await db
    .select({ slug: companies.slug, updatedAt: companies.updatedAt })
    .from(companies)
    .orderBy(desc(companies.updatedAt));
  for (const r of companyRows) {
    entries.push({ loc: `${base}/kompaniya/${encodePathSegment(r.slug)}`, lastmod: r.updatedAt, changefreq: 'weekly', priority: '0.6' });
  }

  const trendRows = await db
    .select({ slug: trends.slug, updatedAt: trends.updatedAt })
    .from(trends)
    .orderBy(desc(trends.updatedAt));
  for (const r of trendRows) {
    entries.push({ loc: `${base}/trend/${encodePathSegment(r.slug)}`, lastmod: r.updatedAt, changefreq: 'weekly', priority: '0.6' });
  }

  const storyRows = await db
    .select({ slug: stories.slug, updatedAt: stories.updatedAt })
    .from(stories)
    .orderBy(desc(stories.updatedAt));
  for (const r of storyRows) {
    entries.push({ loc: `${base}/syuzhet/${encodePathSegment(r.slug)}`, lastmod: r.updatedAt, changefreq: 'weekly', priority: '0.6' });
  }

  return buildSitemapXml(entries, base);
}

seoRouter.get('/sitemap.xml', async (req, res) => {
  try {
    if (!sitemapCache || sitemapCache.expiresAt < Date.now()) {
      const origin = siteOrigin(req.headers.host);
      sitemapCache = { xml: await buildSitemap(origin), expiresAt: Date.now() + SITEMAP_TTL_MS };
    }
    res.status(200).type('application/xml; charset=utf-8').send(sitemapCache.xml);
  } catch (e) {
    // Express 4 не ловит async-ошибки — без catch упавший sitemap ронял бы весь API
    console.error('[sitemap]', e);
    res.status(500).json({ error: 'internal' });
  }
});

seoRouter.get('/robots.txt', (req, res) => {
  const origin = siteOrigin(req.headers.host).replace(/\/+$/, '');
  res.status(200).type('text/plain; charset=utf-8').send(
    `User-agent: *
Disallow: /cabinet
Disallow: /api
Disallow: /render
Sitemap: ${origin}/sitemap.xml
`,
  );
});
