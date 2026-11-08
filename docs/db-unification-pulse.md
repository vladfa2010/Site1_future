# Унификация БД с PULSE: единая база пользователей

Цель: один логин/пароль на оба продукта (инвестиционно.рф и pulse). База — структура pulse, newinvest приводится к ней.

Проверено по коду (2026-11-08): pulse `src/models/schema.sql` (canonical Postgres) + `src/migrations/subscription_plans_v2.sql`, newinvest `packages/db/src/schema.ts` + `apps/api/src/routes/auth.ts` + `middleware/auth.ts`.

## Что совместимо уже сейчас

- Пароли: оба bcrypt (pulse 10 раундов, newinvest 12) — `bcrypt.compare` работает с любым хэшем, слияние без перехэширования. Новые пароли после слияния — 12 раундов.
- Имена колонок `email` UNIQUE, `password_hash`, `created_at` — совпадают.
- JWT: оба `jsonwebtoken` + секрет из `JWT_SECRET`.

## Ключевые расхождения

| | newinvest | pulse (целевая) |
|---|---|---|
| `id` | integer serial | **UUID** (`uuid_generate_v4()`) |
| Имя | `display_name` nullable | `username` NOT NULL + unique index на `LOWER(username)` |
| Роли | `role` text: super_admin/admin/author/reader | `is_admin` boolean |
| Тариф | `tariff_id` INT → `tariff_plans` + `tariff_expires_at` | `subscription_plan` VARCHAR(20) → `subscription_plans` + `subscription_active/expires_at/auto_renew/auto_renew_failures/scheduled_plan_downgrade/expiry_notified` |
| Аудит | — | `is_verified`, `is_blocked`, `last_login_at`, `login_count`, `registration_source`, `registration_ip`, `timezone`, `locale`, `cohort_date`, таблица `user_logins` |
| JWT payload | `{role, tariffId, tariffExpiresAt}`, sub=String(int), TTL 12h admin / 7d | `{userId, email, is_admin}`, 7d |
| Время | timestamptz | TIMESTAMP (без tz) — при слиянии приводим pulse к timestamptz |

FK на `users.id`: 10 таблиц newinvest (article_views, bookmarks, subscriptions, favorites, articles.author_id, notification_settings, tg_bindings, tg_link_codes, article_likes, article_share_events), ~20 у pulse.

## План по фазам

### Фаза 0 — расширение users до pulse-структуры (обратимо, без риска)

Миграция `0016_users_pulse_compat`:
1. `ALTER TABLE users ADD COLUMN` (все с default/backfill, НИЧЕГО не удаляем):
   `username VARCHAR(30)` (backfill из `display_name`, пустые — префикс email; конфликты lower-case — суффикс `-2`, `-3`…), `is_verified BOOLEAN DEFAULT FALSE`, `is_blocked BOOLEAN DEFAULT FALSE`, `last_login_at TIMESTAMPTZ`, `login_count INTEGER DEFAULT 0`, `registration_source VARCHAR(50)`, `registration_ip VARCHAR(45)`, `timezone VARCHAR(50)`, `locale VARCHAR(10)`, `cohort_date DATE` (backfill = `created_at::date`), `is_admin BOOLEAN GENERATED ALWAYS AS (role IN ('super_admin','admin')) STORED` (канон остаётся `role`, is_admin — производная, ноль кода синхронизации).
2. Таблица `user_logins` — DDL-копия из pulse (UUID PK, user_id FK, ip/ua/platform/device/os/browser/country + индексы).
3. Код newinvest: регистрация пишет `username`; логин обновляет `last_login_at`, `login_count` и вставляет строку в `user_logins`.

Критерий готовности: колонки заполнены, логины пишутся — newinvest уже «выглядит» как pulse по структуре.

### Фаза 1 — UUID (самое болезненное, отдельное maintenance-окно)

1. Бэкап БД (snapshot перед миграцией — обязателен).
2. `users`: add `new_id UUID DEFAULT gen_random_v4()`.
3. Для каждой из 10 FK-таблиц: add колонку `new_user_id UUID` → `UPDATE … FROM users` (маппинг int→uuid) → NOT NULL → drop old FK + old column → rename → add FK на `users.new_id`.
4. `users`: drop PK, drop int `id`, rename `new_id`→`id`, PK + default.
5. Drizzle: `id: uuid('id').primaryKey().defaultRandom()`; JWT sub уже String — формат меняется с числа на UUID, перелогин всех юзеров (токены инвалидируются — принять, анонсировать).
6. JWT payload перейдёт на uuid sub автоматически.

### Фаза 2 — тарифная система pulse

1. Создать `subscription_plans` (DDL из `subscription_plans_v2.sql`, id VARCHAR: free/base/premium/club/pro) + сидирование.
2. `users`: add `subscription_plan VARCHAR(20) DEFAULT 'free'`, `subscription_active BOOLEAN`, `subscription_expires_at`, `subscription_auto_renew`, … (полный набор pulse); backfill маппингом `tariff_plans.slug` → `subscription_plans.id`.
3. `accessCondition` и middleware newinvest переключить с `tariff_id` на `subscription_plan`/`subscription_active`; `tariff_plans` оставить как VIEW на переходный период, потом удалить.
4. JWT payload: единый superset `{role, is_admin, subscriptionPlan, subscriptionExpiresAt, tariffId(legacy)}`.

### Фаза 3 — SSO

1. Одинаковый `JWT_SECRET` в обоих сервисах (env на сервере).
2. Единые claims: `{sub: userId(uuid), email, role, is_admin, subscriptionPlan, exp}`, TTL 7d (12h-админ TTL newinvest отменить или согласовать), опционально `iss` для постепенного переключения.
3. Обе кодовые базы принимают единый токен (middleware: role+is_admin эквивалентны). Auth-endpoints остаются свои до Фазы 4, но токен, выданный pulse, проходит в newinvest и наоборот.

### Фаза 4 — конвергенция в одну БД

1. Одна PostgreSQL-БД, `users` — union-схема (pulse + `display_name`, `avatar`, `bio`, `old_wp_id` newinvest).
2. Продуктовые таблицы живут рядом с префиксами/схемами; `news_count` pulse для newinvest не нужен (NULL).
3. Удаление legacy: int-id маппинг-таблицы (после 6 мес), `tariff_*` VIEW.

## Риски и решения

- **Конфликт username при backfill** — суффикс-развязка, список конфликтов в лог миграции.
- **Перелогин при UUID** — все сессии сбрасываются один раз; делать ночью, с заглушкой «войдите заново».
- **email-дубликаты между БД при слиянии** — на Фазе 4: merge-правило (pulse-юзер основа, newinvest-данные переливаются на него), отчёт дубликатов ДО слияния.
- **TG-привязки (tg_bindings)** привязаны к int id — переливаются вместе с остальными FK на Фазе 1.
- **Rollback каждой фазы** — snapshot перед миграцией; Фазы 0/2 обратимы (только add-колонки), Фаза 1 — restore from snapshot.

## Оценка трудозатрат

Фаза 0: ~0.5–1 день (миграция + правки регистрации/логина + e2e). Фаза 1: 1–2 дня (10 FK-таблиц + тесты + окно миграции). Фаза 2: 1 день. Фаза 3: 0.5 дня (конфиг + middleware). Фаза 4: по результатам эксплуатации.
