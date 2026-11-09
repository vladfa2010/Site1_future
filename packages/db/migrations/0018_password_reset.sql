-- Восстановление пароля (порт PULSE) + блокировка пользователей.
-- 1) Коды сброса: 6 цифр, TTL 15 минут, одноразовые; старые коды юзера удаляются при новом запросе.
CREATE TABLE IF NOT EXISTS "password_reset_codes" (
  "id"         SERIAL PRIMARY KEY,
  "user_id"    INTEGER NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
  "code"       VARCHAR(6) NOT NULL,
  "created_at" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  "expires_at" TIMESTAMPTZ NOT NULL,
  "used_at"    TIMESTAMPTZ,
  "used"       BOOLEAN NOT NULL DEFAULT FALSE
);
CREATE INDEX IF NOT EXISTS "password_reset_codes_user_expires_idx" ON "password_reset_codes" ("user_id", "expires_at" DESC);

-- 2) Блокировка аккаунта (порт is_blocked PULSE): проверяется при логине и в requireRole
ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "is_blocked" BOOLEAN NOT NULL DEFAULT FALSE;
