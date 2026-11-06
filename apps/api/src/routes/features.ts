/**
 * Реестр фич (порт features_registry PULSE).
 * Публичный: GET /api/features (активные — для Pricing).
 * Админ: GET/POST /api/admin/features, PUT /api/admin/features/:id.
 */
import { Router } from 'express';
import { z } from 'zod';
import { asc, eq } from 'drizzle-orm';
import { db, featuresRegistry } from '@newinvest/db';
import { authRequired, requireRole, ADMIN_ROLES } from '../middleware/auth.js';

export const featuresRouter = Router();

// простой in-memory кэш (как invalidateFeaturesRegistryCache в PULSE)
let cache: { ts: number; active: unknown[]; all: unknown[] } | null = null;
const CACHE_TTL = 60_000;

function invalidate() {
  cache = null;
}

async function rows(activeOnly: boolean) {
  const now = Date.now();
  if (cache && now - cache.ts < CACHE_TTL) {
    return activeOnly ? cache.active : cache.all;
  }
  const all = await db.select().from(featuresRegistry).orderBy(asc(featuresRegistry.createdAt));
  const mapped = all.map((f) => ({
    id: f.id,
    label: f.label,
    description: f.description,
    isActive: f.isActive,
    integrationStatus: f.integrationStatus,
  }));
  cache = { ts: now, all: mapped, active: mapped.filter((f) => f.isActive) };
  return activeOnly ? cache.active : cache.all;
}

// публично: активные фичи
featuresRouter.get('/features', async (_req, res) => {
  res.json({ features: await rows(true) });
});

// админ: все
featuresRouter.get('/admin/features', authRequired, requireRole(...ADMIN_ROLES), async (_req, res) => {
  res.json({ features: await rows(false) });
});

const createSchema = z.object({
  id: z.string().regex(/^[a-z0-9_]{1,50}$/, 'ID: a-z, 0-9, _ (max 50)'),
  label: z.string().min(1).max(100),
  description: z.string().max(255).optional(),
  isActive: z.boolean().optional(),
});

featuresRouter.post('/admin/features', authRequired, requireRole(...ADMIN_ROLES), async (req, res) => {
  const parsed = createSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: 'validation', details: parsed.error.flatten() });
    return;
  }
  const existing = await db.select({ id: featuresRegistry.id }).from(featuresRegistry)
    .where(eq(featuresRegistry.id, parsed.data.id)).limit(1);
  if (existing.length > 0) {
    res.status(409).json({ error: 'Feature ID already exists' });
    return;
  }
  const [row] = await db.insert(featuresRegistry).values(parsed.data).returning();
  invalidate();
  res.status(201).json({
    feature: { ...row, isActive: row.isActive, integrationStatus: row.integrationStatus },
  });
});

const updateSchema = z.object({
  label: z.string().min(1).max(100).optional(),
  description: z.string().max(255).nullable().optional(),
  isActive: z.boolean().optional(),
  integrationStatus: z.enum(['pending', 'integrated', 'deprecated']).optional(),
});

featuresRouter.put('/admin/features/:id', authRequired, requireRole(...ADMIN_ROLES), async (req, res) => {
  const parsed = updateSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: 'validation', details: parsed.error.flatten() });
    return;
  }
  const [row] = await db.update(featuresRegistry)
    .set({ ...parsed.data, updatedAt: new Date() })
    .where(eq(featuresRegistry.id, req.params.id))
    .returning();
  if (!row) {
    res.status(404).json({ error: 'not found' });
    return;
  }
  invalidate();
  res.json({ feature: { ...row, isActive: row.isActive, integrationStatus: row.integrationStatus } });
});
