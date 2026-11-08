-- Админка тарифов: таблица планов подписок (порт subscription_plans PULSE, финальная v3).
-- Старая таблица tariff_plans (пейволл сайта) НЕ трогается — переключение на новую модель отдельной фазой.

CREATE TABLE IF NOT EXISTS "subscription_plans" (
  "id" VARCHAR(20) PRIMARY KEY,
  "name" VARCHAR(50) NOT NULL,
  "price" DECIMAL(10,2) NOT NULL DEFAULT 0,
  "billing_frequency" VARCHAR(20) NOT NULL DEFAULT 'monthly', -- weekly|monthly|quarterly|yearly
  "yearly_discount" INTEGER DEFAULT 0,
  "tag_limit" INTEGER NOT NULL DEFAULT 0,
  "portfolio_limit" INTEGER NOT NULL DEFAULT 0,
  "plan_level" INTEGER NOT NULL DEFAULT 0,
  "features" JSONB NOT NULL DEFAULT '{}',
  "display_order" INTEGER NOT NULL DEFAULT 0,
  "is_active" BOOLEAN DEFAULT TRUE,
  "is_popular" BOOLEAN NOT NULL DEFAULT FALSE,
  "coming_soon_label" VARCHAR(50) DEFAULT NULL,
  "created_at" TIMESTAMP DEFAULT NOW(),
  "updated_at" TIMESTAMP DEFAULT NOW(),
  "deleted_at" TIMESTAMP DEFAULT NULL
);

-- Seed: маппинг текущих tariff_plans newinvest (base 300₽/мес, 2880₽/год; insider 2500₽/мес,
-- 24000₽/год — годовая скидка у обоих 20%). ON CONFLICT — миграция идемпотентна.
INSERT INTO "subscription_plans"
  ("id", "name", "price", "billing_frequency", "yearly_discount", "tag_limit", "portfolio_limit", "plan_level", "features", "display_order", "is_active", "is_popular", "coming_soon_label")
VALUES
  ('base', 'Base', 300, 'monthly', 20, 0, 0, 1, '{}', 1, TRUE, FALSE, NULL),
  ('insider', 'Insider', 2500, 'monthly', 20, 0, 0, 3, '{}', 2, TRUE, FALSE, NULL)
ON CONFLICT ("id") DO NOTHING;

-- Доступность тарифа по продуктам — СВОЙСТВО плана (колонка products, миграция 0017),
-- а не фича реестра. Сид фич invest/pulse удалён намеренно.

