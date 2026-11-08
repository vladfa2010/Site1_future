# ТЗ-10. SEO/OG для SPA: бот-детект рендер + sitemap/robots (P0, блокер запуска)

Статус: черновик ТЗ → на реализацию.
Зависимости: ТЗ-01 (BreadcrumbList / JSON-LD — в бот-шаблоне должна повторяться та же разметка, что и в SPA).
Приоритет: **P0** — без этого шеринг в Telegram/VK даёт пустые карточки, а при переезде домена (300+ статей) SEO-позиции не сохраняются.

---

## 1. Цель

Обеспечить для поисковых и социальных ботов полноценный HTML каждой публичной страницы
(`<title>`, `meta description`, OG/Twitter Card-теги, JSON-LD, текст статьи),
не переписывая фронтенд: обычные пользователи по-прежнему получают React SPA.

## 2. Проблема

`apps/web` — React 19 SPA на Vite. `apps/web/index.html` — статичный скелет с
единым `<title>Инвестиционно.рф — Инвестиционно про будущее</title>` и одним
`meta description` для всех страниц. Весь контент подгружается клиентом после JS
(`GET /api/articles/:type/:slug` в `ArticlePage.tsx`).

Последствия:

1. **Соцпревью мертвы.** Telegram (`TelegramBot`), VK (`vkShare`), Twitter (`twitterbot`)
   фетчат URL без исполнения JS → карточка шеринга без заголовка, описания и обложки.
2. **SEO под риском при переезде.** Старый сайт (WordPress + Yoast, ~520 URL в sitemap,
   см. `docs/newinvesticionno.md`) отдавал поисковикам готовый HTML. Новый отдаёт пустой
   скелет — Googlebot/YandexBot при переезде увидят деградацию контент-эквивалентности
   по 300+ статьям, позиции просядут.
3. **JSON-LD из ТЗ-01 бесполезен без HTML.** `Breadcrumbs.tsx` отрисует разметку
   только в браузере; боты её не увидят.
4. **sitemap.xml/robots.txt не существуют** — в репозитории ни одного упоминания
   (проверено: `infra/`, `apps/`, `docs/`). Индексация нового домена стартует с нуля.

## 3. Варианты

### A. Полный SSR — переписать фронт на Next.js / Remix

- Плюсы: идеальный SEO/OG для всех, единый рендер, `next-sitemap` из коробки.
- Минусы: переписывание 17 страниц (`apps/web/src/pages/`), layout'ов, всех фетчей
  на серверные, `Dockerfile.web` (сейчас nginx static), dev/prod-прокси, auth-контекст.
  Оценка: 3–5 недель и регрессионные риски по всему фронту — **неприемлемо для P0-блокера**.
- Вердикт: **отклонено** (рассмотреть отдельно как стратегическую инициативу после запуска).

### B. Prerender/SSG — статический пререндер всех страниц

`vite-plugin-ssr`, `react-snap`, `puppeteer`-пререндер на этапе сборки или на стороне API.

- Плюсы: реальный React-рендер в HTML (контент 1:1 с SPA), статика кладётся рядом с SPA.
- Минусы: (а) нужен headless-браузер в CI/контейнере — тяжёлый образ и сборка;
  (б) статьи публикуются каждый день — нужен триггер перегенерации (вебхук из админки
  или cron) — лишний конвейер; (в) авторизация/пейволл-страницы при пререндере
  нестабильны (flash публичного контента до гидратации).
- Вердикт: **отложено** как возможный апгрейд после запуска.

### C. Бот-детект на API: серверный мини-рендер «на лету»

При User-Agent поисковых/соцботов на маршрутах контента отдавать готовый HTML из
лёгкого шаблона (title, description, OG, JSON-LD, первый абзац) с данными из БД.

- Плюсы: ноль изменений в `apps/web`; закрывает и соцпревью, и индексацию;
  решается 2–4 дня; шаблон рендерится в том же процессе `apps/api` (Express уже есть,
  Drizzle/БД уже подключены).
- Минусы: ботам не видна «интерактивная» часть страницы (графики, чипсы — не нужны);
  риск рассинхрона шаблона и SPA-версии (митигация — §9).
- Вердикт: **принято как база**.

## 4. Рекомендация: гибрид C + B

1. **(C) Бот-детект рендер** — новый Express-маршрут в `apps/api` + правило в Caddy
   (`header_regexp` по UA → rewrite на API). Закрывает соцпревью и индексацию статей,
   компаний, трендов, сюжетов.
2. **(B, ослабленный) Динамический sitemap.xml/robots.txt** — генерация из БД на API
   при каждом запросе с in-memory кэшем 15 мин (статикой не является, но по стоимости
   эквивалентна SSG-выдаче). Для ~520+ URL это тривиально.
3. Реальный пререндер всех страниц (полный B) — вынесен за рамки ТЗ; гибрид покрывает
   все приёмочные критерии.

## 5. Архитектура

```
Пользователь (Chrome UA)
  └─ Caddy :443 ── reverse_proxy ──► web:80 (nginx static, SPA)   ← как сейчас

Бот (Googlebot / YandexBot / TelegramBot / vkShare / twitterbot UA)
  └─ Caddy :443 ── header_regexp UA ── rewrite ──► api:4000/render?path=/novost/foo
       └─ Express: разбор path → выборка из БД → HTML-шаблон → 200 text/html

/sitemap.xml, /robots.txt
  └─ Caddy :443 ── reverse_proxy ──► api:4000 (динамическая генерация из БД)
```

Ключевое решение: **детект на уровне Caddy, рендер на API**. Почему не Express-
middleware на фронт-сервере: в проде фронт — это nginx static из `Dockerfile.web`,
node-там нет. Почему не статический пререндер в Caddy: генерация требует БД.
Caddy `header_regexp` + `rewrite` — штатный механизм, одно правило на сайт.

Локальный dev (`vite dev` на :5173): бот-детект не нужен, но для проверки
`/render` и `/sitemap.xml` доступны напрямую по `http://localhost:4000/...`
(маршруты реализуются в API независимо от Caddy).

## 6. Требования

### 6.1 Рендер для ботов (API)

- **Файлы:** новые `apps/api/src/routes/render.ts` (роутер), `apps/api/src/services/botRender.ts`
  (логика: классификация бота, сборка данных, шаблонизация, кэш),
  `apps/api/src/services/botUa.ts` (список UA-паттернов), `apps/api/src/utils/html.ts`
  (экранирование HTML).
- **Эндпоинт:** `GET /render?path=<url-path>` — внутренний (Caddy), но должен корректно
  отдавать 404 для неизвестных/непубличных путей и 403 для tariff/auth-материалов
  (честнее отдавать пейволл-страницу с метаданными статьи + пометкой; выбрать при
  реализации, зафиксировать здесь: **отдаём метаданные + excerpt, контент обрезаем
  до пейволла** — как в SPA).
- **Поддерживаемые пути** (зеркало роутов `apps/web/src/App.tsx`):
  - `/:type/:slug` — статьи, `type ∈ novost|sobytie|analitika|interesnoe|ideya|video`
    (см. `ARTICLE_TYPES` в `packages/db/src/schema.ts`), slug: `[a-z0-9-]+`
  - `/kompaniya/:slug`, `/trend/:slug`, `/syuzhet/:slug` — сущности
  - `/:type` — ленты рубрик; `/` — главная; `/o-nas|/zachem|/smysl|/missiya|/about...`
    — статические (title/description из админки/конфиг-таблицы, либо захардкоженный
    маппинг — проще второе, список в `App.tsx`)
  - всё остальное → 404 (боту не отдаём SPA-скелет с 200).
- **Данные статьи** (из `articles` + join `media` на `coverMediaId` + `metaFields`
  `meta_description` + автор из `users`): `title`, `excerpt`, `coverUrl` (привести
  к абсолютному URL через `PUBLIC_SITE_URL`), `publishedAt`, `author.name`,
  `meta_description`, первые ~300 слов текста, вычищенного от тегов
  (`contentHtml` → text).
- **Что в HTML:** `<!doctype html><html lang="ru"><head>` с `title`,
  `meta[name=description]`, полным набором `og:*` (`og:title`, `og:description`,
  `og:type=article`, `og:url`, `og:image`, `og:site_name`, `og:locale=ru_RU`) и
  `twitter:card=summary_large_image` (+ `twitter:title/description/image`),
  `<link rel="canonical">`, JSON-LD `NewsArticle` (headline, description, image,
  datePublished, author Person, publisher Organization) **и `BreadcrumbList`
  по образцу ТЗ-01** — копипаст структуры, источник правды один. В `<body>`:
  H1 с title, дата, автор, excerpt, первые N слов текста, ссылка «Читать на сайте»,
  `<noscript>`-заметка. Никакого JS.
- **UA-детект внутри API тоже**: эндпоинт `/render` принимает и отдаёт рендер любому,
  кто его вызвал, но на случай прямых обращений без Caddy маршрут не публикуем
  наружу (Caddy передаёт только rewrite'нутые запросы; дополнительно — проверка
  `X-Bot-Render: 1` header, который ставит Caddy, отсутствие → 404. Это же
  защищает от «человеческого» обхода /render как обхода пейволла через текст —
  пейволл-обрезка одинакова для всех).
- **Экранирование**: все строки из БД через `escapeHtml` (title/excerpt/текст),
  атрибуты — через экранирование кавычек. JSON-LD сериализуется через
  `JSON.stringify` + экранирование `</script` → `<\/script`.
- **Кэш:** `Map<path, {html, expiresAt}>` в памяти процесса API, TTL **15 мин**;
  инвалидация по публикации/правке статьи — опционально (в роуте `articles.ts`
  POST/PATCH вызвать `invalidate('/' + type + '/' + slug)`), обязательна только TTL.
- **Лимиты:** рендер — только `GET`, вне `/api/` лимитеров (иначе бот обрежет),
  но со своим лёгким лимитом (например 60 req/min/IP) в `middleware/security.ts`.
- **Логирование:** отдельный лог `bot-render` с path + UA-классом (наблюдаемость,
  на какие боты реально едет трафик).

### 6.2 Caddy

Файл: `infra/Caddyfile`, блок `xn--b1aghca0aeahc1am7c.xn--p1ai`.

Добавить **перед** существующими `handle`:

```caddyfile
# ТЗ-10: sitemap.xml + robots.txt — динамическая генерация на API
handle_path /sitemap.xml {
    reverse_proxy api:4000
}
handle_path /robots.txt {
    reverse_proxy api:4000
}

# ТЗ-10: бот-детект — поисковые/соцботы получают серверный HTML-рендер
@bots {
    header_regexp User-Agent (?i)(googlebot|google-inspectiontool|bingbot|yandex(bot|accessibility|images|metrika|video)|duckduckbot|slurp|baiduspider|applebot|telegrambot|vkshare|facebookexternalhit|twitterbot|linkedinbot|whatsapp|discordbot|pinterestbot|redditbot|bytespider)
}
handle @bots {
    # Передаём исходный путь; API вернёт 404 для неподдерживаемых
    rewrite * /render?path={uri}
    reverse_proxy api:4000 {
        header_up X-Bot-Render 1
    }
}
```

Для поддомена `admin.*` — не нужно (noindex, закрыт в robots).

### 6.3 API: sitemap.xml и robots.txt

- **Файл:** `apps/api/src/routes/seo.ts`.
- `GET /sitemap.xml` → `application/xml`:
  - `<urlset xmlns=...>`: все `published`-статьи (все `ARTICLE_TYPES`), компании,
    тренды, сюжеты, статические и лентовые URL; `<loc>` абсолютный
    (`PUBLIC_SITE_URL` из env, fallback — конфиг), `<lastmod>` из
    `coalesce(publishedAt, updatedAt)`, `<changefreq>`/`priority` разумные дефолты.
  - URL пагинации лент не включать (canonical — первые страницы).
  - Если URL > 50 000 — сплит на sitemapindex (не актуально сейчас, заложить
    функцию).
  - Кэш 15 мин, инвалидация при публикации статьи (тот же хук, что и §6.1).
- `GET /robots.txt` → `text/plain`: `User-agent: *`, `Disallow: /cabinet`,
  `/api`, `/admin`-поддомен пусть живёт своим robots (или `Disallow: /` для
  `admin`-host отдельным блоком здесь, т.к. один origin),
  `Sitemap: https://<host>/sitemap.xml`. Прямые ссылки на
  `host`-агностичность: хост браузера берём из `Host`-заголовка, домен в ТЗ —
  `xn--b1aghca0aeahc1am7c.xn--p1ai`.

### 6.4 Web (apps/web)

- Обязательные мелочи: в `index.html` добавить статичные `og:site_name`,
  `og:type=website`, `twitter:card` (подстраховка, когда Caddy-правило
  временно недоступно); мету на `<html lang="ru">` уже есть.
- `document.title`/мету в SPA (`ArticlePage` и др.) — по-прежнему клиентские,
  т.к. ботам отдаётся шаблон. Дублирования мета-логики не избежать полностью:
  источник правды по текстам — **API-шаблон**, SPA-мету обновляем вторично
  (фиксируем это, чтобы не разошлись).

### 6.5 Что сознательно НЕ решаем

- Интерактивность для ботов (графики, чипсы, комментарии) — не нужна.
- SSR для людей — не нужен, SPA-опыт сохраняется.
- Пайджинированные ленты в sitemap — не нужны.
- hreflang, AMP, фиды (RSS) — отдельные ТЗ при необходимости.

## 7. Реализация (план по файлам)

| Шаг | Файл | Действие |
|---|---|---|
| 1 | `apps/api/src/utils/html.ts` | `escapeHtml`, `escapeAttr`, `htmlToText(contentHtml, maxWords)` |
| 2 | `apps/api/src/services/botUa.ts` | список паттернов UA (зеркало Caddy-регекспа — единый источник: вынести паттерн в константу, в Caddy дублируем, в тестах сверяем) |
| 3 | `apps/api/src/services/botRender.ts` | сборка данных по path-классу, шаблон HTML, JSON-LD (NewsArticle + BreadcrumbList по ТЗ-01), кэш Map+TTL, `invalidate(path)` |
| 4 | `apps/api/src/routes/render.ts` | `GET /render?path=...`, проверка `X-Bot-Render: 1`, 404/403-семантика |
| 5 | `apps/api/src/routes/seo.ts` | `GET /sitemap.xml`, `GET /robots.txt` (по `Host`/`PUBLIC_SITE_URL`) |
| 6 | `apps/api/src/index.ts` | подключить `renderRouter` (до 404-хэндлера), `seoRouter`; лёгкий лимитер на `/render` |
| 7 | `apps/api/src/routes/articles.ts` | в POST/PATCH публикации — `invalidate` кэша рендера и sitemap |
| 8 | `infra/Caddyfile` | блоки `@bots`/`handle @bots`, `/sitemap.xml`, `/robots.txt` (конфиг из §6.2) |
| 9 | `apps/web/index.html` | статичные `og:site_name`, `twitter:card` |
| 10 | `infra/docker-compose.yml` | изменений не требуется (Caddyfile уже смонтирован ro) |
| 11 | тесты: `apps/api/test/render.test.ts`, `seo.test.ts` | см. §8 |

Оценка: 2–4 рабочих дня (шаблон + Caddy + тесты).

## 8. Критерии приёмки

1. **Соцпревью:**
   `curl -s -A "TelegramBot (like TwitterBot)" https://<host>/novost/<slug> | grep og:title`
   → в выдаче `og:title` с заголовком статьи, `og:description` с excerpt,
   `og:image` с абсолютным URL обложки, `twitter:card=summary_large_image`.
   Аналогично для `vkShare` и `facebookexternalhit`.
2. **Поисковик:**
   `curl -s -A "Mozilla/5.0 (compatible; Googlebot/2.1...)" ...` → HTTP 200,
   `text/html`, в body — заголовок и первый абзац статьи как текст;
   `curl -A "YandexBot"` — то же. Невалидный slug → **404**, а не SPA-200.
3. **Rich Results:** HTML бот-версии проходит
   [validator.schema.org](https://validator.schema.org) и Rich Results Test:
   `NewsArticle` без ошибок; `BreadcrumbList` — идентичен ТЗ-01.
4. **Юзер не тронут:** `curl -s -A "Mozilla/5.0 ... Chrome/..." ...` → прежний
   SPA-индекс (JS-бандл, пустой `#root`), HTTP 200.
5. **Sitemap:** `curl https://<host>/sitemap.xml` → валидный XML, содержит все
   `published`-статьи (`count` совпадает с `SELECT count(*) FROM articles
   WHERE status='published'` ± статика), абсолютные `loc`, корректный
   `Content-Type: application/xml`. После публикации новой статьи она появляется
   в sitemap ≤ 15 мин.
6. **Robots:** `curl https://<host>/robots.txt` → содержит `Sitemap:` и
   `Disallow: /cabinet`.
7. **Редиректы из миграции WP** (`apps/api/src/routes/admin.ts` → `/redirects`)
   работают и для ботов: старый URL → Caddy отдаёт тот же рендер-контент
   после клиентского редиректа не хуже, чем раньше; прямой переход по старому
   URL ботом отдаёт 301 (проверить, что RedirectHandler не мешает — редирект
   реализован клиентским JS на SPA; **для ботов старые URL должны отдавать
   серверный 301** — добавить в `seo.ts` маршрут обработки из таблицы redirects
   при UA-боте: проверить по БД redirects и отдать `301 Location: <new>`).
8. **Кэш/производительность:** повторный `curl` того же URL < 50 мс (кэш hit);
   после правки статьи ≤ 15 мин рендер обновлён. API не падает под
   `ab -n 500 -A Googlebot` (p95 < 300 мс с холодным кэшем).
9. **Тесты:** `npm test -w @newinvest/api` — кейсы из пп. 1–4 автоматически
   (суперзест + ин-мемори БД), зелёные.

## 9. Риски и митигации

| Риск | Вероятность | Митигация |
|---|---|---|
| Спуфинг UA (пользователь притворяется Googlebot) | низкая–средняя | Отдаём только публичные метаданные + обрезанный текст — то, что и так видно любому в SPA. Пейволл-текст обрезаем на сервере так же, как фронт. Ущерб ≈ 0. |
| Дрейф шаблона бот-HTML от SPA-версии (мета разошлись) | средняя | Единый источник текстов — `botRender.ts`; SPA-мета (`document.title` и т.п.) обновляется из тех же полей API. В CI — снапшот-тест шаблона. |
| Caddy-регексп пропустит/перехватит лишний UA | средняя | Тест на CI: матчинг паттерна в `botUa.ts` против фиксированного списка UA; список консервативный (только известные боты). Ошибка в сторону «не распознал» = старое поведение SPA, не ломка. |
| `/render` как обход пейволла через текст статьи | низкая | Для `accessLevel != public` текст режется на сервере до excerpt; прямой доступ к `/render` без `X-Bot-Render: 1` → 404. |
| Лишняя нагрузка на API от краулеров | средняя | In-memory кэш 15 мин (статьи читаются редко пишутся); лимитер 60 req/min; наблюдаемость по логу `bot-render`. |
| Yandex/Google по-прежнему хуже индексируют JS-ссылки | низкая | Закрыто sitemap.xml; внутренние ссылки в бот-HTML присутствуют как обычные `<a href>`. |
| Расхождение canonical/og:url при мультидоменности | низкая | Все URL строятся из `Host`-заголовка/`PUBLIC_SITE_URL`, без хардкода. |

## 10. Out of scope (отдельные ТЗ)

- SSR/переезд на Next.js (вариант A) — стратегическая оценка после запуска.
- Полный статический пререндер (вариант B в полном виде) — если гибрид покажет
  пробелы в индексации.
- RSS-фиды, AMP, hreflang, OG для аудио/видео-карточек сверх базового набора.
