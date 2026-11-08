# ТЗ-10. SEO/OG для SPA: бот-детект рендер + sitemap/robots (P0, блокер запуска)

Статус: **финальная версия v2 (2026-11-08)** — на реализацию.
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
5. **Редиректы миграции — только клиентские.** Таблица `redirects` (oldPath → newPath,
   `httpCode` default 301) сейчас обрабатывается только `RedirectHandler.tsx`
   клиентским JS после загрузки SPA. Бот, перешедший по старому URL, получает 200
   со SPA-скелетом вместо серверного 301 — вес старых страниц не передаётся.

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
   компаний, трендов, сюжетов, плюс серверные 301 из таблицы `redirects` для ботов.
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
       └─ Express: 1) проверка redirects → 301?  2) разбор path → выборка из БД
          → HTML-шаблон → 200 text/html

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
  отдавать 404 для неизвестных/непубличных путей. Для tariff/auth-материалов —
  метаданные + excerpt, текст обрезан до пейволла (как в SPA). **Решение ТЗ:**
  честный 403 не отдаём, отдаём 200 с метаданными и excerpt — соцпревью тарифной
  статьи работает как «тизер», это сознательный продуктовый выбор (как в SPA:
  метаданные видны всем, контент за пейволлом).
- **Защита заголовком:** `/render` отвечает 404, если в запросе нет заголовка
  `X-Bot-Render: 1` (его ставит Caddy в блоке `handle @bots`). Исключение —
  `NODE_ENV !== 'production'` (dev-режим: прямые проверки через localhost:4000
  работают без заголовка). Это защищает от «человеческого» обхода /render как обхода
  пейволла через текст; пейволл-обрезка на сервере одинакова для всех.
- **Серверные 301 из redirects:** первым шагом обработки `path` — выборка из таблицы
  `redirects` по `oldPath` (нормализация: слеш в конце отрезаем, как в
  `RedirectHandler.tsx`). Совпадение → ответ `301 Location: <PUBLIC_SITE_URL><newPath>`
  (код из `httpCode`, по умолчанию 301; для бота — с тем же телом нет, только заголовок).
  **Решение ТЗ:** серверные 301 делаем внутри `/render`, т.е. для ботов и для всех,
  кто пришёл с заголовком `X-Bot-Render` (в проде через Caddy это только боты).
  Для живых пользователей старые URL по-прежнему обрабатывает `RedirectHandler.tsx`
  (клиентский Navigate); унификация «301 для всех на уровне Caddy» невозможна без
  DB-aware прокси и вынесена за рамки ТЗ (риск — только лишний клиентский редирект
  для людей, на SEO не влияет). Кэш рендера после 301-ответа не пишем.
- **Поддерживаемые пути** (зеркало роутов `apps/web/src/App.tsx`):
  - `/:type/:slug` — статьи, `type ∈ novost|sobytie|analitika|interesnoe|ideya|video`
    (см. `ARTICLE_TYPES` в `packages/db/src/schema.ts`), slug: `[a-z0-9-]+`
  - `/kompaniya/:slug`, `/trend/:slug`, `/syuzhet/:slug` — сущности
  - `/:type` — ленты рубрик; `/` — главная; `/o-nas|/zachem|/smysl|/missiya|/about...`
    — статические (title/description из админки/конфиг-таблицы, либо захардкоженный
    маппинг — проще второе, список в `App.tsx`)
  - всё остальное → 404 (боту не отдаём SPA-скелет с 200).
- **Данные статьи** (из `articles` + leftJoin `media` на `coverMediaId` + `metaFields`
  `meta_description` + автор из `users` по `authorId`): `title`, `excerpt`,
  `coverUrl` (привести к абсолютному URL через `PUBLIC_SITE_URL`), `publishedAt`,
  `author.name` (фолбэк — «Редакция»), `meta_description`, первые **~100 слов** текста,
  вычищенного от тегов (`contentHtml` → text). **Решение ТЗ:** при пустом `excerpt`
  description = `meta_description`, при пустом и его — первые ~160 символов текста.
- **Что в HTML** — см. шаблон §6.2. Ключевое: в `<body>` именно **первые ~100 слов**
  (а не 300 — хватает для контент-эквивалентности, не выдаём полный текст бесплатно),
  ссылка-якорь «Открыть полную версию».
- **UA-детект внутри API:** маршрут `/render` логирует `User-Agent` и класс бота
  (через `botUa.ts`) для наблюдаемости, но доступ не ограничивает UA — решает заголовок
  `X-Bot-Render`.
- **Экранирование**: все строки из БД через `escapeHtml` (title/excerpt/текст),
  атрибуты — через экранирование кавычек. JSON-LD сериализуется через
  `JSON.stringify` + экранирование `</script` → `<\/script`.
- **Кэш:** `Map<path, {html, expiresAt}>` в памяти процесса API, TTL **15 мин**;
  инвалидация по публикации/правке статьи — опционально (в роуте `articles.ts`
  POST/PATCH/publish вызвать `invalidate('/' + type + '/' + slug)`), обязательна только TTL.
- **Лимиты:** рендер — только `GET`, вне `/api/` лимитеров (иначе бот обрежет),
  но со своим лёгким лимитом (например 60 req/min/IP) в `middleware/security.ts`.

### 6.2 Шаблон HTML-рендера

Структура ответа `GET /render?path=...` (200, `Content-Type: text/html; charset=utf-8`):

```html
<!doctype html>
<html lang="ru">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>{title} — Инвестиционно.рф</title>
  <meta name="description" content="{description}">
  <link rel="canonical" href="{PUBLIC_SITE_URL}{path}">
  <!-- Open Graph -->
  <meta property="og:title" content="{title}">
  <meta property="og:description" content="{description}">
  <meta property="og:type" content="article">          <!-- для статей; website для лент/главной -->
  <meta property="og:url" content="{PUBLIC_SITE_URL}{path}">
  <meta property="og:image" content="{absoluteCoverUrl}">  <!-- только если обложка есть -->
  <meta property="og:site_name" content="Инвестиционно.рф">
  <meta property="og:locale" content="ru_RU">
  <!-- Twitter Card -->
  <meta name="twitter:card" content="summary_large_image">
  <meta name="twitter:title" content="{title}">
  <meta name="twitter:description" content="{description}">
  <meta name="twitter:image" content="{absoluteCoverUrl}">
  <!-- JSON-LD: NewsArticle + BreadcrumbList (структура — копия ТЗ-01, § Breadcrumbs) -->
  <script type="application/ld+json">
  {"@context":"https://schema.org","@type":"NewsArticle",
   "headline":"{title}","description":"{description}","image":["{absoluteCoverUrl}"],
   "datePublished":"{publishedAt ISO}","dateModified":"{updatedAt ISO}",
   "author":{"@type":"Person","name":"{author.name}"},
   "publisher":{"@type":"Organization","name":"Инвестиционно.рф","url":"{PUBLIC_SITE_URL}"}}
  </script>
  <script type="application/ld+json">
  {"@context":"https://schema.org","@type":"BreadcrumbList","itemListElement":[
    {"@type":"ListItem","position":1,"name":"Главная","item":"{PUBLIC_SITE_URL}/"},
    {"@type":"ListItem","position":2,"name":"{имя рубрики}","item":"{PUBLIC_SITE_URL}/{type}"},
    {"@type":"ListItem","position":3,"name":"{title}"}]}
  </script>
</head>
<body>
  <article>
    <nav aria-label="breadcrumb">… обычные <a href="/{type}">рубрика</a> …</nav>
    <h1>{title}</h1>
    <p><time datetime="{publishedAt ISO}">{дата}</time> · {author.name}</p>
    <p><strong>{excerpt}</strong></p>
    <p>{первые ~100 слов текста, абзацы сохранены}</p>
    <p><a href="{PUBLIC_SITE_URL}{path}">Открыть полную версию</a></p>
  </article>
  <noscript>Для полной версии сайта включите JavaScript.</noscript>
</body>
</html>
```

Требования к шаблону:

- Никакого JS, внешних CSS и шрифтов — только семантический HTML.
- BreadcrumbList для статей строится из `type → рубрика` (маппинг типов на русские
  названия — константа в `botRender.ts`, та же, что пойдёт в SPA при обновлении ТЗ-01).
- Для лент/главной/статики: `og:type=website`, без NewsArticle, в body — заголовок
  ленты и 5–10 последних заголовков ссылками `<a href="/{type}/{slug}">`
  (внутренние ссылки помогают краулингу).
- Ссылки в body — только абсолютные или корневые, без `javascript:` (входные slug
  уже валидируются регекспом `[a-z0-9-]+`).
- Пейволл-статьи: в body — H1, дата, автор, excerpt и заметка
  «Полная версия доступна по подписке», без 100 слов. Мета/OG — полные.

### 6.3 Caddy (финальный конфиг)

Файл: `infra/Caddyfile`. Блок `xn--b1aghca0aeahc1am7c.xn--p1ai` после `import security`
и **перед** `handle_path /api/*` должен выглядеть так (добавленные блоки — ТЗ-10):

```caddyfile
xn--b1aghca0aeahc1am7c.xn--p1ai {
  import security

  # ТЗ-10: sitemap.xml + robots.txt — динамическая генерация на API
  handle_path /sitemap.xml {
      reverse_proxy api:4000
  }
  handle_path /robots.txt {
      reverse_proxy api:4000
  }

  # ТЗ-10: серверные 301 из таблицы redirects для ботов (до bot-детекта)
  # — не нужен отдельный блок: 301 отдаёт сам /render (§6.1), т.к. rewrite
  #   ниже передаёт исходный path без изменений.

  # ТЗ-10: бот-детект — поисковые/соцботы получают серверный HTML-рендер
  @bots {
      header_regexp User-Agent (?i)(googlebot|google-inspectiontool|bingbot|yandex(bot|accessibility|images|metrika|video)|duckduckbot|slurp|baiduspider|applebot|telegrambot|vkshare|facebookexternalhit|twitterbot|linkedinbot|whatsapp|discordbot|pinterestbot|redditbot|bytespider)
  }
  handle @bots {
      # Исходный путь уходит как ?path=; API вернёт 301 (redirects),
      # 404 (неподдерживаемый) или HTML-рендер
      rewrite * /render?path={uri}
      reverse_proxy api:4000 {
          header_up X-Bot-Render 1
          header_up User-Agent {http.request.header.User-Agent}
      }
  }

  handle_path /api/* {
      reverse_proxy api:4000
  }
  handle_path /uploads/* {
      reverse_proxy api:4000
  }
  handle {
      reverse_proxy web:80
  }
}
```

Замечания:

- `header_up User-Agent {http.request.header.User-Agent}` — без него Caddy при
  rewrite передаёт своё дефолтное UA; API логирует и классифицирует именно исходный.
- `handle_path /sitemap.xml` (а не `handle`) — путь уходит на API как `/sitemap.xml`
  без префикса (префикс и есть весь путь, поэтому эквивалентно `handle`, но
  оставляем `handle_path` для единообразия с `/api/*`).
- Порядок важен: `@bots` должен идти после sitemap/robots (чтобы бот-краулер sitemap
  получил XML, а не HTML-рендер) и до `handle_path /api/*` (API-эндпоинты ботам
  не рендерим, но `handle` матчится по порядку — сначала sitemap/robots, потом боты;
  `/api/*` бот-UA попадёт в `@bots` → API получит `/render?path=/api/...` → 404.
  **Решение ТЗ:** допустимо, API-вызовы ботами не нужны; альтернатива (исключение
  `/api/*` из `@bots` через `not path /api/*`) — избыточно, т.к. /render вернёт 404).
- Для поддомена `admin.*`: добавить статичный robots (решение ТЗ — noindex-админка
  не должна попасть в индекс):

```caddyfile
admin.xn--b1aghca0aeahc1am7c.xn--p1ai {
  import security

  respond /robots.txt 200 {
      body "User-agent: *
Disallow: /
"
      content_type text/plain
  }

  handle_path /api/* {
      reverse_proxy api:4000
  }
  handle_path /uploads/* {
      reverse_proxy api:4000
  }
  handle {
      reverse_proxy admin:80
  }
}
```

### 6.4 API: sitemap.xml и robots.txt

- **Файл:** `apps/api/src/routes/seo.ts`.
- `GET /sitemap.xml` → `application/xml`:
  - `<urlset xmlns=...>`: все `published`-статьи (все `ARTICLE_TYPES`), компании,
    тренды, сюжеты, статические и лентовые URL; `<loc>` абсолютный
    (`PUBLIC_SITE_URL` из env — уже задан в `infra/docker-compose.yml`, fallback —
    `Host`-заголовок), `<lastmod>` из `coalesce(publishedAt, updatedAt)`,
    `<changefreq>`/`priority` разумные дефолты.
  - URL пагинации лент не включать (canonical — первые страницы).
  - Старые URL из `redirects` **не включать** (решение ТЗ: в sitemap — только
    канонические новые адреса; вес передаётся серверными 301 из §6.1).
  - Если URL > 50 000 — сплит на sitemapindex (не актуально сейчас, заложить
    функцию).
  - Кэш 15 мин, инвалидация при публикации статьи (тот же хук, что и §6.1).
- `GET /robots.txt` → `text/plain`:
  ```
  User-agent: *
  Disallow: /cabinet
  Disallow: /api
  Disallow: /render
  Sitemap: {PUBLIC_SITE_URL}/sitemap.xml
  ```
  Домен берём из `PUBLIC_SITE_URL`/`Host`, хардкода нет.

### 6.5 Web (apps/web)

- Обязательные мелочи: в `index.html` добавить статичные `og:site_name`,
  `og:type=website`, `twitter:card` (подстраховка, когда Caddy-правило
  временно недоступно); мету на `<html lang="ru">` уже есть.
- `document.title`/мету в SPA (`ArticlePage` и др.) — по-прежнему клиентские,
  т.к. ботам отдаётся шаблон. Дублирования мета-логики не избежать полностью:
  источник правды по текстам — **API-шаблон**, SPA-мету обновляем вторично
  (фиксируем это, чтобы не разошлись).
- `RedirectHandler.tsx` — без изменений (люди по-прежнему получают клиентский
  редирект; боты — серверный 301 через `/render`, §6.1).

### 6.6 Что сознательно НЕ решаем

- Интерактивность для ботов (графики, чипсы, комментарии) — не нужна.
- SSR для людей — не нужен, SPA-опыт сохраняется.
- Пайджинированные ленты в sitemap — не нужны.
- Серверные 301 для живых пользователей (сейчас — клиентский `RedirectHandler`) —
  за рамками ТЗ; на SEO не влияет (боты покрыты).
- hreflang, AMP, фиды (RSS) — отдельные ТЗ при необходимости.

## 7. Реализация (план по файлам)

| Шаг | Файл | Действие |
|---|---|---|
| 1 | `apps/api/src/utils/html.ts` | `escapeHtml`, `escapeAttr`, `htmlToText(contentHtml, maxWords)` |
| 2 | `apps/api/src/services/botUa.ts` | список паттернов UA (зеркало Caddy-регекспа — единый источник: вынести паттерн в константу, в Caddy дублируем, в тестах сверяем) |
| 3 | `apps/api/src/services/botRender.ts` | нормализация path, проверка таблицы `redirects` → 301, сборка данных по path-классу, шаблон HTML (§6.2), JSON-LD (NewsArticle + BreadcrumbList по ТЗ-01), кэш Map+TTL, `invalidate(path)` |
| 4 | `apps/api/src/routes/render.ts` | `GET /render?path=...`, проверка `X-Bot-Render: 1` (в prod; в dev — пропуск), 301/404/200-семантика |
| 5 | `apps/api/src/routes/seo.ts` | `GET /sitemap.xml`, `GET /robots.txt` (по `Host`/`PUBLIC_SITE_URL`) |
| 6 | `apps/api/src/middleware/security.ts` | лёгкий лимитер `renderLimiter` (60 req/min/IP), применить на `/render` в `index.ts` |
| 7 | `apps/api/src/index.ts` | подключить `renderRouter` и `seoRouter` **до** 404-хэндлера и до `app.use('/api/', apiLimiter)` (они вне `/api/`); `app.use('/render', renderLimiter)` |
| 8 | `apps/api/src/routes/articles.ts` | в POST/PATCH/publish — `invalidate('/' + type + '/' + slug)` кэша рендера и sitemap |
| 9 | `infra/Caddyfile` | блоки `/sitemap.xml`, `/robots.txt`, `@bots`/`handle @bots` с `header_up X-Bot-Render 1` и пробросом UA (конфиг из §6.3); статичный robots для `admin.*` |
| 10 | `apps/web/index.html` | статичные `og:site_name`, `og:type=website`, `twitter:card` |
| 11 | `infra/docker-compose.yml` | изменений не требуется (Caddyfile уже смонтирован ro, `PUBLIC_SITE_URL` уже проброшен) |
| 12 | тесты: `apps/api/test/render.test.ts`, `seo.test.ts` | см. §8, §11 |

Оценка: 2–4 рабочих дня (шаблон + Caddy + тесты).

## 8. Критерии приёмки

1. **Соцпревью:**
   `curl -s -A "TelegramBot (like TwitterBot)" https://<host>/novost/<slug> | grep og:title`
   → в выдаче `og:title` с заголовком статьи, `og:description` с excerpt,
   `og:image` с абсолютным URL обложки, `twitter:card=summary_large_image`.
   Аналогично для `vkShare` и `facebookexternalhit`.
2. **Поисковик:**
   `curl -s -A "Mozilla/5.0 (compatible; Googlebot/2.1; +http://www.google.com/bot.html)" ...` → HTTP 200,
   `text/html`, в body — заголовок и первый абзац статьи как текст;
   `curl -A "YandexBot/3.0"` — то же. Невалидный slug → **404**, а не SPA-200.
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
   `Disallow: /cabinet`; `curl https://admin.<host>/robots.txt` → `Disallow: /`.
7. **Редиректы из миграции WP** (`redirects`: `oldPath`, `newPath`, `httpCode`):
   бот переходит по старому URL → серверный `301 Location: <new>` (проверка
   внутри `/render`, §6.1). Живой пользователь → прежний клиентский редирект
   `RedirectHandler.tsx` без изменений.
8. **Защита /render:** `curl https://<host>/render?path=/novost/<slug>` без
   `X-Bot-Render` → 404; с `-H "X-Bot-Render: 1"` → HTML-рендер.
9. **Кэш/производительность:** повторный `curl` того же URL < 50 мс (кэш hit);
   после правки статьи ≤ 15 мин рендер обновлён. API не падает под
   `ab -n 500 -A Googlebot` (p95 < 300 мс с холодным кэшем).
10. **Тесты:** `npm test -w @newinvest/api` — кейсы из пп. 1–4, 8 автоматически
    (суперзест + ин-мемори БД), зелёные.

## 9. Тестирование (ручная проверка после деплоя)

Хост в примерах: `https://xn--b1aghca0aeahc1am7c.xn--p1ai` (подставить `$HOST`).
`<slug>` — slug любой опубликованной статьи; `<old>` — `oldPath` из таблицы redirects.

```bash
HOST=https://xn--b1aghca0aeahc1am7c.xn--p1ai
SLUG=<slug>

# 1. Соцпревью Telegram
curl -s -A "TelegramBot (like TwitterBot)" $HOST/novost/$SLUG | grep -E 'og:title|og:description|og:image|twitter:card'

# 2. Соцпревью VK / Facebook
curl -s -A "vkShare" $HOST/novost/$SLUG | grep og:title
curl -s -A "facebookexternalhit/1.1" $HOST/novost/$SLUG | grep og:image

# 3. Googlebot: 200 + текст в body
curl -s -o /tmp/bot.html -w "%{http_code} %{content_type}\n" \
  -A "Mozilla/5.0 (compatible; Googlebot/2.1; +http://www.google.com/bot.html)" \
  $HOST/novost/$SLUG
grep -E '<h1>|application/ld\+json' /tmp/bot.html

# 4. YandexBot: тот же результат
curl -s -o /dev/null -w "%{http_code}\n" -A "Mozilla/5.0 (compatible; YandexBot/3.0)" $HOST/novost/$SLUG

# 5. Невалидный slug → 404 (не SPA-200)
curl -s -o /dev/null -w "%{http_code}\n" -A "Googlebot/2.1" $HOST/novost/net-takogo-slugа

# 6. Живой юзер (Chrome) → прежний SPA-скелет
curl -s -A "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0 Safari/537.36" \
  $HOST/novost/$SLUG | grep -E '<div id="root"|src="/assets/'

# 7. Прямой доступ к /render без заголовка → 404; с заголовком → 200
curl -s -o /dev/null -w "%{http_code}\n" "$HOST/render?path=/novost/$SLUG"
curl -s -o /dev/null -w "%{http_code}\n" -H "X-Bot-Render: 1" "$HOST/render?path=/novost/$SLUG"

# 8. Серверный 301 из redirects для бота (WP-миграция)
curl -s -o /dev/null -w "%{http_code} %{redirect_url}\n" -A "Googlebot/2.1" $HOST<old>

# 9. Sitemap / robots
curl -s $HOST/sitemap.xml | head -5
curl -s $HOST/robots.txt
curl -s https://admin.xn--b1aghca0aeahc1am7c.xn--p1ai/robots.txt

# 10. Локальный dev (без Caddy, без заголовка — dev-режим пропускает)
curl -s "http://localhost:4000/render?path=/novost/$SLUG" | grep og:title
curl -s http://localhost:4000/sitemap.xml | head -3

# 11. Нагрузка: p95 < 300 мс холодный кэш
ab -n 500 -c 10 -A "Googlebot/2.1" $HOST/novost/$SLUG | grep -E '95%|Requests per second'
```

Ожидаемые результаты: пп. 1–4 — HTML-рендер с мета; п. 5 — `404`; п. 6 — SPA
(JS-бандл, пустой `#root`); п. 7 — `404` затем `200`; п. 8 — `301` с
`redirect_url` = новый URL; п. 9 — валидный XML / текст robots; п. 10 — рендер
работает локально; п. 11 — `p95 < 300ms`.

## 10. Риски и митигации

| Риск | Вероятность | Митигация |
|---|---|---|
| Спуфинг UA (пользователь притворяется Googlebot) | низкая–средняя | Отдаём только публичные метаданные + обрезанный текст — то, что и так видно любому в SPA. Пейволл-текст обрезаем на сервере так же, как фронт. Ущерб ≈ 0. |
| Дрейф шаблона бот-HTML от SPA-версии (мета разошлись) | средняя | Единый источник текстов — `botRender.ts`; SPA-мета (`document.title` и т.п.) обновляется из тех же полей API. В CI — снапшот-тест шаблона. |
| Caddy-регексп пропустит/перехватит лишний UA | средняя | Тест на CI: матчинг паттерна в `botUa.ts` против фиксированного списка UA; список консервативный (только известные боты). Ошибка в сторону «не распознал» = старое поведение SPA, не ломка. |
| `/render` как обход пейволла через текст статьи | низкая | Для `accessLevel != public` текст режется на сервере до excerpt; прямой доступ к `/render` без `X-Bot-Render: 1` → 404 (в prod). |
| Краулер обошёл sitemap-XML через bot-детект (получил HTML вместо XML) | низкая | Порядок handle'ов в Caddy (§6.3): sitemap/robots матчатся раньше `@bots`. |
| Лишняя нагрузка на API от краулеров | средняя | In-memory кэш 15 мин (статьи читаются редко пишутся); лимитер 60 req/min; наблюдаемость по логу `bot-render`. |
| Yandex/Google по-прежнему хуже индексируют JS-ссылки | низкая | Закрыто sitemap.xml; внутренние ссылки в бот-HTML присутствуют как обычные `<a href>`. |
| Расхождение canonical/og:url при мультидоменности | низкая | Все URL строятся из `Host`-заголовка/`PUBLIC_SITE_URL`, без хардкода. |

## 11. Out of scope (отдельные ТЗ)

- SSR/переезд на Next.js (вариант A) — стратегическая оценка после запуска.
- Полный статический пререндер (вариант B в полном виде) — если гибрид покажет
  пробелы в индексации.
- Серверные 301 из redirects для живых пользователей (сейчас — клиентский
  `RedirectHandler`), DB-aware маршрутизация на уровне Caddy.
- RSS-фиды, AMP, hreflang, OG для аудио/видео-карточек сверх базового набора.

---

## Правки ревью v2.1 (принято, обязательны к реализации)

1. **🔴 Caddy: `@bots` — исключить `/uploads/*` и `/api/*`** (`not path /uploads/* /api/*`): иначе TelegramBot/Googlebot-Images, скачивая og:image с `/uploads/...`, попадают в rewrite на /render → 404 → превью без обложки и картинки не в индексе.
2. **BreadcrumbList в bot-шаблоне для ВСЕХ типов** (не только статей): `/:type`, `/trend/:slug`, `/kompaniya/:slug`, `/syuzhet/:slug`, `/portfolio` — через общий `buildBreadcrumbList(Crumb[])` из ТЗ-01 (контракт: Crumb[] → JSON-LD, копия в botRender). Согласовано с ТЗ-01: последний элемент без item.
3. **JSON-LD в шаблоне — одним `JSON.stringify(obj)`** (без ручной подстановки полей в строку — кавычка в title ломает JSON) + `</script` → `<\/script` + U+2028/U+2029 замена.
4. **escapeXml в sitemap** для `<loc>` + валидация slug'ов сущностей (компании/тренды/сюжеты — регексп `[a-z0-9-]+` как у статей; юникодные slug — транслитерация или исключение).
5. **Кэш redirects-lookup** (in-memory oldPath→newPath, инвалидация при POST/DELETE /api/redirects) — иначе SQL на каждый бот-хит.
6. UA-список: добавить RU-ботов `seznambot`, `Mail.RU_Bot`, `exabot`.
7. Проверить `NODE_ENV=production` в docker-compose для api (иначе защита /render не активна).
8. **Шаблоны entity-страниц** (компания/тренд/сюжет) — отдельный абзац в §6.2: какие данные, og:type (`website`/`profile`, не article), JSON-LD тип (Organization/CollectionPage — или без), og:image (лого тренда/компании).
9. Риск клоакинга — зафиксировать митигацию в §10: «мета/JSON-LD описывают только то, что видно в отданном HTML; бот получает МЕНЬШЕ, не подмену» (leaky-paywall паттерн, допустим Google).
10. Проверить og:image абсолютный URL (PUBLIC_SITE_URL + coverUrl) — подтверждено в v2, добавить в чек-лист.

---

## СТАТУС: ✅ РЕАЛИЗОВАНО (2026-11-08, агент-55, принято)

**Реализация:** botRender — `services/botRender.ts` (классификация пути зеркалом App.tsx; шаблоны: статья public→100 слов / paywall→тизер без текста, компания с Organization JSON-LD, тренд/сюжет, ленты рубрик, главная, 15 статики; серверные 301 из redirects со своим кэшем TTL 15 мин + invalidateRedirectsCache при POST/DELETE /api/redirects; кэш рендера 15 мин + invalidateArticleSeo при POST/PATCH/publish статей), `utils/html.ts` (escapeHtml/escapeAttr/escapeXml, htmlToText с лимитом слов, absoluteUrl с отсечкой javascript:/data:, encodePathSegment), `services/botUa.ts` (единый UA-список + BOT_UA_PATTERN_SOURCE для Caddyfile). BreadcrumbList — ИМПОРТ buildBreadcrumbList/serializeJsonLd из @newinvest/db/breadcrumbs (контракт ТЗ-01, последний без item). `routes/render.ts` GET /render?path= (prod: без X-Bot-Render:1 → 404, dev пропуск; renderLimiter 60/мин). `routes/seo.ts`: /sitemap.xml (419 URL: статьи+компании+тренды+сюжеты+статика, lastmod=coalesce(publishedAt,updatedAt), escapeXml+percent-encoding, кэш 15 мин, заготовка sitemapindex при >50k) + /robots.txt (Disallow /cabinet /api /render, Sitemap из origin). Express 4 не ловит async-ошибки — роуты в try/catch. `infra/Caddyfile`: sitemap/robots ДО @bots; @bots с `not path /uploads/* /api/*` (v2.1 №1 — иначе og:image 404) и UA-регекспом (RU-боты seznambot/Mail.RU_Bot/exabot); rewrite → /render?path={uri} с header_up X-Bot-Render 1 и пробросом исходного UA. apps/web/index.html: статичные og:site_name/og:type/twitter:card.

**Отклонения от ТЗ (приняты):**
1. Slug не режется по `[a-z0-9-]+` — в БД реально есть slug с кириллической «о» (analitika/ipо-spacex-razbor): путь `[^/]+`, XSS закрыт экранированием, в sitemap percent-encoding (v2.1 №4).
2. У трендов/сюжетов только BreadcrumbList без entity JSON-LD (v2.1 №8 разрешает); twitter:card фиксирован summary_large_image.
3. `caddy validate` локально недоступен — синтаксис сверен с документацией Caddy 2, исполняется на сервере.

**Приёмка:** tsc чисто (api+web), unit 15/15 (эскейпинг, UA-список vs браузеры, контракт BreadcrumbList, </script>/U+2028-29, sitemap urlset), curl: рендер всех классов с валидным JSON-LD, 100 слов ровно, 301 redirects, sitemap парсится XML-парсером, эскейпинг проверен статьёй с кавычками/угловыми, инвалидация кэша по PATCH, защита /render в prod. E2E 250/250 (+26).

**E2E: 250/250. ВСЕ 10 ТЗ ЦИКЛА РЕАЛИЗОВАНЫ.**
