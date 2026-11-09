# Деплой

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
