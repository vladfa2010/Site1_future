# Черновик: задача 3 — контейнер без root (на ревью, НЕ применено)

Дата: 2026-11-15. Статус: черновик для согласования перед maintenance-окном.
После согласования изменения вносятся по этому документу, прогоняются на локальной
копии и только затем — на стенде.

## Цель и текущее состояние

Сейчас в моноконтейнере под root работают supervisord, Caddy, API, а роль БД
в `DATABASE_URL` — суперпользователь (создана через initdb). Компрометация любого
процесса = root в контейнере + полный доступ к БД.

Проверено по коду: DDL в рантайме API не выполняется (только миграции на старте,
`CREATE EXTENSION` — тоже фаза старта). Значит, рантайм-роли БД достаточно
привилегий DML: SELECT/INSERT/UPDATE/DELETE на таблицы + USAGE на последовательности.

## Архитектура после изменения

```
supervisord (root) ─┬─ postgres  → su postgres (как сейчас, initdb-супер-роль)
                    ├─ api.sh    → user=app (ОС)     ├─ фаза 1: миграции от superuser-роли (TCP)
                    │                                 └─ фаза 2: API-сервер от newinvest_app
                    └─ caddy     → user=app (ОС) + cap_net_bind_service
```

Ключевое разделение: **супер-роль БД используется только фазой миграций на старте**;
серверный процесс получает отдельную роль `newinvest_app` (NOSUPERUSER) с паролем
из `infra/.env` (`APP_DB_PASSWORD`) — фиксированный, как остальные секреты стенда.

## Изменение 1. `infra/docker/api.sh` (полная замена)

```sh
#!/bin/sh
# Ожидание PostgreSQL, создание БД/роли (idempotent), миграции, сид админа, запуск API.
# Фаза 1 (миграции) — супер-роль $POSTGRES_USER; фаза 2 (сервер) — роль newinvest_app.
# Пароль роли newinvest_app генерируется на старт контейнера, серверу передаётся
# только она (аудит 2026-11-15, ТЗ 3: рантайм без SUPERUSER).
set -e

PSQL="psql -h 127.0.0.1 -p 5432 -U $POSTGRES_USER"
export PGPASSWORD="$POSTGRES_PASSWORD"
MIGRATE_URL="postgres://$POSTGRES_USER:$POSTGRES_PASSWORD@127.0.0.1:5432/$POSTGRES_DB"

echo "[api] жду PostgreSQL..."
until $PSQL -d postgres -c "SELECT 1" >/dev/null 2>&1; do sleep 1; done
echo "[api] PostgreSQL готов"

# БД (idempotent) — роль $POSTGRES_USER суперпользователь (создана при initdb)
$PSQL -d postgres -tAc "SELECT 1 FROM pg_database WHERE datname='$POSTGRES_DB'" | grep -q 1 \
  || createdb -h 127.0.0.1 -U "$POSTGRES_USER" -O "$POSTGRES_USER" "$POSTGRES_DB"

# Расширение vector нужно миграции 0000 (фаза миграций — только здесь)
$PSQL -d "$POSTGRES_DB" -c "CREATE EXTENSION IF NOT EXISTS vector"

# Рантайм-роль без SUPERUSER + DML-привилегии (idempotent, выполняется при каждом старте)
# Пароль фиксированный из infra/.env (APP_DB_PASSWORD) — как остальные секреты стенда.
: "${APP_DB_PASSWORD:?Задайте APP_DB_PASSWORD в infra/.env (сильный пароль, не совпадающий с POSTGRES_PASSWORD)}"
$PSQL -d "$POSTGRES_DB" <<SQL
DO \$\$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'newinvest_app') THEN
    CREATE ROLE newinvest_app LOGIN PASSWORD '$APP_DB_PASSWORD' NOSUPERUSER NOCREATEDB NOCREATEROLE;
  ELSE
    ALTER ROLE newinvest_app WITH LOGIN PASSWORD '$APP_DB_PASSWORD' NOSUPERUSER NOCREATEDB NOCREATEROLE;
  END IF;
END
\$\$;
GRANT CONNECT ON DATABASE "$POSTGRES_DB" TO newinvest_app;
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
# откажется от дефолтного ADMIN_PASSWORD (аудит 2026-11-14).
echo "[api] сид админа..."
DATABASE_URL="$MIGRATE_URL" npm run seed -w @newinvest/api

echo "[api] старт сервера :4000 (роль newinvest_app, без SUPERUSER)"
cd /app
export DATABASE_URL="postgres://newinvest_app:$APP_DB_PASSWORD@127.0.0.1:5432/$POSTGRES_DB"
unset PGPASSWORD   # супер-пароль рантайму не нужен и в env сервера не попадает
exec npx tsx apps/api/src/index.ts
```

Замечания:
- Пароль `newinvest_app` — фиксированный, из `infra/.env` (`APP_DB_PASSWORD`);
  api.sh падает на старте, если он не задан (fail fast, принцип «нет дефолтных
  секретов»). В env процесса сервера попадает только роль newinvest_app,
  супер-пароль из env удаляется (`unset PGPASSWORD`).
- `ALTER DEFAULT PRIVILEGES` без `FOR ROLE` применяется к объектам, создаваемых
  текущей ролью (superuser на фазе миграций) — новые таблицы из будущих миграций
  получат grants автоматически.
- ⚠️ Существующие таблицы: `GRANT ... ON ALL TABLES` покрывает текущий набор
  (включая будущие после каждого старта — скрипт идемпотентен и повторяется).

## Изменение 2. `infra/supervisord.conf`

`[program:api]` и `[program:caddy]` — добавить `user=app`. `postgres` остаётся
root-программой (сама делает `su postgres`, как сейчас). supervisord остаётся
root — это приёмлемо (он только порождает процессы).

```ini
[program:api]
command=/usr/local/bin/api.sh
user=app
priority=20
autorestart=true
...

[program:caddy]
command=/usr/local/bin/caddy run --config /etc/caddy/Caddyfile --adapter caddyfile
user=app
priority=30
autorestart=true
...
```

## Изменение 3. `infra/docker/Dockerfile.all`

```dockerfile
# после установки Caddy:
RUN apt-get update && apt-get install -y --no-install-recommends libcap2-bin \
  && setcap 'cap_net_bind_service=+ep' /usr/local/bin/caddy \
  && rm -rf /var/lib/apt/lists/*
# ^ Caddy под user=app сможет слушать 80/443 (capability на бинарнике)

# непривилегированный пользователь для api/caddy
RUN useradd --system --create-home --shell /usr/sbin/nologin app \
  && mkdir -p /home/app/.local/share \
  && chown -R app:app /home/app
ENV XDG_DATA_HOME=/home/app/.local/share
# Caddy хранит PKI в $XDG_DATA_HOME/caddy → /home/app/.local/share/caddy

# uploads принадлежит app (volume при первом создании унаследует владельца)
RUN mkdir -p /app/uploads && chown -R app:app /app/uploads
```

`CMD ["supervisord", ...]` — без изменений (root).

## Изменение 4. `infra/docker-compose.all.yml` — volume Caddy

```yaml
      - caddy_data:/home/app/.local/share/caddy   # было /root/.local/share/caddy
```

⚠️ **Ломающий момент для стенда:** в существующем volume `infra_caddy_data`
PKI лежит по старому пути. Перед переключением: `docker cp` (или tar) содержимого
`/root/.local/share/caddy` в новый путь volume'а, иначе корень CA сменится и
доверенный сертификат в Windows придётся установить заново (`install-cert.ps1`).
Команда миграции PKI — в чек-листе ниже.

Также в `infra/.env` добавляется `APP_DB_PASSWORD=<сильный пароль, ≠ POSTGRES_PASSWORD>`
— без него api.sh не стартует (fail fast).

## Изменение 5. `infra/docker/Dockerfile.api` (серверный многоконтейнерный стек)

```dockerfile
# после COPY — API под непривилегированным пользователем node (есть в образе):
RUN mkdir -p /app/uploads && chown -R node:node /app/uploads
USER node
```

compose `docker-compose.yml` (серверный): секреты уже вынесены; DATABASE_URL там
по-прежнему superuser-роль — при желании тот же приём api.sh применим позже,
для стенда (моноконтейнер) это закрыто изменением 1.

## Чек-лист maintenance-окна (стенда)

1. Бэкап: `docker exec investicionno-all pg_dump -U newinvest newinvest | gzip > backup.sql.gz`
   и `docker run --rm -v infra_caddy_data:/data -v $PWD:/out alpine tar czf /out/caddy-data.tgz -C /data .`
2. Остановка: `docker-compose -f infra/docker-compose.all.yml down`
3. Миграция PKI volume (одноразово):
   `docker run --rm -v infra_caddy_data:/data alpine sh -c "mkdir -p /data/home/app/.local/share/caddy && cp -a /data/root/.local/share/caddy/. /data/home/app/.local/share/caddy/ 2>/dev/null || true"`
   (путь внутри volume зависит от реальной структуры — проверить `docker run --rm -v infra_caddy_data:/data alpine ls -R /data | head`)
4. `git pull`, `docker-compose -f infra/docker-compose.all.yml --env-file infra/.env up -d --build`
5. Проверки: `supervisorctl status` (api/caddy — app), `ps aux | grep -E 'tsx|caddy'`
   (не root), API живёт (`curl /api/health`), вход в админку, публикация/правка
   статьи (DML под newinvest_app), выгрузка `/api/users/export.csv` (супер-админ).
6. Отрицательная проверка роли: `docker exec investicionno-all psql -h 127.0.0.1 -U newinvest_app -d newinvest -c 'CREATE TABLE x()'` → **должна отказать** permission denied.
7. Если HTTPS-доверие сломалось — `install-cert.ps1` заново (корень CA).

## Откат

`git revert` коммита + `down`/`up` без пересборки образа откатывают код, но не
переносят PKI обратно — для полного отката вернуть volume-маппинг и при
необходимости восстановить caddy_data из tar (шаг 1).

## Риски и принятые решения

- **supervisord остаётся root** — стандартная практика; его задача — порождение
  процессов. Поверхность минимальна (не принимает сетевой ввод).
- **Caddy под app через setcap** — capability на конкретном бинарнике; риск утечки
  cap в дочерние процессы Caddy принимаем (их нет).
- **Пароль newinvest_app** — фиксированный из `infra/.env` (решенное на ревью
  решение): предсказуемость при отладке, единообразие с остальными секретами.
  Обязателен — api.sh не стартует без него.
- **Серверный compose** — роль БД там остаётся superuser до отдельного решения
  (изменение 5 покрывает только OS-уровень). Зафиксировано как известный остаток.
