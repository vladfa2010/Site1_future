-- ТЗ на доработку безопасности, задачи 4.2/4.3 (2026-11-15).
-- 1) Инвалидация resetToken/JWT после смены пароля: users.password_changed_at;
--    токены с iat < password_changed_at отклоняются.
ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "password_changed_at" TIMESTAMPTZ;

-- 2) Аудит действий админов: кто/что/над чем/откуда, без секретов в payload.
CREATE TABLE IF NOT EXISTS "admin_audit_log" (
  "id"         SERIAL PRIMARY KEY,
  "admin_id"   INTEGER NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
  "action"     TEXT NOT NULL,
  "target"     TEXT,
  "meta"       TEXT,
  "ip"         TEXT,
  "created_at" TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS "admin_audit_log_created_idx" ON "admin_audit_log" ("created_at");
