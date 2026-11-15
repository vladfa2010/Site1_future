# ТЗ: деплой пакета безопасности 2026-11-14/15

Статус: утверждено к выполнению 2026-11-15.
Состав пакета: коммиты `6571f301`…`88f0c5a0` (ветка main). Охват: все находки
аудита 2026-11-14, пакет hardening, ТЗ 4.1–4.4 и задача 3 (контейнер без root).
Контекст: [security.md](security.md), [tz-security-hardening.md](tz-security-hardening.md),
[DEPLOY.md](../DEPLOY.md), черновик [draft-task3-rootless.md](draft-task3-rootless.md).

## Общие положения

1. **Два контура независимы**: VDS (прод, `infra/docker-compose.yml`) и стенд
   (Windows, `infra/docker-compose.all.yml`). Каждый деплоится своим окном, своим
   порядком. Ничего общего, кроме git-репозитория, у окон нет.
2. **Порядок окон**: сначала VDS (это основной публичный контур), стенд — после,
   когда будет 15 минут на maintenance по чек-листу раздела 3.
3. **Принцип fail fast теперь обязателен**: отсутствие или слабый секрет останавливает
   запуск, а не даёт подняться стеку с дырами. Любой «не поднимается» после обновления
   — в первую очередь смотреть секреты и логи, а не откатываться.
4. Откат на каждом шаге: `git revert <коммит>` + пересборка. Данные, созданные
   новым кодом (миграции 0020/0021, аудит-лог), обратной совместимости с кодом
   до пакета НЕ ломают — откат кода без отката миграций безопасен.

## Раздел 0. Предусловия (оба контура)

- Доступ к репозиторию с правами pull на целевой машине.
- Сохранён рабочий способ подключения к машине на случай проблем (SSH/rdp не через
  деплоимые сервисы).
- Известны актуальные команды бэкапа целевого контура (ниже — шаблоны).

---

## Раздел 1. VDS (прод): деплой пакета

Целевой коммит: `main` после `88f0c5a0`. Окно: любое, простой не обязателен
(пересборка занимает минуты; недоступность — на это время).

### 1.1 Бэкап (обязателен)

```bash
# на VDS, из корня репо:
docker compose -f infra/docker-compose.yml exec -T db \
  pg_dump -U newinvest newinvest | gzip > "backup-$(date +%F-%H%M).sql.gz"
tar czf "uploads-$(date +%F-%H%M).tgz" -C <каталог uploads хоста> .
# проверить, что архивы не пустые и даты свежие
```

### 1.2 Проверка секретов (критично — fail fast)

```bash
grep -E '^(JWT_SECRET|POSTGRES_PASSWORD)=' infra/.env
```

- `JWT_SECRET` **обязан быть ≥ 32 символов** — иначе API не стартует (guard
  `config.ts`). Если короче: придумать новый (`openssl rand -base64 48`), вписать
  в `infra/.env`. Последствие — разлогин всех пользователей, это и так случится (п. 1.5).
- `POSTGRES_PASSWORD` задан и не дефолтный (`newinvest-local` запрещён — guard
  отвергнет запуск postgres-зависимых проверок; см. DEPLOY.md).

### 1.3 Деплой

```bash
git pull
docker compose -f infra/docker-compose.yml up -d --build
docker compose -f infra/docker-compose.yml logs -f api   # смотреть до чистого "API: http://..."
```

В логах api ожидается: миграции 0020 и 0021 применены без ошибок, строка
`API: http://localhost:1003`. Ошибки миграций — стоп, разбор, не продолжать.

### 1.4 Вычистка SVG из uploads (на VDS)

```bash
docker compose -f infra/docker-compose.yml exec -T -e UPLOAD_DIR=/app/uploads api \
  npx tsx scripts/clean-svg-covers.mjs          # сначала dry-run
docker compose -f infra/docker-compose.yml exec -T -e UPLOAD_DIR=/app/uploads api \
  npx tsx scripts/clean-svg-covers.mjs --apply  # затем применить
```

Ожидание: «SVG осталось в media: 0». Если SVG нет вовсе — скрипт честно отрапортует нули.

### 1.5 Постпроверки VDS (чек-лист приёмки)

| # | Проверка | Ожидание |
|---|---|---|
| 1 | `curl -s https://<домен>/api/health` | 200 |
| 2 | Логин на сайте | работает; **все пользователи разлогинены** (iss/aud) — разово |
| 3 | Админка: вход, открытие статьи, сохранение | работает |
| 4 | `curl -s https://<домен>/sitemap.xml \| head` | валидный XML, лок в PUBLIC_SITE_URL |
| 5 | Консоль браузера на сайте и админке | нет ошибок CSP (новые заголовки) |
| 6 | `curl -sI https://<домен> \| grep -iE 'strict-transport|content-security'` | оба заголовка присутствуют |
| 7 | Аноним: `curl https://<домен>/api/users/export.csv` | 401 |
| 8 | Быстрый негатив API: регистрация с паролем из 40 русских букв | 400 (лимит 72 байт) |

### 1.6 Известные одноразовые эффекты VDS

- Все сессии инвалидированы (iss/aud) — пользователи перелогинятся. Сообщить, если
  есть активная аудитория.
- HSTS включён — браузеры запомнят HTTPS-only для домена; это необратимо для
  клиентов на период max-age, откат заголовка его не отменит.
- Аудит-лог пуст — заполняется с момента деплоя.

### 1.7 Откат VDS

```bash
git revert <коммит пакета>   # или git reset --hard <предыдущий тег/коммит> на крайний случай
docker compose -f infra/docker-compose.yml up -d --build
```

Миграции 0020/0021 совместимы со старым кодом (новые колонка/таблица не мешают).

---

## Раздел 2. Стенд (Windows, моноконтейнер): maintenance-окно

Целевой коммит: тот же `main`. Окно: ~15 минут простоя + время пересборки.
Обязательное чтение перед окном: [draft-task3-rootless.md](draft-task3-rootless.md)
(архитектура, риски, откат). Ниже — исполняемый чек-лист.

### 2.1 Подготовка (до окна, без простоя)

1. `infra/.env` дополнить **четырьмя** обязательными секретами (если ещё нет):
   `POSTGRES_PASSWORD`, `ADMIN_PASSWORD`, `JWT_SECRET` (≥ 32 символов),
   `APP_DB_PASSWORD` (сильный, отличный от POSTGRES_PASSWORD).
2. `BIND_ADDR`: по умолчанию `127.0.0.1`. Если стенд нужен по LAN-IP
   (wslrelay/прокси-сценарий из DEPLOY.md) — `BIND_ADDR=192.168.2.228`.
3. Убедиться, что свежий `git pull` выполним без конфликтов.

### 2.2 Окно: бэкап

```powershell
# БД и uploads из контейнера:
docker exec investicionno-all pg_dump -U newinvest newinvest | gzip > backup-%DATE%.sql.gz
docker run --rm -v infra_uploads:/data -v ${PWD}:/out alpine tar czf /out/uploads-%DATE%.tgz -C /data .
# PKI Caddy (важно — путь переезжает):
docker run --rm -v infra_caddy_data:/data -v ${PWD}:/out alpine tar czf /out/caddy-data-%DATE%.tgz -C /data .
```

### 2.3 Окно: миграция PKI внутри volume (одноразово)

```powershell
docker run --rm -v infra_caddy_data:/data alpine sh -c "mkdir -p /data/home/app/.local/share/caddy && cp -a /data/root/.local/share/caddy/. /data/home/app/.local/share/caddy/ 2>/dev/null || true"
```

(если `ls` volume'а покажет иную структуру — скорректировать пути; цель: содержимое
старого `/root/.local/share/caddy` оказалось в `/home/app/.local/share/caddy`.)

### 2.4 Окно: пересборка

```powershell
docker-compose -f infra/docker-compose.all.yml down
git pull
docker-compose -f infra/docker-compose.all.yml --env-file infra/.env up -d --build
docker-compose -f infra/docker-compose.all.yml logs -f
```

### 2.5 Постпроверки стенда (приёмка окна)

| # | Проверка | Ожидание |
|---|---|---|
| 1 | `supervisorctl status` внутри контейнера | postgres/api/caddy — RUNNING |
| 2 | `ps aux` в контейнере: tsx и caddy | владелец `app`, НЕ root |
| 3 | Сайт и админка в браузере | открываются, HTTPS-доверие сохранилось |
| 4 | `docker exec investicionno-all psql -h 127.0.0.1 -U newinvest_app -d newinvest -c "CREATE TABLE x()"` | **permission denied** |
| 5 | Логин в админку, правка/публикация статьи | работает (DML под newinvest_app) |
| 6 | `docker exec investicionno-all npx tsx scripts/clean-svg-covers.mjs --apply` (UPLOAD_DIR=/app/uploads) | «SVG осталось: 0» |
| 7 | Если HTTPS-доверие сломалось | установить корень CA заново (`install-cert.ps1`) |

### 2.6 Откат стенда

`git revert` + `down`/`up` без пересборки откатывает код, но путь PKI в compose
останется новым — caddy_data из архива п. 2.2 восстанавливается поверх volume'а,
либо вернуть маппинг на старый путь коммитом-откатом. Процедура детально — в
черновике, раздел «Откат».

---

## Раздел 3. После обоих контуров

1. Записать в [security.md](security.md) даты фактических деплоев (VDS/стенд).
2. Удалить/заархивировать черновик `draft-task3-rootless.md` (задача 3 внедрена).
3. Сверить `npm audit` на свежем lockfile: high/critical = 0 (moderate у
   drizzle-kit/esbuild — приняты, dev-only).
4. Разослать/зафиксировать известное одноразовое: перелогин всех пользователей.

## Критерии успеха ТЗ в целом

- Оба контура на коммите ≥ `88f0c5a0`, постпроверки пройдены целиком.
- Негативные проверки (4.4 стенда, 1.7 VDS, чужой audience, повторный resetToken)
  подтверждены после деплоя, а не только на локальной копии.
- security.md содержит даты внедрения по обоим контурам.
