# Тестирование

Реестр тестовых сьютов проекта: состав, запуск, требования, покрытие.
Обновлён 2026-11-25 аудитом трёх агентов (актуальность сверена с кодом API).

## Сводка

| Сьют | Тип | Объём | Запуск | Требования |
|---|---|---|---|---|
| `apps/api/test/**` | unit (node:test) | **48 тестов**, 6 файлов | `npm test -w @newinvest/api` | нет (без БД/сети) |
| `scripts/e2e.sh` | E2E (bash+curl+psql) | **356 проверок** (~372 PASS за прогон) | `API_URL=http://localhost:1003 WEB_URL=http://localhost:1001 bash scripts/e2e.sh` | поднятый стек + **чистая тестовая БД** + psql-доступ |
| `scripts/auth-smoke.mjs` | смоук JWT | 5 проверок | `JWT_SECRET=<секрет> node scripts/auth-smoke.mjs http://localhost:1003` | живой API + сид-данные (id=1 super_admin, id=6 reader) |
| `scripts/tz43-smoke.mjs` | смоук ТЗ 4.2/4.3 | 9 проверок | `JWT_SECRET=… ADMIN_EMAIL=… ADMIN_PASSWORD=… RESET_CODE=… node scripts/tz43-smoke.mjs` | живой API, мутирует данные |
| `scripts/ai-slop-golden.mjs` | golden set | 5 кейсов | `node scripts/ai-slop-golden.mjs` | живой API (mock-режим без ключей) |

**Красная линия:** E2E и смоуки мутируют данные (создают/удаляют пользователей,
контент, стирают файлы). Прогонять ТОЛЬКО против локального/тестового контура.
Против прод-сервера (VDS) — запрещено. E2E умеет чистить свои артефакты
(стартовая и финальная очистка по паттернам `e2e%`), но требует чистой БД
для детерминированных цифр.

## Unit — `apps/api/test/**`

Чистые функции без БД/сети. Запуск секунды, гоняется на каждое изменение API.

| Файл | Что покрывает |
|---|---|
| `seo.test.ts` (15) | bot-render/sitemap: экранирование html/xml, UA-детект (botClass, yandex*→yandex), защита JSON-LD от инъекций, контракт BreadcrumbList ТЗ-01, buildSitemapXml, normalizePath |
| `contentMaster.test.ts` | stripDsml, extractFirstJson — парсинг ответов LLM (баги 2026-11-17: DSML-вызовы, жадный регексп; edge: незакрытый JSON, экранированные кавычки) |
| `slug.test.ts` | slugify (транслитерация в стиле донора, лимит 80), plainTextToHtml (XSS-защита пользовательского текста) |
| `imageSniff.test.ts` | sniffImageFormat/mimeFor/extFor — формат по магическим байтам (аудит 2026-11-14); SVG как active content → null |
| `botRender.test.ts` | siteOrigin — защита от host-header poisoning |
| `htmlDates.test.ts` | toW3CDate (pg возвращает timestamp строкой), formatRuDate (по UTC) |

Аналогичные юниты логики БД живут рядом с кодом: `packages/db/src/*.test.ts`
(text-utils, breadcrumbs — npm test из packages/db).

Не покрыто (рекомендации): optimizeImage (зависит от sharp — интеграционный
уровень), парсинг ответов LLM в textGen/mediaGen, digest/телеметрия (код с БД).
Ad-hoc скрипты `extract-test.mts`, `dsml-test.mts`, `opt-test.mjs` в корне
apps/api продублированы постоянными юнитами — кандидаты на удаление.

## E2E — `scripts/e2e.sh`

Полная регрессия API: auth, админка, юзер-сценарии, поиск, безопасность,
медиатека, ContentMaster (включая SSE-стриминг), телеметрия, метрики, тарифы.
356 проверок (~315 было до аудита 2026-11-25; +57: удаление контента 25,
обложка/медиатека 10, фазы 4, ai-slop 5, refresh 3, slug-exists 4, докрутка
лайков 5, лимитер регистрации).

Запуск:
```bash
docker compose -f infra/docker-compose.yml -f infra/docker-compose.local.yml up -d --build
# API :1003, сайт :1001; сид admin@local.dev / admin123
API_URL=http://localhost:1003 WEB_URL=http://localhost:1001 bash scripts/e2e.sh
```

Особенности:
- две pacing-паузы по 60 с (окна rate-limit 300/60 с); полный прогон ~5–7 мин;
- LLM-вызовы работают в mock без ключей; при наличии DEEPSEEK/MOONSHOT ключей
  в env возможны реальные вызовы;
- `REGISTER_LIMIT` в env API поднять (≥25/час) для стабильных повторных
  прогонов — иначе упор в бакет /register (сьют переживает, но регистрации 429);
- финальная psql-очистка артефактов (`e2e%`, `tz43%`, `reglimit-%`).

## Смоуки

**auth-smoke.mjs** — контракт JWT (аудит 2026-11-14/15): подделанный super_admin
в payload для reader → 403 (права из БД, не из токена), чужой audience → 401
(iss/aud invest-api/invest-spa, alg pinning HS256), пейволл по тарифу из БД.
Зависит от сид-данных (id=1, id=6) — при смене сида обновить скрипт.

**tz43-smoke.mjs** — ТЗ 4.2/4.3 (восстановлен 2026-11-25, файл утрачен,
документация ссылалась на него): forgot → verify → reset, повторный resetToken
→ 401 (password_changed_at), старая сессия → 401, сессионный JWT без
purpose=password_reset → 401, аудит-запись users.patch в admin_audit_log,
audit-log не-супер-админа → 403. Мутирует данные (создаёт/меняет юзера).

**ai-slop-golden.mjs** — 5 эталонных кейсов аудита ИИ-штампов
(`POST /api/admin/ai-slop`): score, text_too_short, duplicated_passage, fix-режим.

## Что где задокументировано

- реестр механик и история покрытия — `docs/newinvesticionno.md` (§6.6, журнал,
  строки «E2E N/N» в записях фич);
- безопасностные смоуки — `docs/security.md` (разделы находок);
- план приёмочных испытаний сторонним пентестом — `docs/pentest-prep-2026-11.md`
  (требует staging-стенд: поднять из main с тестовым набором данных).
