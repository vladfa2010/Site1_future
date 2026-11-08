/**
 * Поиск по материалам: гибрид FTS (русский стемминг) + векторный (pgvector).
 * - FTS работает всегда (search_tsv, миграция 0012)
 * - Векторный включается, когда: задан ключ Moonshot И в БД есть эмбеддинги
 * - Слияние списков — RRF (reciprocal rank fusion)
 * Пейволл соблюдается: аноним видит только public-опубликованное.
 */
import { Router } from 'express';
import { sql } from 'drizzle-orm';
import { db, articles, articleEmbeddings, media } from '@newinvest/db';
import { optionalAuth, ADMIN_ROLES } from '../middleware/auth.js';
import { accessCondition } from './articles.js';
import { virtualViewsSql } from '../services/viewsBump.js';
import { embedText } from '../services/embeddings.js';

export const searchRouter = Router();

const isAdmin = (role?: string) => role !== undefined && ADMIN_ROLES.includes(role);

interface Hit {
  id: number; type: string; slug: string; title: string;
  excerpt: string | null; coverUrl: string | null; publishedAt: string | null;
  viewsCount: number; // ТЗ-03
  score: number;
  source: 'fts' | 'vector';
}

searchRouter.get('/', optionalAuth, async (req, res) => {
  const q = (req.query.q as string ?? '').trim().slice(0, 300); // анти-DoS: огромные запросы в tsquery/embed (аудит)
  if (q.length < 2) {
    res.status(400).json({ error: 'query too short (min 2 chars)' });
    return;
  }
  const limit = Math.min(30, Math.max(1, Number(req.query.limit ?? 10)));
  const mode = (req.query.mode as string | undefined) ?? 'auto'; // auto | fts | vector

  const admin = isAdmin(req.user?.role);
  const access = accessCondition(req.user, admin);
  const publishedOnly = admin ? sql`true` : sql`${articles.status} = 'published'`;

  // ---------- 1. Полнотекстовый поиск ----------
  // search_tsv — tsvector GENERATED ALWAYS (миграция 0012), в Drizzle-схеме нет: имя константно.
  const ftsRows = mode !== 'vector'
    ? await db.execute<{
        id: number; type: string; slug: string; title: string;
        excerpt: string | null; cover_url: string | null; published_at: string | null;
        views_count: number; rank: number;
      }>(sql`
        select ${articles.id}, ${articles.type}, ${articles.slug}, ${articles.title},
               ${articles.excerpt}, ${media.filePath} as cover_url, ${articles.publishedAt},
               ${virtualViewsSql} as views_count,
               ts_rank(articles.search_tsv, websearch_to_tsquery('russian', ${q})) as rank
        from ${articles}
        left join ${media} on ${articles.coverMediaId} = ${media.id}
        where articles.search_tsv @@ websearch_to_tsquery('russian', ${q})
          and ${publishedOnly}
          ${access ? sql`and ${access}` : sql``}
        order by rank desc
        limit ${limit * 2}
      `)
    : { rows: [] };

  const ftsHits: Hit[] = ftsRows.rows.map((r) => ({
    id: r.id, type: r.type, slug: r.slug, title: r.title,
    excerpt: r.excerpt, coverUrl: r.cover_url, publishedAt: r.published_at,
    viewsCount: Number(r.views_count),
    score: Number(r.rank), source: 'fts',
  }));

  // ---------- 2. Векторный поиск ----------
  let vectorHits: Hit[] = [];
  if (mode !== 'fts') {
    try {
      const embedded = await embedText(q);
      if (embedded) {
        const vRows = await db.execute<{
          id: number; type: string; slug: string; title: string;
          excerpt: string | null; cover_url: string | null; published_at: string | null;
          views_count: number; distance: number;
        }>(sql`
          select ${articles.id}, ${articles.type}, ${articles.slug}, ${articles.title},
                 ${articles.excerpt}, ${media.filePath} as cover_url, ${articles.publishedAt},
                 ${virtualViewsSql} as views_count,
                 (${articleEmbeddings.embedding} <=> ${`[${embedded.vector.join(',')}]`}::vector) as distance
          from ${articleEmbeddings}
          inner join ${articles} on ${articles.id} = ${articleEmbeddings.articleId}
          left join ${media} on ${articles.coverMediaId} = ${media.id}
          where ${publishedOnly}
            ${access ? sql`and ${access}` : sql``}
          order by distance asc
          limit ${limit * 2}
        `);
        vectorHits = vRows.rows.map((r) => ({
          id: r.id, type: r.type, slug: r.slug, title: r.title,
          excerpt: r.excerpt, coverUrl: r.cover_url, publishedAt: r.published_at,
          viewsCount: Number(r.views_count),
          score: 1 / (1 + Number(r.distance)), source: 'vector',
        }));
      }
    } catch (e) {
      console.warn('[search] vector search failed, FTS only:', e instanceof Error ? e.message : e);
    }
  }

  // ---------- 3. RRF-слияние ----------
  const k = 60;
  const byId = new Map<number, Hit & { rrf: number }>();
  const add = (hits: Hit[]) => {
    hits.forEach((h, idx) => {
      const cur = byId.get(h.id);
      const rrfScore = 1 / (k + idx + 1);
      if (cur) {
        cur.rrf += rrfScore;
        if (h.score > cur.score) { cur.score = h.score; cur.source = h.source; }
      } else {
        byId.set(h.id, { ...h, rrf: rrfScore });
      }
    });
  };
  add(ftsHits);
  add(vectorHits);

  const results = [...byId.values()]
    .sort((a, b) => b.rrf - a.rrf)
    .slice(0, limit)
    .map(({ rrf: _rrf, ...h }) => h);

  res.json({
    q,
    mode: vectorHits.length > 0 ? 'hybrid' : 'fts',
    count: results.length,
    results,
  });
});
