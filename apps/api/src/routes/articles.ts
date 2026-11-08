/**
 * Статьи: публичное чтение + создание/редактирование по ролям.
 * author — свои черновики; admin/super_admin — всё + публикация.
 */
import { Router } from 'express';
import { z } from 'zod';
import { and, eq, isNotNull, sql, type SQL } from 'drizzle-orm';
import {
  db, articles, ARTICLE_TYPES, type ArticleType,
  companies, trends, articleCompanies, articleTrends, media,
  metaFields, articleViews, users,
  tickers, articleTickers, dealStages, articleDealStages,
  articleLikes,
  calcReadingTime,
} from '@newinvest/db';
import { uniqueSlug, plainTextToHtml } from '../utils/slug.js';
import { optionalAuth, authRequired, requireRole, ADMIN_ROLES } from '../middleware/auth.js';
import { virtualViewsSql } from '../services/viewsBump.js';

export const articlesRouter = Router();

/** Только http/https — защита от javascript:/data: в href (аудит 2026-11-08) */
const httpUrl = (label: string) => z.string().url().refine(
  (u) => /^https?:\/\//i.test(u),
  { message: `${label}: только http(s) URL` },
);

const createSchema = z.object({
  type: z.enum(ARTICLE_TYPES),
  slug: z.string().regex(/^[a-z0-9-]+$/, 'slug: латиница, цифры, дефис'),
  title: z.string().min(1),
  contentHtml: z.string().min(1),
  excerpt: z.string().optional(),
  thesis: z.string().optional(), // тезис идеи
  coverMediaId: z.number().int().optional(),
  metaDescription: z.string().max(300).optional(), // SEO (meta_fields)
  accessLevel: z.enum(['public', 'auth', 'tariff']).optional(), // пейволл
  accessTariffId: z.number().int().optional(),
  sourceUrl: httpUrl('sourceUrl').optional(),
  videoUrl: httpUrl('videoUrl').optional(), // type=video: внешнее видео (YouTube/RuTube/VK)
  status: z.enum(['draft', 'published']).default('draft'),
});

const patchSchema = createSchema.partial().extend({
  // ТЗ-03: докрутка счётчиков — только через PATCH и только admin (в createSchema НЕ добавлять,
  // иначе автор сможет задать seed при POST — правка ревью v2.1 №4)
  viewsBaseOffset: z.number().int().min(0).max(1000000).optional(),
  viewsAutoBump: z
    .object({
      enabled: z.boolean(),
      everyHours: z.number().int().min(1).max(168),
      min: z.number().int().min(0).max(10000),
      max: z.number().int().min(0).max(10000),
    })
    .nullable() // явный null принимаем (выключить, диапазон сохранить — R3.4)
    .optional()
    .refine((v) => v == null || v.max >= v.min, { message: 'viewsAutoBump: max должен быть ≥ min' }),
});

const isAdmin = (role?: string) => role !== undefined && ADMIN_ROLES.includes(role);

// ---------- Пейволл: условие доступа к материалам ----------
// public — всем; auth — залогиненным; tariff — юзерам с нужным НЕпросроченным тарифом.
// Админы видят всё.
export function accessCondition(
  user?: { id: number; tariffId?: number | null; tariffExpiresAt?: string | null } | null,
  admin = false,
): SQL | null {
  if (admin) return null;
  const authOk = user ? sql`true` : sql`false`;
  const tariffValid =
    user?.tariffId && (!user.tariffExpiresAt || new Date(user.tariffExpiresAt) > new Date());
  const tariffOk = tariffValid ? sql`${articles.accessTariffId} = ${user!.tariffId}` : sql`false`;
  return sql`(${articles.accessLevel} = 'public' or (${articles.accessLevel} = 'auth' and ${authOk}) or (${articles.accessLevel} = 'tariff' and ${tariffOk}))`;
}

// GET /api/articles?type=novost&status=published&page=1&limit=20
articlesRouter.get('/', optionalAuth, async (req, res) => {
  const type = req.query.type as ArticleType | undefined;
  const page = Math.max(1, Number(req.query.page ?? 1));
  const limit = Math.min(100, Math.max(1, Number(req.query.limit ?? 20)));

  const conditions: SQL[] = [];
  // пейволл: фильтр по уровню доступа (админы — всё)
  const acc = accessCondition(req.user, isAdmin(req.user?.role));
  if (acc) conditions.push(acc);
  if (type && (ARTICLE_TYPES as readonly string[]).includes(type)) {
    conditions.push(eq(articles.type, type));
  }
  // Публично видны только опубликованные; админ — любые (или по выбранному статусу)
  const requestedStatus = req.query.status as string | undefined;
  if (isAdmin(req.user?.role)) {
    if (requestedStatus) conditions.push(eq(articles.status, requestedStatus));
  } else {
    conditions.push(eq(articles.status, 'published'));
  }

  // Поиск по заголовку/slug (админка) — case-insensitive подстрока
  const q = (req.query.q as string | undefined)?.trim();
  if (q) {
    const like = `%${q.toLowerCase()}%`;
    conditions.push(sql`lower(${articles.title}) like ${like} or lower(${articles.slug}) like ${like}`);
  }

  const where = conditions.length > 0 ? and(...conditions) : undefined;
  const query = db
    .select({
      id: articles.id,
      type: articles.type,
      slug: articles.slug,
      title: articles.title,
      excerpt: articles.excerpt,
      status: articles.status,
      publishedAt: articles.publishedAt,
      coverUrl: media.filePath,
      videoUrl: articles.videoUrl,
      readingTime: articles.readingTime,
      viewsCount: virtualViewsSql, // ТЗ-03: виртуальный счётчик (реальные + seed + докрутка)
      // ТЗ-04: счётчики вовлечения видны всем (L5); liked — через один leftJoin для залогиненного
      likesCount: articles.likesCount,
      sharesCount: articles.sharesCount,
      liked: req.user
        ? isNotNull(articleLikes.userId)
        : sql<boolean>`false`,
    })
    .from(articles)
    .leftJoin(media, eq(articles.coverMediaId, media.id))
    .$dynamic();
  if (req.user) {
    // не N+1 подзапросов: один джойн по паре (article, user) — NULL в liked = не лайкал
    query.leftJoin(
      articleLikes,
      and(eq(articleLikes.articleId, articles.id), eq(articleLikes.userId, req.user.id)),
    );
  }
  const list = await query
    .where(where)
    .orderBy(sql`coalesce(${articles.publishedAt}, ${articles.createdAt}) desc`)
    .limit(limit)
    .offset((page - 1) * limit);

  res.json({ articles: list, page, limit });
});

// GET /api/articles/:type/:slug — публичный просмотр
articlesRouter.get('/:type/:slug', optionalAuth, async (req, res) => {
  const { type, slug } = req.params;
  const [row] = await db
    .select({ article: articles, coverUrl: media.filePath, viewsCount: virtualViewsSql })
    .from(articles)
    .leftJoin(media, eq(articles.coverMediaId, media.id))
    .where(and(eq(articles.type, type), eq(articles.slug, slug)))
    .limit(1);
  const article = row?.article;
  if (!article || (article.status !== 'published' && !isAdmin(req.user?.role) && article.authorId !== req.user?.id)) {
    res.status(404).json({ error: 'not found' });
    return;
  }
  // пейволл: 403 с уровнем доступа — фронт покажет экран «войдите / оформите тариф»
  if (!isAdmin(req.user?.role)) {
    const acc = accessCondition(req.user);
    const [allowed] = await db.select({ ok: sql<boolean>`${acc}::boolean` })
      .from(articles).where(eq(articles.id, article.id)).limit(1);
    if (!allowed?.ok) {
      res.status(403).json({ error: 'forbidden', access: article.accessLevel });
      return;
    }
  }
  // Публичные связи — чипсы для навигации «проваливание из любой точки» (раздел 4.2)
  const relCompanies = await db
    .select({ slug: companies.slug, name: companies.name })
    .from(articleCompanies)
    .innerJoin(companies, eq(articleCompanies.companyId, companies.id))
    .where(eq(articleCompanies.articleId, article.id));
  const relTrends = await db
    .select({ slug: trends.slug, name: trends.name })
    .from(articleTrends)
    .innerJoin(trends, eq(articleTrends.trendId, trends.id))
    .where(eq(articleTrends.articleId, article.id));
  // тикеры и стадии сделки — для графика на карточке идеи («Торги на бирже» ⇒ тикер есть)
  const relTickers = await db
    .select({ symbol: tickers.symbol, exchange: tickers.exchange })
    .from(articleTickers)
    .innerJoin(tickers, eq(articleTickers.tickerId, tickers.id))
    .where(eq(articleTickers.articleId, article.id));
  const stagesRows = await db
    .select({ name: dealStages.name })
    .from(articleDealStages)
    .innerJoin(dealStages, eq(articleDealStages.stageId, dealStages.id))
    .where(eq(articleDealStages.articleId, article.id));
  // фиксируем просмотр (аналитика, раздел 6.2) — не блокируем ответ
  void db.insert(articleViews).values({ userId: req.user?.id ?? null, articleId: article.id }).catch(() => {});
  // SEO meta description (meta_fields)
  const [meta] = await db.select({ value: metaFields.value }).from(metaFields)
    .where(and(eq(metaFields.ownerType, 'article'), eq(metaFields.ownerId, article.id), eq(metaFields.key, 'meta_description')))
    .limit(1);
  // ТЗ-04: состояние «я лайкнул» для текущего юзера (анониму — false)
  let liked = false;
  if (req.user) {
    const [likeRow] = await db
      .select({ userId: articleLikes.userId })
      .from(articleLikes)
      .where(and(eq(articleLikes.articleId, article.id), eq(articleLikes.userId, req.user.id)))
      .limit(1);
    liked = likeRow !== undefined;
  }
  res.json({
    article,
    viewsCount: row.viewsCount, // ТЗ-03 R1.2: виртуальный счётчик отдельным полем в корне
    coverUrl: row.coverUrl,
    likesCount: article.likesCount, // ТЗ-04: счётчики + liked отдельными полями в корне
    sharesCount: article.sharesCount,
    liked,
    meta: { description: meta?.value ?? null },
    relations: { companies: relCompanies, trends: relTrends, tickers: relTickers },
    stages: stagesRows.map((s) => s.name),
  });
});

// POST /api/articles — author+; автор может только в черновики
articlesRouter.post('/', authRequired, requireRole('author', 'admin', 'super_admin'), async (req, res) => {
  const parsed = createSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: 'validation', details: parsed.error.flatten() });
    return;
  }
  const data = parsed.data;
  const { metaDescription, ...articleData } = data;
  // тарифный уровень без тарифа бессмысленен — сбрасываем на public
  if (articleData.accessLevel === 'tariff' && !articleData.accessTariffId) {
    articleData.accessLevel = 'public';
  }
  // автор не публикует напрямую — только через admin (раздел 6.3)
  const status = isAdmin(req.user!.role) ? data.status : 'draft';

  // дубль (type, slug) → 409, а не 500
  try {
    const [row] = await db
      .insert(articles)
      .values({ ...articleData, status, authorId: req.user!.id, readingTime: calcReadingTime(data.contentHtml) })
      .returning();
    if (metaDescription) {
      await saveMetaDescription(row.id, metaDescription);
    }
    res.status(201).json({ article: row });
  } catch (e) {
    // pg unique violation = code 23505 (constraint может быть в e или в e.cause)
    const code = (e as { code?: string; cause?: { code?: string } })?.code
      ?? (e as { cause?: { code?: string } })?.cause?.code;
    if (code === '23505') {
      res.status(409).json({ error: 'Такой slug уже есть у статьи этого типа', code: 'SLUG_EXISTS' });
      return;
    }
    throw e;
  }
});

// SEO meta description для статьи (meta_fields, раздел 5.4)
async function saveMetaDescription(articleId: number, value: string) {
  await db.insert(metaFields)
    .values({ ownerType: 'article', ownerId: articleId, key: 'meta_description', value })
    .onConflictDoUpdate({ target: [metaFields.ownerType, metaFields.ownerId, metaFields.key], set: { value } });
}

// PATCH /api/articles/:id — автор: свои неопубликованные; admin: любые
articlesRouter.patch('/:id', authRequired, requireRole('author', 'admin', 'super_admin'), async (req, res) => {
  const id = Number(req.params.id);
  const parsed = patchSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: 'validation', details: parsed.error.flatten() });
    return;
  }
  const [existing] = await db.select().from(articles).where(eq(articles.id, id)).limit(1);
  if (!existing) {
    res.status(404).json({ error: 'not found' });
    return;
  }
  const admin = isAdmin(req.user!.role);
  if (!admin && (existing.authorId !== req.user!.id || existing.status === 'published')) {
    res.status(403).json({ error: 'authors can edit only their own unpublished articles' });
    return;
  }
  const { metaDescription, viewsBaseOffset, viewsAutoBump, ...updates } = parsed.data;
  if (!admin) delete updates.status; // автор не меняет статус
  // ТЗ-03 R2: поля докрутки — только admin/super_admin; не-админу молча игнорируются
  // (403 нет — поведение как у status, значение не изменяется)
  if (admin) {
    if (viewsBaseOffset !== undefined) {
      (updates as Record<string, unknown>).viewsBaseOffset = viewsBaseOffset;
    }
    if (viewsAutoBump !== undefined) {
      if (viewsAutoBump === null) {
        // выключить; колонки диапазона СОХРАНЯЮТСЯ — повторное включение не требует ввода (R3.4)
        (updates as Record<string, unknown>).viewsAutoBumpEnabled = false;
      } else {
        (updates as Record<string, unknown>).viewsAutoBumpEnabled = viewsAutoBump.enabled;
        (updates as Record<string, unknown>).viewsAutoBumpEveryHours = viewsAutoBump.everyHours;
        (updates as Record<string, unknown>).viewsAutoBumpMin = viewsAutoBump.min;
        (updates as Record<string, unknown>).viewsAutoBumpMax = viewsAutoBump.max;
        // включение → перезапуск цикла: первый тик на ближайшем проходе (R3.4)
        if (viewsAutoBump.enabled) {
          (updates as Record<string, unknown>).viewsBumpLastAt = null;
        }
      }
    }
  }

  // ТЗ-09: контент пришёл — пересчитываем время чтения; без contentHtml колонку не трогаем
  if (typeof updates.contentHtml === 'string') {
    (updates as Record<string, unknown>).readingTime = calcReadingTime(updates.contentHtml);
  }

  // Переходы статуса: снятие с публикации очищает дату, публикация через PATCH ставит её, если пусто
  if (updates.status === 'draft') {
    (updates as Record<string, unknown>).publishedAt = null;
  } else if (updates.status === 'published' && !existing.publishedAt) {
    (updates as Record<string, unknown>).publishedAt = new Date();
  }

  // PATCH только полями докрутки от не-админа (или пустым телом) — нечего обновлять:
  // пустой .set() крашил процесс, теперь отдаём текущую статью без изменений
  if (Object.keys(updates).length === 0) {
    if (metaDescription) {
      await saveMetaDescription(id, metaDescription);
    }
    res.json({ article: existing });
    return;
  }

  const [row] = await db.update(articles).set(updates).where(eq(articles.id, id)).returning();
  if (metaDescription) {
    await saveMetaDescription(id, metaDescription);
  }
  res.json({ article: row });
});

// POST /api/articles/propose — предложить новость/идею (любой залогиненный).
// Читатель (reader) при первом предложении автоматически получает роль author.
articlesRouter.post('/propose', authRequired, async (req, res) => {
  const parsed = z.object({
    type: z.enum(['novost', 'ideya']),
    title: z.string().min(5).max(200),
    text: z.string().min(20),
    sourceUrl: z.string().url().refine((u) => /^https?:\/\//i.test(u), { message: 'sourceUrl: только http(s)' }).optional(),
  }).safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: 'validation', details: parsed.error.flatten() });
    return;
  }
  const { type, title, text, sourceUrl } = parsed.data;

  if (req.user!.role === 'reader') {
    await db.update(users).set({ role: 'author' }).where(eq(users.id, req.user!.id));
  }
  const slug = await uniqueSlug(type, title);
  const [row] = await db.insert(articles).values({
    type, slug, title,
    contentHtml: plainTextToHtml(text),
    sourceUrl: sourceUrl ?? null,
    authorId: req.user!.id,
    status: 'draft',
    readingTime: calcReadingTime(text), // ТЗ-09: plain text до конвертации в HTML (результат тот же)
  }).returning({ id: articles.id, type: articles.type, slug: articles.slug, title: articles.title, status: articles.status });
  res.status(201).json({ article: row, roleUpgraded: req.user!.role === 'reader' });
});

// POST /api/articles/:id/publish — только admin/super_admin
articlesRouter.post('/:id/publish', authRequired, requireRole(...ADMIN_ROLES), async (req, res) => {
  const id = Number(req.params.id);
  const [row] = await db
    .update(articles)
    .set({ status: 'published', publishedAt: new Date() })
    .where(eq(articles.id, id))
    .returning({ id: articles.id, status: articles.status, publishedAt: articles.publishedAt });
  if (!row) {
    res.status(404).json({ error: 'not found' });
    return;
  }
  res.json({ article: row });
});
