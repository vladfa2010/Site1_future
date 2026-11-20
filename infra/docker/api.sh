#!/bin/sh
# Ожидание PostgreSQL, создание БД/роли (idempotent), миграции, сид админа, запуск API.
# Подключение фазы миграций — супер-роль $POSTGRES_USER (роль создана при initdb);
# запуск сервера — роль newinvest_app без SUPERUSER (аудит 2026-11-15, ТЗ 3).
# Пароль newinvest_app фиксированный из infra/.env (APP_DB_PASSWORD): без него
# контейнер не стартует (fail fast, принцип «нет дефолтных секретов»).
set -e

PSQL="psql -h 127.0.0.1 -p 5432 -U $POSTGRES_USER"
export PGPASSWORD="$POSTGRES_PASSWORD"
MIGRATE_URL="postgres://$POSTGRES_USER:$POSTGRES_PASSWORD@127.0.0.1:5432/$POSTGRES_DB"

echo "[api] жду PostgreSQL..."
until $PSQL -d postgres -c "SELECT 1" >/dev/null 2>&1; do sleep 1; done
echo "[api] PostgreSQL готов"

# БД (idempotent) — роль $POSTGRES_USER суперпользователь (создана при initdb).
# Имя БД через psql-переменную (консистентно с GRANT-блоком, ревью 2026-11-20)
if $PSQL -d postgres -v db="$POSTGRES_DB" -tA <<'SQL' | grep -q 1
SELECT 1 FROM pg_database WHERE datname=:'db'
SQL
then
  :
else
  createdb -h 127.0.0.1 -U "$POSTGRES_USER" -O "$POSTGRES_USER" "$POSTGRES_DB"
fi

# Расширение vector нужно миграции 0000 — только фаза миграций, рантайму не нужно
$PSQL -d "$POSTGRES_DB" -c "CREATE EXTENSION IF NOT EXISTS vector"

# Рантайм-роль без SUPERUSER + DML-привилегии (idempotent, выполняется при каждом старте)
# Пароль/имя БД — psql-переменные (:'pw', :'db'), НЕ интерполяция в SQL-строку:
# кавычка в пароле иначе ломала бы старт, значение env — инъекцией в SQL (аудит 2026-11-20)
: "${APP_DB_PASSWORD:?Задайте APP_DB_PASSWORD в infra/.env (сильный пароль, отличный от POSTGRES_PASSWORD)}"
# psql не подставляет переменные внутри dollar-quoted DO-блока — поэтому CREATE/ALTER
# отдельными -c (подстановка :'pw' работает), ветка по факту существования роли
if [ "$($PSQL -d "$POSTGRES_DB" -tAc "SELECT 1 FROM pg_roles WHERE rolname='newinvest_app'")" = "1" ]; then
  $PSQL -d "$POSTGRES_DB" -v pw="$APP_DB_PASSWORD" <<'SQL'
ALTER ROLE newinvest_app WITH LOGIN PASSWORD :'pw' NOSUPERUSER NOCREATEDB NOCREATEROLE;
SQL
else
  $PSQL -d "$POSTGRES_DB" -v pw="$APP_DB_PASSWORD" <<'SQL'
CREATE ROLE newinvest_app LOGIN PASSWORD :'pw' NOSUPERUSER NOCREATEDB NOCREATEROLE;
SQL
fi
$PSQL -d "$POSTGRES_DB" -v db="$POSTGRES_DB" <<SQL
GRANT CONNECT ON DATABASE :'db' TO newinvest_app;
GRANT USAGE ON SCHEMA public TO newinvest_app;
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO newinvest_app;
GRANT USAGE ON ALL SEQUENCES IN SCHEMA public TO newinvest_app;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO newinvest_app;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT USAGE ON SEQUENCES TO newinvest_app;
SQL

# Миграции (idempotent) — супер-роль: drizzle-kit migrate выполняет DDL
echo "[api] миграции..."
(cd /app/packages/db && DATABASE_URL="$MIGRATE_URL" npx drizzle-kit migrate)

# Сид супер-админа (idempotent). БЕЗ подмены NODE_ENV: в production seed сам
# откажется от дефолтного ADMIN_PASSWORD (аудит 2026-11-14), ошибку не глотаем.
echo "[api] сид админа..."
DATABASE_URL="$MIGRATE_URL" npm run seed -w @newinvest/api

echo "[api] старт сервера :4000 (роль newinvest_app, без SUPERUSER)"
cd /app
# Пароль URI-кодируем (pg-connection-string декодирует компоненты): иначе @ : / ? #
# в пароле ломали бы разбор строки подключения (ревью 2026-11-20)
ENCODED_PW=$(node -e "console.log(encodeURIComponent(process.env.APP_DB_PASSWORD))")
export DATABASE_URL="postgres://newinvest_app:$ENCODED_PW@127.0.0.1:5432/$POSTGRES_DB"
unset PGPASSWORD   # супер-пароль рантайму не нужен и в env сервера не попадает
exec npx tsx apps/api/src/index.ts
