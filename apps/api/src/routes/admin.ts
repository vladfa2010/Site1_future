/**
 * Административные эндпоинты: пользователи/роли, редиректы, статистика.
 */
import { Router } from 'express';
import { z } from 'zod';
import { and, desc, eq, gte, sql, type SQL } from 'drizzle-orm';
import { db, users, redirects, articleViews, articles, tariffPlans } from '@newinvest/db';
import { authRequired, requireRole, ADMIN_ROLES } from '../middleware/auth.js';
import { runDailyDigest, runWeeklyReport } from '../services/digest.js';

export const adminRouter = Router();

// ---------- Пользователи ----------

adminRouter.get('/users', authRequired, requireRole(...ADMIN_ROLES), async (_req, res) => {
  const rows = await db
    .select({
      id: users.id,
      email: users.email,
      displayName: users.displayName,
      role: users.role,
      tariffId: users.tariffId,
      tariffName: tariffPlans.name,
      createdAt: users.createdAt,
      views: sql<number>`(select count(*) from article_views where user_id = ${users.id})`,
    })
    .from(users)
    .leftJoin(tariffPlans, eq(users.tariffId, tariffPlans.id))
    .orderBy(desc(users.createdAt))
    .limit(200);
  res.json({ users: rows });
});

// редактирование пользователя — только super_admin
const userPatchSchema = z.object({
  role: z.enum(['super_admin', 'admin', 'author', 'reader']).optional(),
  email: z.string().email().optional(),
  displayName: z.string().trim().min(2).max(40).optional(),
  tariffId: z.number().int().nullable().optional(), // пейволл: тариф из БД (null — снять)
});

adminRouter.patch('/users/:id', authRequired, requireRole('super_admin'), async (req, res) => {
  const id = Number(req.params.id);
  const parsed = userPatchSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: 'validation', details: parsed.error.flatten() });
    return;
  }
  const { role, email, displayName, tariffId } = parsed.data;

  // уникальность email/displayName при смене (case-insensitive), исключая самого юзера
  if (email) {
    const [dup] = await db.select({ id: users.id }).from(users)
      .where(and(sql`lower(${users.email}) = lower(${email})`, sql`${users.id} <> ${id}`)).limit(1);
    if (dup) {
      res.status(409).json({ error: 'На эту почту уже зарегистрирован аккаунт', code: 'EMAIL_EXISTS' });
      return;
    }
  }
  if (displayName) {
    const [dup] = await db.select({ id: users.id }).from(users)
      .where(and(sql`lower(${users.displayName}) = lower(${displayName})`, sql`${users.id} <> ${id}`)).limit(1);
    if (dup) {
      res.status(409).json({ error: 'Это имя уже занято — придумайте другое', code: 'USERNAME_EXISTS' });
      return;
    }
  }

  const updates: Record<string, unknown> = {};
  if (role) updates.role = role;
  if (email) updates.email = email;
  if (displayName) updates.displayName = displayName;
  if (tariffId !== undefined) updates.tariffId = tariffId;

  const [row] = await db.update(users).set(updates).where(eq(users.id, id))
    .returning({ id: users.id, email: users.email, displayName: users.displayName, role: users.role });
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

// ---------- Уведомления: ручной запуск дайджестов ----------

adminRouter.post('/notifications/send', authRequired, requireRole(...ADMIN_ROLES), async (req, res) => {
  const scope = String(req.body?.scope ?? 'daily');
  const result = scope === 'weekly' ? await runWeeklyReport() : await runDailyDigest();
  res.json({ scope, ...result });
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
