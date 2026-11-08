-- ТЗ: доступность тарифа — свойство плана (не фича).
-- Массив продуктов, где план показывается на витрине и действует.
-- Backfill: существующие планы newinvest доступны на инвестиционно.рф.
ALTER TABLE "subscription_plans" ADD COLUMN IF NOT EXISTS "products" TEXT[] NOT NULL DEFAULT '{}';

UPDATE "subscription_plans" SET "products" = '{invest}' WHERE "products" = '{}' AND "deleted_at" IS NULL;
