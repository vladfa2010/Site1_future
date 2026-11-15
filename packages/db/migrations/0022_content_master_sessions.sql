-- ТЗ-13 (2026-11-15): ContentMaster v2 — персистентные сессии рерайтов.
-- История чата раньше жила только в памяти вкладки; теперь — в БД.
-- Сессии привязаны к юзеру, сообщения каскадом удаляются со сессией.
CREATE TABLE IF NOT EXISTS "cm_sessions" (
  "id"         SERIAL PRIMARY KEY,
  "user_id"    INTEGER NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
  "title"      TEXT NOT NULL DEFAULT '',
  "source"     TEXT NOT NULL,             -- исходник целиком: текст или http(s)-ссылка
  "mode"       TEXT NOT NULL DEFAULT 'rewrite',  -- rewrite | factcheck
  "search"     BOOLEAN NOT NULL DEFAULT FALSE,
  "created_at" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  "updated_at" TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS "cm_sessions_user_idx" ON "cm_sessions" ("user_id", "updated_at" DESC);

CREATE TABLE IF NOT EXISTS "cm_messages" (
  "id"           SERIAL PRIMARY KEY,
  "session_id"   INTEGER NOT NULL REFERENCES "cm_sessions"("id") ON DELETE CASCADE,
  "role"         TEXT NOT NULL,           -- user | assistant
  "instruction"  TEXT NOT NULL,           -- инструкция автора (нужна и для контекста assistant)
  "result_json"  TEXT,                    -- только assistant: полный JSON результата рерайта/фактчека
  "created_at"   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS "cm_messages_session_idx" ON "cm_messages" ("session_id");
