/**
 * ТЗ-05: публичная страница автора.
 * GET /api/authors/:id — профиль (белый список полей, без email/passwordHash)
 * + опубликованные материалы с пейволл-фильтром под запрашивающего.
 * 404, если юзера нет ИЛИ нет ни одного доступного опубликованного материала
 * (анти-энумерация + не показываем пустые профили, решение ТЗ §4.3).
 */
import { Router } from 'express';
import { and, eq, isNotNull, sql } from 'drizzle-orm';
import { db, articles, users, media, articleLikes } from '@newinvest/db';
import { optionalAuth } from '../middleware/auth.js';
import { accessCondition, isAdmin } from './articles.js';
import { virtualViewsSql } from '../services/viewsBump.js';

export const authorsRouter = Router();

authorsRouter.get('/:id', optionalAuth, async (req, res) => {
  const id = Number(req.params.id);
  if (!Number.isInteger(id) || id <= 0) {
    res.status(404).json({ error: 'not found' });
    return;
  }
  const [author] = await db
    .select({
      id: users.id,
      displayName: users.displayName,
      avatar: users.avatar,
      bio: users.bio,
      createdAt: users.createdAt,
    })
    .from(users)
    .where(eq(users.id, id))
    .limit(1);
  if (!author) {
    res.status(404).json({ error: 'not found' });
    return;
  }

  // пейволл: счётчик и список — «сколько доступно именно этому запрашивающему» (решение ТЗ §4.3);
  // админы видят всё; автор без тарифа своих тарифных материалов не видит (ревью v2.1 №6)
  const conditions = [
    eq(articles.authorId, id),
    eq(articles.status, 'published'),
  ];
  const acc = accessCondition(req.user, isAdmin(req.user?.role));
  if (acc) conditions.push(acc);
  const where = and(...conditions);

  const query = db
    .select({
      id: articles.id,
      type: articles.type,
      slug: articles.slug,
      title: articles.title,
      excerpt: articles.excerpt,
      publishedAt: articles.publishedAt,
      coverUrl: media.filePath,
      videoUrl: articles.videoUrl,
      readingTime: articles.readingTime,
      viewsCount: virtualViewsSql,
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
    // как в списке статей: один leftJoin по паре (article, user), NULL = не лайкал
    query.leftJoin(
      articleLikes,
      and(eq(articleLikes.articleId, articles.id), eq(articleLikes.userId, req.user.id)),
    );
  }
  const list = await query
    .where(where)
    .orderBy(sql`coalesce(${articles.publishedAt}, ${articles.createdAt}) desc`)
    .limit(50);
  if (list.length === 0) {
    // нет опубликованных материалов (или все закрыты пейволлом для запрашивающего) — 404
    res.status(404).json({ error: 'not found' });
    return;
  }
  const [cnt] = await db
    .select({ n: sql<number>`count(*)::int` })
    .from(articles)
    .where(where);

  res.json({ author: { ...author, articleCount: cnt.n }, articles: list });
});
