/**
 * Административные эндпоинты: пользователи/роли, редиректы, статистика.
 */
import { Router, type Request } from 'express';
import { z } from 'zod';
import { and, desc, eq, gte, sql } from 'drizzle-orm';
import { db, users, redirects, articleViews, articles, tariffPlans, adminAuditLog } from '@newinvest/db';
import { authRequired, requireRole, ADMIN_ROLES } from '../middleware/auth.js';
import { runDailyDigest, runWeeklyReport } from '../services/digest.js';
import { runViewsBump, virtualViewsSql } from '../services/viewsBump.js';
import { invalidateRedirectsCache } from '../services/botRender.js';

export const adminRouter = Router();

// ---------- Аудит действий админов (ТЗ 4.3, 2026-11-15) ----------
// Кто/что/над чем/откуда — без секретов и персональных данных сверх ID в meta.
async function audit(req: Request, action: string, target: string, meta?: unknown): Promise<void> {
  try {
    await db.insert(adminAuditLog).values({
      adminId: req.user!.id,
      action,
      target: target.slice(0, 200),
      meta: meta === undefined ? null : JSON.stringify(meta).slice(0, 2000),
      ip: req.ip ?? null,
    });
  } catch (e) {
    // аудит не должен ронять основную операцию — но ошибка видна в логе
    console.error('[audit]', action, (e as Error).message);
  }
}

// GET /api/admin/audit-log — просмотр только супер-админом, последние 200 записей.
// Путь /admin/audit-log внутри роутера (смонтирован на /api) — паритет с /api/admin/plans.
adminRouter.get('/admin/audit-log', authRequired, requireRole('super_admin'), async (_req, res) => {
  const rows = await db
    .select({
      id: adminAuditLog.id,
      adminId: adminAuditLog.adminId,
      adminEmail: users.email,
      action: adminAuditLog.action,
      target: adminAuditLog.target,
      meta: adminAuditLog.meta,
      ip: adminAuditLog.ip,
      createdAt: adminAuditLog.createdAt,
    })
    .from(adminAuditLog)
    .leftJoin(users, eq(adminAuditLog.adminId, users.id))
    .orderBy(desc(adminAuditLog.id))
    .limit(200);
  res.json({ entries: rows });
});

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

// GET /api/admin/users/export.csv — выгрузка базы (как в PULSE, ТЗ-120)
adminRouter.get('/users/export.csv', authRequired, requireRole(...ADMIN_ROLES), async (_req, res) => {
  const rows = await db
    .select({
      id: users.id,
      email: users.email,
      displayName: users.displayName,
      role: users.role,
      tariffName: tariffPlans.name,
      createdAt: users.createdAt,
      views: sql<number>`(select count(*) from article_views where user_id = ${users.id})`,
      favorites: sql<number>`(select count(*) from favorites where user_id = ${users.id})`,
      subscriptions: sql<number>`(select count(*) from subscriptions where user_id = ${users.id})`,
    })
    .from(users)
    .leftJoin(tariffPlans, eq(users.tariffId, tariffPlans.id))
    .orderBy(desc(users.createdAt));
  const esc = (v: unknown) => `"${String(v ?? '').replace(/"/g, '""')}"`;
  const header = 'id,email,display_name,role,tariff,created_at,views,favorites,subscriptions';
  const lines = rows.map((r) =>
    [r.id, esc(r.email), esc(r.displayName), r.role, esc(r.tariffName ?? ''), r.createdAt, r.views, r.favorites, r.subscriptions].join(','));
  res.setHeader('Content-Type', 'text/csv; charset=utf-8');
  res.setHeader('Content-Disposition', `attachment; filename="users-${new Date().toISOString().slice(0, 10)}.csv"`);
  res.send('﻿' + header + '\n' + lines.join('\n'));
});

// редактирование пользователя — только super_admin
const userPatchSchema = z.object({
  role: z.enum(['super_admin', 'admin', 'author', 'reader']).optional(),
  email: z.string().email().optional(),
  displayName: z.string().trim().min(2).max(40).nullable().optional(), // null — сбросить (колонка nullable)
  tariffId: z.number().int().nullable().optional(),        // пейволл: тариф из БД (null — снять)
  tariffExpiresAt: z.string().nullable().optional(),      // ISO-дата; null = бессрочно
  isBlocked: z.boolean().optional(),                      // блокировка: логин и requireRole откажут
});

adminRouter.patch('/users/:id', authRequired, requireRole('super_admin'), async (req, res) => {
  const id = Number(req.params.id);
  const parsed = userPatchSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: 'validation', details: parsed.error.flatten() });
    return;
  }
  const { role, email, displayName, tariffId, tariffExpiresAt, isBlocked } = parsed.data;

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
  if (isBlocked !== undefined) updates.isBlocked = isBlocked;
  if (email) updates.email = email;
  if (displayName !== undefined) updates.displayName = displayName; // null — сбросить имя
  if (tariffId !== undefined) updates.tariffId = tariffId;
  if (tariffExpiresAt !== undefined) updates.tariffExpiresAt = tariffExpiresAt ? new Date(tariffExpiresAt) : null;

  const [row] = await db.update(users).set(updates).where(eq(users.id, id))
    .returning({ id: users.id, email: users.email, displayName: users.displayName, role: users.role });
  if (!row) {
    res.status(404).json({ error: 'not found' });
    return;
  }
  await audit(req, 'users.patch', `user:${id}`, { changed: Object.keys(updates) });
  res.json({ user: row });
});

// ---------- Редиректы ----------

adminRouter.get('/redirects', async (_req, res) => {
  // публичное чтение: SPA использует для клиентских 301 (данные не чувствительные)
  res.json({ redirects: await db.select().from(redirects).orderBy(desc(redirects.oldPath)).limit(1000) });
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
  invalidateRedirectsCache(); // ТЗ-10 (ревью v2.1 №5): иначе бот-хиты ещё 15 мин по старому кэшу
  await audit(req, 'redirects.create', parsed.data.oldPath, { newPath: parsed.data.newPath, httpCode: parsed.data.httpCode });
  res.status(201).json({ redirect: row });
});

adminRouter.delete('/redirects/:oldPath', authRequired, requireRole(...ADMIN_ROLES), async (req, res) => {
  await db.delete(redirects).where(eq(redirects.oldPath, decodeURIComponent(req.params.oldPath)));
  invalidateRedirectsCache(); // ТЗ-10 (ревью v2.1 №5)
  await audit(req, 'redirects.delete', decodeURIComponent(req.params.oldPath).slice(0, 200));
  res.json({ ok: true });
});

// ---------- Уведомления: ручной запуск дайджестов ----------

adminRouter.post('/notifications/send', authRequired, requireRole(...ADMIN_ROLES), async (req, res) => {
  const scope = String(req.body?.scope ?? 'daily');
  const result = scope === 'weekly' ? await runWeeklyReport() : await runDailyDigest();
  await audit(req, 'notifications.send', scope, result);
  res.json({ scope, ...result });
});

// ---------- Аналитика просмотров ----------

// POST /api/admin/views/bump — ручной триггер одного прохода автодокрутки (R2.4, для e2e/проверок)
adminRouter.post('/admin/views/bump', authRequired, requireRole(...ADMIN_ROLES), async (_req, res) => {
  const result = await runViewsBump();
  res.json(result);
});

adminRouter.get('/stats/views', authRequired, requireRole(...ADMIN_ROLES), async (req, res) => {
  const days = Math.min(90, Math.max(1, Number(req.query.days ?? 30)));
  const since = new Date(Date.now() - days * 86400_000);
  const rows = await db
    .select({
      articleId: articleViews.articleId,
      title: articles.title,
      type: articles.type,
      slug: articles.slug,
      // ТЗ-03 R4: реальные и виртуальные просмотры — РАЗДЕЛЬНО, total только по реальным
      realViews: sql<number>`count(*)::int`,
      virtualViews: virtualViewsSql,
      baseOffset: articles.viewsBaseOffset,
      accumulatedBump: articles.viewsBumpAccumulated,
      uniqueUsers: sql<number>`count(distinct ${articleViews.userId})`,
    })
    .from(articleViews)
    .innerJoin(articles, eq(articleViews.articleId, articles.id))
    .where(gte(articleViews.viewedAt, since))
    .groupBy(
      articleViews.articleId, articles.id, articles.title, articles.type, articles.slug,
      articles.viewsBaseOffset, articles.viewsBumpAccumulated, // колонки виртуального счётчика
    )
    .orderBy(desc(sql`count(*)`))
    .limit(50);
  const total = (await db.select({ n: sql<number>`count(*)` }).from(articleViews).where(gte(articleViews.viewedAt, since)))[0].n;
  res.json({ days, total, articles: rows });
});
