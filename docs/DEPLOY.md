# Деплой Инвестиционно.рф в Docker

> Целевая схема: один сервер (VPS), Docker Compose. PostgreSQL 17 + pgvector внутри compose, приложения — контейнерами, TLS — Caddy (автоматические сертификаты).

## 1. Что деплоим

| Сервис | Образ | Назначение |
|---|---|---|
| `db` | `pgvector/pgvector:pg17` | PostgreSQL 17 + расширение vector (эмбеддинги, HNSW-индексы) |
| `api` | build: `infra/docker/Dockerfile.api` | Express API :4000 (auth, контент, поиск, дайджесты, TG-пolling) |
| `web` | build: `infra/docker/Dockerfile.web` | Сайт (vite build → nginx) |
| `admin` | build: `infra/docker/Dockerfile.admin` | Админка (vite build → nginx, поддомен admin.*) |
| `caddy` | `caddy:2` | TLS + прокси: сайт на основном домене, админка на поддомене, `/api` и `/uploads` — на api |

Домены (punycode): `xn--b1aghca0aeahc1am7c.xn--p1ai` = `инвестиционно.рф`, `admin.xn--b1aghca0aeahc1am7c.xn--p1ai`.

## 2. Требования

- VPS: минимум 2 CPU / 4 ГБ RAM / 30 ГБ диск (как у PULSE: 4 CPU / 6 ГБ — с запасом на pgvector);
- Docker Engine ≥ 24 + plugin `docker compose`;
- DNS-записи: `A`-записи основного домена и `admin.` → IP сервера (для TLS Caddy должен резолвить домены);
- открытые порты 80/443 (Caddy сам получает и продлевает сертификаты).

## 3. Первичная настройка на сервере

```bash
# 1. Клон репозитория
git clone https://github.com/vladfa2010/newinvesticionno.git /opt/newinvest
cd /opt/newinvest

# 2. Переменные окружения (обязательные помечены ?)
cp infra/.env.example infra/.env
nano infra/.env
```

Минимальный `infra/.env`:

```bash
POSTGRES_PASSWORD=<сильный-пароль>   # обязательно
JWT_SECRET=<длинная-случайная-строка> # обязательно: openssl rand -hex 32
# опционально (можно задать позже в админке /kimi и не светить в env):
MOONSHOT_API_KEY=
RESEND_API_KEY=
RESEND_FROM=digest@инвестиционно.рф
TG_BOT_TOKEN=
TG_BOT_USERNAME=
CORS_ORIGINS=https://инвестиционно.рф,https://admin.инвестиционно.рф
PUBLIC_SITE_URL=https://инвестиционно.рф
```

> Ключи Moonshot/Resend/TG **рекомендуется задавать в админке** (`/kimi` + env для почты/TG) — они хранятся в БД и меняются без пересборки контейнеров. Env — только fallback.

## 4. Запуск

```bash
cd /opt/newinvest/infra
docker compose up -d --build

# логи
docker compose logs -f api     # миграции отработают при первом старте
docker compose ps
```

При первом старте контейнер `api` автоматически выполняет `npm run migrate -w @newinvest/db` (миграции 0000–0013 идемпотентны), затем поднимает сервер и cron-дайджесты (20:00 ежедневно, вс 20:00 недельный).

### 4.1 Супер-админ

```bash
docker compose exec api npx tsx apps/api/src/seed.ts
# → admin@local.dev / admin123 (сменить пароль сразу после входа)
```

### 4.2 Контент (миграция с донора, опционально)

Если переносим контент WordPress-донора на прод:

```bash
# на машине, где доступен донор (или временно прописать его в сеть compose):
docker compose exec api npx tsx packages/db/src/migrate-wp.ts
# ~30 с: 306 статей + граф (компании/тикеры/индустрии/тренды) + связи
```

Если БД переносится дампом с локальной машины — см. раздел 6 (бэкапы): `pg_dump` → `pg_restore`, миграции применять не нужно (дамп уже с актуальной схемой).

## 5. Векторный контур в базе (pgvector)

Поиск гибридный: **FTS** (колонка `articles.search_tsv`, russian-стемминг, GIN — создаётся миграцией 0012 автоматически) + **векторный** (таблица `article_embeddings`, HNSW-индекс). Полнотекст работает сразу после миграций; векторный требует бэкфилла эмбеддингов.

```bash
# 1. Задать ключ и модель в админке: https://admin.инвестиционно.рф/kimi
#    (модель должна возвращать 1024-мерные вектора под колонку vector(1024))

# 2. Бэкфилл — один раз (батчи по 20, идемпотентно):
docker compose exec api \
  npx tsx packages/db/src/embed.ts
# вывод: «К пересчёту: 306 статей … Готово ✓»

# 3. Проверка: после бэкфилла поисковые ответы содержат "mode":"hybrid"
curl -s "https://инвестиционно.рф/api/search?q=%D1%80%D0%BE%D0%B1%D0%BE%D1%82%D1%8B&limit=2" | python3 -c "import json,sys; print(json.load(sys.stdin)['mode'])"
```

Пересчёт всех эмбеддингов (смена модели): `npx tsx packages/db/src/embed.ts --force`.
Инкрементальный пересчёт новых статей: тот же скрипт без флага (пересчитывает только записи без эмбеддинга).

> **Важно:** эмбеддинги считаются на стороне API-контейнера и пишутся напрямую в `db` — отдельного воркера не нужно. Объём: 306 статей × 1024 float4 ≈ 2.5 МБ + HNSW-индекс — копейки для pgvector.

## 6. Бэкапы базы

```bash
# ежедневный дамп (cron на хосте, 04:17 — вне часов дайджестов)
17 4 * * * cd /opt/newinvest/infra && docker compose exec -T db \
  pg_dump -U newinvest -Fc newinvest > /backups/newinvest-$(date +\%F).dump 2>/dev/null

# ротация: хранить 14 последних
find /backups -name 'newinvest-*.dump' -mtime +14 -delete

# восстановление:
docker compose exec -T db pg_restore -U newinvest -d newinvest --clean < /backups/newinvest-ДАТА.dump
```

Также бэкапить том `uploads` (обложки): `tar czf /backups/uploads-$(date +%F).tar.gz -C /var/lib/docker/volumes/newinvest_uploads/_data .`

## 7. Обновление релиза

```bash
cd /opt/newinvest
git pull
cd infra
docker compose up -d --build        # пересборка изменённых образов
docker compose exec api npm run migrate -w @newinvest/db   # миграции (если были)
```

Сборка занимает ~3–5 мин (vite build web+admin). API пересобирается только при изменении его слоёв.

## 8. Мониторинг и эксплуатация

```bash
docker compose ps                        # здоровье сервисов
docker compose logs -f api               # ошибки, cron-дайджесты, TG-polling
docker compose restart api               # перезапуск (сбрасывает in-memory rate-limit)
docker stats                             # память: pgvector + node ≈ 1.5–2.5 ГБ при 300+ статей
```

Что смотреть в логах API:
- `[cron] daily digest: {sent: N}` — дайджесты уходят;
- `[notifications] RESEND_API_KEY не задан` — задать ключ в env или в админке;
- `[search] vector search failed, FTS only` — нет эмбеддингов или ключа, см. раздел 5.

## 9. Частые проблемы

| Симптом | Причина | Решение |
|---|---|---|
| Caddy не получает сертификат | DNS не указывает на сервер / порты закрыты | проверить `dig +short инвестиционно.рф`, открыть 80/443 |
| `admin.…` 502 | админ-контейнер не поднялся | `docker compose logs admin` — обычно ошибка билда; пересобрать |
| Поиск только `mode":"fts"` | нет эмбеддингов или ключа | раздел 5: ключ в /kimi → `embed.ts` |
| Письма не уходят | нет RESEND_API_KEY | задать в env + `docker compose up -d` (env читается при старте) |
| 403 на все запросы с сайта | CORS | в env `CORS_ORIGINS` добавить точный origin сайта |
| Картинки 404 после переезда | `uploads` не перенесён | скопировать каталог uploads/ или восстановить из бэкапа тома |

## 10. Структура файлов

```
infra/
├── docker-compose.yml      # сервисы: db(api+pgvector), api, web, admin, caddy
├── Caddyfile               # TLS + прокси (основной домен + admin-поддомен)
├── .env.example            # обязательные и опциональные переменные
└── docker/
    ├── Dockerfile.api      # node:20-slim + tsx (миграции при старте)
    ├── Dockerfile.web      # vite build → nginx
    ├── Dockerfile.admin    # vite build → nginx
    └── nginx.spa.conf      # SPA-fallback для React Router
```
