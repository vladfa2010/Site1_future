/**
 * ТЗ-04: вовлечение — лайки и «поделились».
 *
 * PUT/DELETE /api/articles/:id/like   — только залогиненные (L1), 1 юзер = 1 лайк (PK, L2),
 *                                       повторный клик отменяет (L3), оба метода идемпотентны (L4).
 * POST   /api/articles/:id/share      — все, включая анонимов (S2); считается каждый клик (S1, S5).
 *
 * Маршруты смонтированы в index.ts ПЕРЕД articlesRouter — иначе `:id/like` распарсится
 * как `:type/:slug` (тот же конфликт, по которому bindings идёт первым).
 *
 * Лимитеры share — ЗДЕСЬ, после optionalAuth (правка ревью v2.1 №1): в index.ts req.user
 * ещё undefined, user-лимитер никогда не сработал бы, а anon-лимитер склеил бы всех по IP.
 * Доверие к X-Forwarded-For (нужно для key IP анонимов) — app.set('trust proxy', …) в index.ts.
 */
import { Router } from 'express';
import rateLimit, { ipKeyGenerator } from 'express-rate-limit';
import { z } from 'zod';
import { and, eq, gte, sql } from 'drizzle-orm';
import { db, articles, articleLikes, articleShareEvents } from '@newinvest/db';
import { optionalAuth, authRequired } from '../middleware/auth.js';

export const engagementRouter = Router();

// req.user должен быть заполнен ДО лимитеров — иначе skip-условия не сработают (ревью v2.1 №1)
engagementRouter.use(optionalAuth);

const limiterDefaults = { standardHeaders: true, legacyHeaders: false };

/** Залогиненный: 30 кликов «поделиться» в час на юзера (S3) */
const shareLimiterUser = rateLimit({
  windowMs: 3_600_000,
  limit: 30,
  ...limiterDefaults,
  keyGenerator: (req) => `u:${req.user!.id}`, // безопасно: skip ниже гарантирует req.user
  skip: (req) => !req.user,
  message: { error: 'share limit reached' },
});

/** Аноним: 10 кликов в час на IP (S3). IP из req.ip — корректен благодаря trust proxy в index.ts */
const shareLimiterAnon = rateLimit({
  windowMs: 3_600_000,
  limit: 10,
  ...limiterDefaults,
  keyGenerator: (req) => ipKeyGenerator(req.ip ?? 'unknown-ip'), // IPv6-нормализация: иначе обход лимита (ERR_ERL_KEY_GEN_IPV6)
  skip: (req) => !!req.user,
  message: { error: 'share limit reached' },
});

/** Каналы шеринга определяет ТЗ-02; всё остальное — 'unknown', а не 400 (S6, ревью v2.1 №10) */
const SHARE_CHANNELS = new Set(['telegram', 'vk', 'whatsapp', 'copylink', 'native_share']);

/** Тип транзакции drizzle (node-postgres) */
type Tx = Parameters<Parameters<typeof db.transaction>[0]>[0];

const shareSchema = z.object({
  channel: z.string().max(32).optional(),
});

/** Статья существует и опубликована — иначе 404 (лайк/шер черновиков запрещён, §4.5) */
async function publishedArticle(id: number) {
  const [row] = await db
    .select({ id: articles.id, status: articles.status })
    .from(articles)
    .where(eq(articles.id, id))
    .limit(1);
  return row && row.status === 'published' ? row : null;
}

/**
 * Самосхождение счётчика к истине (правка ревью v2.1 №9): вместо likes_count ± 1 пишем
 * COUNT(*) по таблице событий в той же транзакции — дрейф невозможен, цена ничтожна.
 */
function syncLikesCount(tx: Tx, id: number) {
  return tx.execute(sql`
    update ${articles}
    set likes_count = (select count(*) from ${articleLikes} where ${articleLikes.articleId} = ${articles.id})
    where ${articles.id} = ${id}`);
}
function syncSharesCount(tx: Tx, id: number) {
  return tx.execute(sql`
    update ${articles}
    set shares_count = (select count(*) from ${articleShareEvents} where ${articleShareEvents.articleId} = ${articles.id})
    where ${articles.id} = ${id}`);
}

// PUT /api/articles/:id/like — поставить лайк (идемпотентно, L4)
engagementRouter.put('/articles/:id/like', authRequired, async (req, res) => {
  const id = Number(req.params.id);
  if (!Number.isInteger(id) || !(await publishedArticle(id))) {
    res.status(404).json({ error: 'not found' });
    return;
  }
  const userId = req.user!.id;
  const result = await db.transaction(async (tx) => {
    // факт вставки — по длине returning (ревью v2.1 №2), PK даёт идемпотентность и защиту от гонок (L6)
    const inserted = await tx
      .insert(articleLikes)
      .values({ userId, articleId: id })
      .onConflictDoNothing()
      .returning();
    if (inserted.length > 0) {
      await syncLikesCount(tx, id);
    }
    const [row] = await tx.select({ likesCount: articles.likesCount }).from(articles).where(eq(articles.id, id));
    return { liked: true, likesCount: row?.likesCount ?? 0 };
  });
  res.json({ ok: true, ...result });
});

// DELETE /api/articles/:id/like — снять лайк (идемпотентно, L4)
engagementRouter.delete('/articles/:id/like', authRequired, async (req, res) => {
  const id = Number(req.params.id);
  if (!Number.isInteger(id) || !(await publishedArticle(id))) {
    res.status(404).json({ error: 'not found' });
    return;
  }
  const userId = req.user!.id;
  const result = await db.transaction(async (tx) => {
    const deleted = await tx
      .delete(articleLikes)
      .where(and(eq(articleLikes.userId, userId), eq(articleLikes.articleId, id)))
      .returning();
    if (deleted.length > 0) {
      await syncLikesCount(tx, id);
    }
    const [row] = await tx.select({ likesCount: articles.likesCount }).from(articles).where(eq(articles.id, id));
    return { liked: false, likesCount: row?.likesCount ?? 0 };
  });
  res.json({ ok: true, ...result });
});

// POST /api/articles/:id/share — клик по шерингу (анонимам можно, S2)
engagementRouter.post(
  '/articles/:id/share',
  shareLimiterUser,
  shareLimiterAnon,
  async (req, res) => {
    const id = Number(req.params.id);
    const parsed = shareSchema.safeParse(req.body ?? {});
    if (!Number.isInteger(id) || !parsed.success) {
      res.status(parsed.success ? 404 : 400).json(parsed.success ? { error: 'not found' } : { error: 'validation', details: parsed.error.flatten() });
      return;
    }
    const userId = req.user?.id ?? null;

    // per-article throttle: залогиненному не чаще 1 клика на материал в 10 минут (S3).
    // Анонимов не касается — у события нет IP-колонки, их ограничивает IP-лимитер (решение ТЗ §8.6)
    if (userId) {
      const [recent] = await db
        .select({ id: articleShareEvents.id })
        .from(articleShareEvents)
        .where(
          and(
            eq(articleShareEvents.articleId, id),
            eq(articleShareEvents.userId, userId),
            gte(articleShareEvents.createdAt, new Date(Date.now() - 10 * 60_000)),
          ),
        )
        .limit(1);
      if (recent) {
        res.status(429).json({ error: 'share limit reached' });
        return;
      }
    }

    if (!(await publishedArticle(id))) {
      res.status(404).json({ error: 'not found' });
      return;
    }

    const requested = parsed.data.channel ?? 'unknown';
    const channel = SHARE_CHANNELS.has(requested) ? requested : 'unknown';
    const sharesCount = await db.transaction(async (tx) => {
      await tx.insert(articleShareEvents).values({ articleId: id, userId, channel });
      await syncSharesCount(tx, id);
      const [row] = await tx.select({ sharesCount: articles.sharesCount }).from(articles).where(eq(articles.id, id));
      return row?.sharesCount ?? 0;
    });
    res.status(201).json({ ok: true, sharesCount });
  },
);
