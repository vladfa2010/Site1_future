# Деплой

## Локально на Windows — моноконтейнер (текущий рабочий стек)

Весь стек живёт в **одном контейнере** `investicionno-all` (PostgreSQL+pgvector, API,
Caddy со статикой сайта и админки, supervisord внутри). Лимиты контейнера:
**1 CPU, 3 ГБ ОЗУ**. Ничего на внешний сервер не публикуется — это локальная копия.

**Запуск/пересборка:**
```bash
docker-compose -f infra/docker-compose.all.yml up -d --build   # старт/пересоздание
docker-compose -f infra/docker-compose.all.yml down            # стоп
docker exec investicionno-all supervisorctl status             # postgres / api / caddy
docker exec investicionno-all supervisorctl restart api        # перезапуск сервиса внутри
docker-compose -f infra/docker-compose.all.yml logs -f         # логи
```

**Адреса:** сайт `https://инвестиционно.рф`, админка `https://admin.инвестиционно.рф`
(punycode `xn--b1aghca0aeahc1am7c.xn--p1ai`). HTTPS — Caddy с `tls internal`;
корневой CA (`caddy-root.crt`) один раз установлен в доверенные Windows
(`install-cert.ps1`), PKI хранится на volume `infra_caddy_data`, пересборки доверие не ломают.

**hosts.** Оба домена должны смотреть на машину, где крутится Docker. Важно: если
`127.0.0.1:80/443` уже занят другим локальным проектом (например, старым WordPress —
слушает как отдельная привязка `wslrelay` и выигрывает у `0.0.0.0` Docker) или
включён системный прокси — домен надо вести на **LAN-IP машины** и добавить в
исключения прокси:
```
192.168.2.228 xn--b1aghca0aeahc1am7c.xn--p1ai
192.168.2.228 admin.xn--b1aghca0aeahc1am7c.xn--p1ai
```
(192.168.2.228 — адрес, выданный роутером; после смены IP обновить hosts.)
Прокси: `HKCU:\...\Internet Settings → ProxyOverride` дописать оба домена, иначе
браузер пойдёт через прокси наружу и откроет реальный сайт.

**Доступ внутрь:**
```bash
docker exec investicionno-all psql -h 127.0.0.1 -U newinvest -d newinvest -c "..."  # БД
docker exec investicionno-all ls /app/uploads                                        # медиа
```
API внутри контейнера на `127.0.0.1:4000` (env `PORT=4000`), снаружи только через Caddy.

**Контент из бэкапа прода:** БД — дампом (`psql < dump.sql`, рабочая БД `newinvest`),
медиа — архивом `uploads/*.tar.gz` в `/app/uploads`. Файлы WP из `wp-content`
раздаёт блок `handle /wp-content/*` в `infra/docker/Caddyfile.all` из `/app/uploads`.

**Ссылки между сайтом и админкой:** при сборке задаются `VITE_ADMIN_URL` /
`VITE_SITE_URL` (домены выше), dev-фолбэки — `http://localhost:1001/1002`.

**Вход в админку.** Токены админов (admin/super_admin) живут **12 часов** (у обычных
ролей — 7 дней): по истечении API отвечает `401 {"error":"unauthorized"}` — просто
войдите заново. Супер-админ создаётся сидом (`ADMIN_EMAIL`/`ADMIN_PASSWORD` в compose,
в текущем стенде `admin@local` / `admin123`; дополнительных пользователей — в админке,
раздел «Пользователи»).

**Ключи LLM (ContentMaster, генерация текстов).** В коде ключей нет и быть не должно.
Порядок применения настроек: **БД → env**. Хранилище — таблица `meta_fields`
(`owner_type='app'`, ключи `deepseek_api_key`, `kimi_api_key`, `llm_provider`,
`deepseek_model` и т.д.). Добавить ключ: админка → «Настройки Kimi» → вставить ключ →
сохранить (переживает пересборки). Альтернатива — env `DEEPSEEK_API_KEY` /
`MOONSHOT_API_KEY` в compose-файле или `apps/api/.env` (fallback, если БД пустая).
Без ключа ContentMaster падает на вызовах LLM; каталог моделей DeepSeek — `deepseek-flash`,
`deepseek-v4-pro` (`deepseek-chat`/`deepseek-reasoner` — устаревшие алиасы).

**Dev-режим (без Docker):** фиксированная тройка портов — сайт `:1001`, админка `:1002`,
API `:1003` (`strictPort` в vite-конфигах, не перескакивает). В Docker это не действует.

---

## Многоконтейнерный стек (compose.yml + local/limits)

Быстрый старт с git: клонируем репозиторий и поднимаем полный стек
(PostgreSQL+pgvector, API, сайт, админка, Caddy) в Docker.

## Локально (Mac/Linux) за 5 минут

**1. Установить Docker-рантайм** (если ещё нет) — любой из:
- **OrbStack** (рекомендуется для Mac, лёгкий): `brew install --cask orbstack`
- Docker Desktop: `brew install --cask docker`
- Colima (CLI): `brew install colima docker && colima start`

**2. Клонировать и запустить:**

```bash
git clone https://github.com/vladfa2010/Site1_future.git investicionno
cd investicionno
docker compose -f infra/docker-compose.yml -f infra/docker-compose.local.yml up -d --build
```

Первая сборка — несколько минут (npm ci для трёх образов). Поднимается на порту 80.

**3. Привязать адрес** — прописать домен в `/etc/hosts`:

```
127.0.0.1 xn--b1aghca0aeahc1am7c.xn--p1ai admin.xn--b1aghca0aeahc1am7c.xn--p1ai
```

(это punycode для `инвестиционно.рф` / `admin.инвестиционно.рф`; браузер с одинаковым
успехом открывает и кириллический адрес)

**4. Открыть:**
- Сайт: http://инвестиционно.рф
- Админка: http://admin.инвестиционно.рф — логин `admin@local`, пароль `admin123`
  (задаётся в `infra/docker-compose.local.yml`, сидится при первом старте)

**Ключи LLM** (опционально): перед `up` экспортировать `MOONSHOT_API_KEY` /
`DEEPSEEK_API_KEY` — или ввести позже в админке (Настройки → LLM), хранится в БД.

**Контент:** свежая БД стартует пустой (миграции 0001–0017 накатываются сами,
сидится только супер-админ). Наполнение — через админку или бэкапом:

```bash
docker compose -f infra/docker-compose.yml -f infra/docker-compose.local.yml exec db \
  pg_dump -U newinvest newinvest > backup.sql        # снять бэкап
cat backup.sql | docker compose -f infra/docker-compose.yml -f infra/docker-compose.local.yml exec -T db \
  psql -U newinvest newinvest                        # залить бэкап
```

**Остановка/очистка:**
```bash
docker compose -f infra/docker-compose.yml -f infra/docker-compose.local.yml down          # стоп
docker compose -f infra/docker-compose.yml -f infra/docker-compose.local.yml down -v       # стоп + удалить БД и uploads
```

## Сервер (прод)

1. Docker + плагин compose на сервере.
2. `git clone` репозитория, в `infra/` создать `.env` (рядом с docker-compose.yml):
   ```
   POSTGRES_USER=newinvest
   POSTGRES_PASSWORD=<сильный пароль>
   JWT_SECRET=<сильный секрет>
   PUBLIC_SITE_URL=https://xn--b1aghca0aeahc1am7c.xn--p1ai
   MOONSHOT_API_KEY=<опционально>
   DEEPSEEK_API_KEY=<опционально>
   RESEND_API_KEY=<опционально, письма>
   TG_BOT_TOKEN=<опционально, Telegram-бот>
   ```
3. DNS: A-записи `инвестиционно.рф` и `admin.инвестиционно.рф` → IP сервера
   (Caddy сам получит TLS Let's Encrypt — порты 80/443 открыты).
4. `docker compose -f infra/docker-compose.yml up -d --build`
5. HTTPS-версии: https://инвестиционно.рф и https://admin.инвестиционно.рф

Отличия прод-композа от локального: TLS в `infra/Caddyfile`, секреты из `.env`,
`CORS_ORIGINS` указывает на https-домены.

## Что внутри стека

| Сервис | Образ/сборка | Роль |
|---|---|---|
| db | pgvector/pgvector:pg17 | PostgreSQL + векторный поиск (модуль embeddings) |
| api | infra/docker/Dockerfile.api | Express API :1003, миграции при старте, сид админа |
| web | infra/docker/Dockerfile.web | Сайт: vite build → nginx |
| admin | infra/docker/Dockerfile.admin | Админка: vite build → nginx (поддомен admin.) |
| caddy | caddy:2 | TLS (прод) / HTTP (локально), /api и /uploads → api, бот-детект → SSR-рендер |
