/**
 * Административные эндпоинты: пользователи/роли, редиректы, статистика.
 */
import { Router } from 'express';
import { z } from 'zod';
import { and, desc, eq, gte, sql, type SQL } from 'drizzle-orm';
import { db, users, redirects, articleViews, articles } from '@newinvest/db';
import { authRequired, requireRole, ADMIN_ROLES } from '../middleware/auth.js';

export const adminRouter = Router();

// ---------- Пользователи ----------

adminRouter.get('/users', authRequired, requireRole(...ADMIN_ROLES), async (_req, res) => {
  const rows = await db
    .select({
      id: users.id,
      email: users.email,
      displayName: users.displayName,
      role: users.role,
      createdAt: users.createdAt,
      views: sql<number>`(select count(*) from article_views where user_id = ${users.id})`,
    })
    .from(users)
    .orderBy(desc(users.createdAt))
    .limit(200);
  res.json({ users: rows });
});

// смена роли — только super_admin
const roleSchema = z.object({ role: z.enum(['super_admin', 'admin', 'author', 'reader']) });
adminRouter.patch('/users/:id', authRequired, requireRole('super_admin'), async (req, res) => {
  const parsed = roleSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: 'validation' });
    return;
  }
  const [row] = await db.update(users).set({ role: parsed.data.role }).where(eq(users.id, Number(req.params.id))).returning({ id: users.id, email: users.email, role: users.role });
  if (!row) {
    res.status(404).json({ error: 'not found' });
    return;
  }
  res.json({ user: row });
});

// ---------- Редиректы ----------

adminRouter.get('/redirects', authRequired, requireRole(...ADMIN_ROLES), async (_req, res) => {
  res.json({ redirects: await db.select().from(redirects).orderBy(desc(redirects.oldPath)).limit(500) });
});

const redirectSchema = z.object({
  oldPath: z.string().min(1).regex(/^\//, 'путь должен начинаться с /'),
  newPath: z.string().min(1).regex(/^\//, 'путь должен начинаться с /'),
  httpCode: z.number().int().default(301),
});

adminRouter.post('/redirects', authRequired, requireRole(...ADMIN_ROLES), async (req, res) => {
  const parsed = redirectSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: 'validation', details: parsed.error.flatten() });
    return;
  }
  const [row] = await db.insert(redirects).values(parsed.data)
    .onConflictDoUpdate({ target: redirects.oldPath, set: { newPath: parsed.data.newPath, httpCode: parsed.data.httpCode } })
    .returning();
  res.status(201).json({ redirect: row });
});

adminRouter.delete('/redirects/:oldPath', authRequired, requireRole(...ADMIN_ROLES), async (req, res) => {
  await db.delete(redirects).where(eq(redirects.oldPath, decodeURIComponent(req.params.oldPath)));
  res.json({ ok: true });
});

// ---------- Аналитика просмотров ----------

adminRouter.get('/stats/views', authRequired, requireRole(...ADMIN_ROLES), async (req, res) => {
  const days = Math.min(90, Math.max(1, Number(req.query.days ?? 30)));
  const since = new Date(Date.now() - days * 86400_000);
  const rows = await db
    .select({
      articleId: articleViews.articleId,
      title: articles.title,
      type: articles.type,
      slug: articles.slug,
      views: sql<number>`count(*)`,
      uniqueUsers: sql<number>`count(distinct ${articleViews.userId})`,
    })
    .from(articleViews)
    .innerJoin(articles, eq(articleViews.articleId, articles.id))
    .where(gte(articleViews.viewedAt, since))
    .groupBy(articleViews.articleId, articles.title, articles.type, articles.slug)
    .orderBy(desc(sql`count(*)`))
    .limit(50);
  const total = (await db.select({ n: sql<number>`count(*)` }).from(articleViews).where(gte(articleViews.viewedAt, since)))[0].n;
  res.json({ days, total, articles: rows });
});
