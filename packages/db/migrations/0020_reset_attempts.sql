-- Аудит 2026-11-14: защита кода восстановления пароля от перебора.
-- Счётчик неверных вводов: MAX_ATTEMPTS (5) промахов → код инвалидируется.
ALTER TABLE "password_reset_codes" ADD COLUMN IF NOT EXISTS "attempts" INTEGER NOT NULL DEFAULT 0;
