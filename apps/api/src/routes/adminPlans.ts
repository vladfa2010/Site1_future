/**
 * Админка тарифов — порт /api/admin/plans PULSE (поведение 1:1).
 * Новая модель subscription_plans (миграция 0016); старые /api/tariff-plans не трогаем.
 *
 * Подписчики плана: users.tariff_id → tariff_plans.slug = subscription_plans.id
 * (маппинг через старую таблицу — оплата пока не подключена, тариф выдаёт админ).
 * «Активный» = тариф не просрочен (tariff_expires_at IS NULL ИЛИ в будущем).
 */
import { Router } from 'express';
import { z } from 'zod';
import { and, asc, count, eq, isNull, ne, or, gt } from 'drizzle-orm';
import { db, subscriptionPlans, tariffPlans, users } from '@newinvest/db';
import { authRequired, requireRole, ADMIN_ROLES } from '../middleware/auth.js';

export const adminPlansRouter = Router();

// ---------- zod-схемы (как в PULSE src/schemas/promo.ts) ----------
const createPlanSchema = z.object({
  id: z.string().regex(/^[a-z0-9_-]+$/).max(20),
  name: z.string().min(1).max(50),
  price: z.number().min(0),
  billing_frequency: z.enum(['weekly', 'monthly', 'quarterly', 'yearly']).default('monthly'),
  yearly_discount: z.number().int().min(0).max(100).default(0),
  tag_limit: z.number().int().min(-1),
  portfolio_limit: z.number().int().min(-1).default(0),
  plan_level: z.number().int().min(0),
  features: z.record(z.boolean()).default({}),
  is_active: z.boolean().default(true),
  is_popular: z.boolean().default(false),
  coming_soon_label: z.string().max(50).nullable().optional(),
  display_order: z.number().int().min(0),
});

const updatePlanSchema = z.object({
  name: z.string().min(1).max(50).optional(),
  price: z.number().min(0).optional(),
  billing_frequency: z.enum(['weekly', 'monthly', 'quarterly', 'yearly']).optional(),
  yearly_discount: z.number().int().min(0).max(100).optional(),
  tag_limit: z.number().int().min(-1).optional(),
  portfolio_limit: z.number().int().min(-1).optional(),
  plan_level: z.number().int().min(0).optional(),
  features: z.record(z.boolean()).optional(),
  is_active: z.boolean().optional(),
  is_popular: z.boolean().optional(),
  coming_soon_label: z.string().max(50).nullable().optional(),
  display_order: z.number().int().min(0).optional(),
});

// ---------- Лёгкий кэш списка планов (TTL 60с, инвалидация при мутациях) ----------
type PlanRow = typeof subscriptionPlans.$inferSelect;

let plansCache: { data: PlanRow[]; expiresAt: number } | null = null;
const PLANS_CACHE_TTL_MS = 60_000;

function invalidatePlansCache() {
  plansCache = null;
}

async function getAllPlans(): Promise<PlanRow[]> {
  const now = Date.now();
  if (plansCache && plansCache.expiresAt > now) {
    return plansCache.data;
  }
  const rows = await db.select().from(subscriptionPlans).orderBy(asc(subscriptionPlans.displayOrder));
  plansCache = { data: rows, expiresAt: now + PLANS_CACHE_TTL_MS };
  return rows;
}

async function getPlanById(id: string): Promise<PlanRow | null> {
  const [row] = await db.select().from(subscriptionPlans).where(eq(subscriptionPlans.id, id)).limit(1);
  return row ?? null;
}

// Активные подписчики плана через маппинг tariff_plans.slug = planId
async function getActiveSubscriberCount(planId: string): Promise<number> {
  const [agg] = await db
    .select({ cnt: count() })
    .from(users)
    .innerJoin(tariffPlans, eq(users.tariffId, tariffPlans.id))
    .where(
      and(
        eq(tariffPlans.slug, planId),
        or(isNull(users.tariffExpiresAt), gt(users.tariffExpiresAt, new Date())),
      ),
    );
  return agg?.cnt ?? 0;
}

function normalizePlanRow(row: PlanRow) {
  return {
    ...row,
    price: Number(row.price),
    features: (row.features ?? {}) as Record<string, boolean>,
  };
}

// ---------- GET / — все планы включая архивные, сортировка display_order ----------
adminPlansRouter.get('/', authRequired, requireRole(...ADMIN_ROLES), async (_req, res) => {
  try {
    const plans = await getAllPlans();
    res.json({ plans: plans.map(normalizePlanRow) });
  } catch (err) {
    console.error('[adminPlans] list error:', (err as Error).message);
    res.status(500).json({ error: 'internal' });
  }
});

// ---------- GET /:planId/subscribers — подписчики через маппинг (лимит 100) ----------
adminPlansRouter.get('/:planId/subscribers', authRequired, requireRole(...ADMIN_ROLES), async (req, res) => {
  try {
    const plan = await getPlanById(req.params.planId);
    if (!plan) {
      res.status(404).json({ error: 'not found' });
      return;
    }
    const where = and(
      eq(tariffPlans.slug, req.params.planId),
      or(isNull(users.tariffExpiresAt), gt(users.tariffExpiresAt, new Date())),
    );
    const rows = await db
      .select({
        id: users.id,
        display_name: users.displayName,
        email: users.email,
        tariff_expires_at: users.tariffExpiresAt,
      })
      .from(users)
      .innerJoin(tariffPlans, eq(users.tariffId, tariffPlans.id))
      .where(where)
      .orderBy(asc(users.id))
      .limit(100);
    const [agg] = await db
      .select({ cnt: count() })
      .from(users)
      .innerJoin(tariffPlans, eq(users.tariffId, tariffPlans.id))
      .where(where);
    res.json({ subscribers: rows, total: agg?.cnt ?? 0 });  } catch (err) {
    console.error('[adminPlans] subscribers error:', (err as Error).message);
    res.status(500).json({ error: 'internal' });
  }
});

// ---------- POST / — создание плана ----------
adminPlansRouter.post('/', authRequired, requireRole(...ADMIN_ROLES), async (req, res) => {
  const parsed = createPlanSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: 'validation', details: parsed.error.flatten() });
    return;
  }
  const body = parsed.data;
  try {
    if (body.billing_frequency === 'yearly' && body.yearly_discount > 0) {
      res.status(400).json({ error: 'yearly_discount must be 0 for yearly billing frequency' });
      return;
    }
    const existing = await getPlanById(body.id); // включая архивные — id нельзя переиспользовать
    if (existing) {
      res.status(409).json({ error: 'Plan ID already exists' });
      return;
    }
    // Только один «популярный» план
    if (body.is_popular) {
      await db.update(subscriptionPlans).set({ isPopular: false });
    }
    const features = {
      ...body.features,
      // энтитлмент multi_portfolio следует за portfolio_limit ≥ 1 (порт ТЗ-182 PULSE)
      ...(body.portfolio_limit > 0 ? { multi_portfolio: true } : {}),
    };
    const [row] = await db
      .insert(subscriptionPlans)
      .values({
        id: body.id,
        name: body.name,
        price: String(body.price),
        billingFrequency: body.billing_frequency,
        yearlyDiscount: body.yearly_discount,
        tagLimit: body.tag_limit,
        portfolioLimit: body.portfolio_limit,
        planLevel: body.plan_level,
        features,
        displayOrder: body.display_order,
        isActive: body.is_active,
        isPopular: body.is_popular,
        comingSoonLabel: body.coming_soon_label || null,
        createdAt: new Date(),
        updatedAt: new Date(),
      })
      .returning();
    invalidatePlansCache();
    res.status(201).json({ plan: normalizePlanRow(row) });
  } catch (err) {
    console.error('[adminPlans] create error:', (err as Error).message);
    res.status(500).json({ error: 'internal' });
  }
});

// ---------- PATCH /:planId — редактирование по whitelist ----------
adminPlansRouter.patch('/:planId', authRequired, requireRole(...ADMIN_ROLES), async (req, res) => {
  const parsed = updatePlanSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: 'validation', details: parsed.error.flatten() });
    return;
  }
  const body = parsed.data;
  try {
    const plan = await getPlanById(req.params.planId);
    if (!plan) {
      res.status(404).json({ error: 'not found' });
      return;
    }

    // Гвард подписчиков: с активными подписчиками нельзя менять plan_level/billing_frequency/id
    const subscriberCount = await getActiveSubscriberCount(req.params.planId);
    if (subscriberCount > 0) {
      const blockedFields = ['plan_level', 'billing_frequency', 'id'] as const;
      for (const field of blockedFields) {
        const newValue = (body as Record<string, unknown>)[field];
        const oldValue = (plan as unknown as Record<string, unknown>)[
          field === 'plan_level' ? 'planLevel' : field === 'billing_frequency' ? 'billingFrequency' : 'id'
        ];
        if (newValue !== undefined && newValue !== oldValue) {
          res.status(409).json({
            error: `Cannot change '${field}': ${subscriberCount} active subscribers. Create new plan instead.`,
            subscriberCount,
            blockedFields,
          });
          return;
        }
      }
    }

    const newBillingFrequency = body.billing_frequency ?? plan.billingFrequency;
    const newYearlyDiscount = body.yearly_discount ?? plan.yearlyDiscount ?? 0;
    if (newBillingFrequency === 'yearly' && newYearlyDiscount > 0) {
      res.status(400).json({ error: 'yearly_discount must be 0 for yearly billing frequency' });
      return;
    }

    // Только один «популярный» план
    if (body.is_popular) {
      await db.update(subscriptionPlans).set({ isPopular: false }).where(ne(subscriptionPlans.id, req.params.planId));
    }

    // multi_portfolio мержится в features при выставлении portfolio_limit ≥ 1
    const mergedFeatures =
      body.portfolio_limit !== undefined && body.portfolio_limit > 0
        ? { ...((body.features ?? (plan.features as Record<string, boolean>)) as Record<string, boolean>), multi_portfolio: true }
        : null;

    const updates: Partial<typeof subscriptionPlans.$inferInsert> = {};
    if (body.name !== undefined) updates.name = body.name;
    if (body.price !== undefined) updates.price = String(body.price);
    if (body.billing_frequency !== undefined) updates.billingFrequency = body.billing_frequency;
    if (body.yearly_discount !== undefined) updates.yearlyDiscount = body.yearly_discount;
    if (body.tag_limit !== undefined) updates.tagLimit = body.tag_limit;
    if (body.portfolio_limit !== undefined) updates.portfolioLimit = body.portfolio_limit;
    if (body.features !== undefined) updates.features = mergedFeatures ?? body.features;
    if (mergedFeatures && body.features === undefined) updates.features = mergedFeatures;
    if (body.is_active !== undefined) updates.isActive = body.is_active;
    if (body.is_popular !== undefined) updates.isPopular = body.is_popular;
    if (body.coming_soon_label !== undefined) updates.comingSoonLabel = body.coming_soon_label || null;
    if (body.display_order !== undefined) updates.displayOrder = body.display_order;

    // Страховка: активация плана без явной метки сбрасывает «скоро»
    if (body.is_active === true && body.coming_soon_label === undefined) {
      updates.comingSoonLabel = null;
    }

    if (Object.keys(updates).length === 0) {
      res.status(400).json({ error: 'No valid fields to update' });
      return;
    }
    updates.updatedAt = new Date();

    const [row] = await db
      .update(subscriptionPlans)
      .set(updates)
      .where(eq(subscriptionPlans.id, req.params.planId))
      .returning();
    invalidatePlansCache();
    res.json({ plan: normalizePlanRow(row) });
  } catch (err) {
    console.error('[adminPlans] update error:', (err as Error).message);
    res.status(500).json({ error: 'internal' });
  }
});

// ---------- Архив / восстановление ----------
// Гвард на pending payments из PULSE здесь не переносим: таблицы payments в newinvest нет —
// добавим с подключением оплаты.
adminPlansRouter.post('/:planId/archive', authRequired, requireRole(...ADMIN_ROLES), async (req, res) => {
  try {
    const plan = await getPlanById(req.params.planId);
    if (!plan) {
      res.status(404).json({ error: 'not found' });
      return;
    }
    const subscriberCount = await getActiveSubscriberCount(req.params.planId);
    await db
      .update(subscriptionPlans)
      .set({ deletedAt: new Date(), updatedAt: new Date() })
      .where(eq(subscriptionPlans.id, req.params.planId));
    invalidatePlansCache();
    res.json({
      archived: true,
      plan_id: req.params.planId,
      subscriberCount,
      message: `Тариф архивирован. ${subscriberCount} активных подписчиков останутся на нём до конца оплаченного периода.`,
    });
  } catch (err) {
    console.error('[adminPlans] archive error:', (err as Error).message);
    res.status(500).json({ error: 'internal' });
  }
});

adminPlansRouter.post('/:planId/restore', authRequired, requireRole(...ADMIN_ROLES), async (req, res) => {
  try {
    const [row] = await db
      .update(subscriptionPlans)
      .set({ deletedAt: null, updatedAt: new Date() })
      .where(eq(subscriptionPlans.id, req.params.planId))
      .returning();
    invalidatePlansCache();
    if (!row) {
      res.status(404).json({ error: 'not found' });
      return;
    }
    res.json({ restored: true, plan: normalizePlanRow(row) });
  } catch (err) {
    console.error('[adminPlans] restore error:', (err as Error).message);
    res.status(500).json({ error: 'internal' });
  }
});
