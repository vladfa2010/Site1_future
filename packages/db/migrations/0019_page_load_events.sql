-- Телеметрия загрузки страниц сайта: событие = открытие страницы + время до готовности данных.
CREATE TABLE IF NOT EXISTS "page_load_events" (
  "id"         SERIAL PRIMARY KEY,
  "path"       VARCHAR(120) NOT NULL,
  "load_ms"    INTEGER NOT NULL,
  "user_id"    INTEGER REFERENCES "users"("id") ON DELETE SET NULL,
  "created_at" TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS "page_load_events_path_created_idx" ON "page_load_events" ("path", "created_at" DESC);
