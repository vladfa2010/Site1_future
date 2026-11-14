#!/bin/sh
# Ожидание PostgreSQL, создание БД (если нет), миграции, сид админа, запуск API.
# Подключение — через TCP под супер-ролью $POSTGRES_USER (роль создана в initdb/pg.sh).
set -e

PSQL="psql -h 127.0.0.1 -p 5432 -U $POSTGRES_USER"
export PGPASSWORD="$POSTGRES_PASSWORD"
# Подключение API/миграций (дризл читает DATABASE_URL) — собирается из POSTGRES_*,
# секрет не запекается в образ (аудит 2026-11-14)
export DATABASE_URL="postgres://$POSTGRES_USER:$POSTGRES_PASSWORD@127.0.0.1:5432/$POSTGRES_DB"

echo "[api] жду PostgreSQL..."
until $PSQL -d postgres -c "SELECT 1" >/dev/null 2>&1; do sleep 1; done
echo "[api] PostgreSQL готов"

# БД (idempotent) — роль $POSTGRES_USER суперпользователь (создана при initdb)
$PSQL -d postgres -tAc "SELECT 1 FROM pg_database WHERE datname='$POSTGRES_DB'" | grep -q 1 \
  || createdb -h 127.0.0.1 -U "$POSTGRES_USER" -O "$POSTGRES_USER" "$POSTGRES_DB"

# Расширение vector нужно миграции 0000
$PSQL -d "$POSTGRES_DB" -c "CREATE EXTENSION IF NOT EXISTS vector"

# Миграции (idempotent)
echo "[api] миграции..."
(cd /app/packages/db && npx drizzle-kit migrate)

# Сид супер-админа (idempotent). БЕЗ подмены NODE_ENV: в production seed сам
# откажется от дефолтного ADMIN_PASSWORD (аудит 2026-11-14 — раньше здесь стоял
# NODE_ENV=development, глушивший эту проверку). Ошибку не глотаем: иначе при
# незаданном пароле супер-админ молча не создался бы, а при дефолтном — создался
# с опубликованным в репо паролем admin123.
echo "[api] сид админа..."
npm run seed -w @newinvest/api

echo "[api] старт сервера :4000"
cd /app
exec npx tsx apps/api/src/index.ts
