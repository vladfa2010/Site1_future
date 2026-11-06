# Новый сайт «Инвестиционно.рф» — базовый документ

> Рабочий документ проекта. Сюда складываем всё, что изучили о текущем сайте, боте публикаций и планах новой платформы.
> Дата начала: 2026-11-06

---

## 1. Контекст и цель

Есть действующий сайт **https://инвестиционно.рф** (punycode: `xn--b1aghca0aeahc1am7c.xn--p1ai`, сервер 45.130.41.19) на WordPress. Сайт работает, но хочется написать **свою платформу**, потому что:

- Есть второй проект с полноценной регистрацией и аналитикой — хочется единый аккаунт (SSO), общие закладки, подписки, персональную ленту.
- Текущая модель данных на WordPress (7 CPT + 9 таксономий с разреженной матрицей привязок) на пределе удобства.
- Связи «в одну сторону»: тикер не знает о компании, компания — об индустрии. Ручная работа на каждой статье, риск рассинхрона.
- Есть Telegram-бот публикаций (wptg), который на новой платформе должен продолжить работать почти без переделки.

---

## 2. Изучение текущего сайта (2026-11-06)

### 2.1 Технический стек

- WordPress + тема **Kadence** + Kadence Blocks (вёрстка страниц)
- **Yoast SEO** (sitemap, schema.org)
- **Ultimate Member** — регистрация/вход, формы («Вход в аккаунт», «Заявка на размещение проекта»), закладки («нет записей в закладках»)
- **Popup Maker**, **MailPoet** (рассылки), **Autoptimize** (кэш/склейка CSS)
- xmlrpc открыт; REST API открыт (`/wp-json/wp/v2/...`) — через него работает бот

### 2.2 Типы контента (Custom Post Types)

Всего ~520 URL в индексе sitemap.

| CPT | Кол-во | Что это | Пример URL |
|---|---|---|---|
| `novost` | 151 | Новости | `/novost/spacex-lider-po-kolichestvu-sputnikov/` |
| `interesnoe` | 62 | Интересное | `/interesnoe/physical-ai-fizicheskij-ii-na-poroge-proryva/` |
| `sobytie` | 32 | События | `/sobytie/…` |
| `post` (Записи) | 49 | Идеи | `/fabricaone-investicii-v-ii-rf/` |
| `analitika` | 11 | Аналитика | `/analitika/ipo-spacex-temnye-tajny/` |
| `trends` | 6 | Лендинги-тренды | `/trends/kosmos/` |
| `kompaniya-p` | 5 | Карточки компаний | — |

### 2.3 Таксономии (внутренние свойства статей)

| Таксономия | Терминов | К чему привязана |
|---|---|---|
| `tiker` | 23 | SPCX, NVDA, TSLA, SBER, YDEX, RKKE… |
| `kompaniya` | 73 | SpaceX, Tesla, Яндекс, Сбербанк, Figure, OpenAI… |
| `industriya` | 24 | AI, BioTech, SpaceTech, RWA, Роботы, Семейство… |
| `trend` | 16 | Космос, Роботы, ИИ, Токенизация активов… |
| `etapy-sdelki` | 3 | пайплайн / портфель / архив |
| `stadiya-sdelki` | 8 | pre-seed → seed → A → early → late → pre-IPO → IPO → торги |
| `stadiya-proekta` | 4 | есть продукт / кратный рост / проект / уже зарабатывает |
| `strategiya-investirovaniya` | 3 | дивиденды / купоны / рост цены |
| `klassifikaciya-po-rynkam` | 4 | венчур / долговой / скоро на бирже / фондовый |
| `category` | 13 | идея, новости, аналитика-р, интересное, pipeline, case, startup-of-the-month, обучение, arhiv, kompaniya-r, start, trendy, sobytie |
| `obuchenie`, `partnyor` | 2 + | учебные и партнёрские рубрики |

**Матрица привязок разрежена** — например, `tiker` привязан к 6 типам контента, `kompaniya` к 7, `stadiya-sdelki` только к `post`.

### 2.4 Как работают «карусели»

Проверено на живых страницах. Статья «SpaceX – лидер по количеству спутников» привязана к:
- тикеру **SPCX**, компании **SpaceX**, индустрии **SpaceTech**, тренду **Космос**.

Из этого автоматически собираются:
- страница компании `/kompaniya/spacex/` (CollectionPage в Schema.org) — все статьи по компании
- страницы тренда `/trend/kosmos/`, тикера `/tiker/spcx/`, индустрии `/industriya/spacetech/`

**Главная страница** — секции: ТРЕНДЫ / ПАЙПЛАЙН / НАШ ПОРТФЕЛЬ / АРХИВ ИДЕЙ / ЗНАНИЯ (клуб «Инсайдер», личная консультация, инвестиционный курс) — ручные выборки по рубрикам `trendy`, `pipeline`, `ideya`, `arhiv`.

### 2.5 Выявленные проблемы текущей реализации

1. **Дублирование сущностей**: таксономия `trend` (16 терминов) + CPT `trends` (6 лендингов) — два разных «Космоса» живут отдельно. Аналогично `kompaniya` (таксономия, 73) vs `kompaniya-p` (CPT, 5).
2. **Связи в одну сторону**: тикер ⇏ компания ⇏ индустрия. Каждая связь проставляется вручную на каждой статье → рассинхрон (где-то тикер SPCX без компании SpaceX).
3. **7 CPT × 9 таксономий** — редакторская каша, WP на пределе.
4. **Регистрация/закладки** (Ultimate Member) изолированы от второго проекта.
5. Картинки статей часто без фирменного оформления.

---

## 3. Telegram-бот публикаций (wptg)

Репозиторий: https://github.com/vladfa2010/wptg (~1800 строк, Python 3.11 + aiogram 3.x, SQLite, деплой Railway/Docker).

### 3.1 Конвейер

```
Ссылка/текст → парсинг (trafilatura) → рерайт Moonshot (человеческий стиль, 800–1500 слов)
→ категоризация LLM (только существующие ID терминов) → превью с кнопками
→ публикация в нужный CPT через WP REST API
```

### 3.2 Что ценного (переносим как есть)

- **Промпт «человеческого стиля»** — 8 техник: burstiness, эмоциональные маркеры, разговорные формулировки, структурные неровности, идиомы, текстовая шероховатость, конкретика, контекст.
- **Динамическое обнаружение таксономий** (`/sync`) — подхват новых таксономий без правки кода.
- **Валидация LLM-ответа** — только ID из кэша терминов.
- **Редактор в превью**: заголовок/контент/excerpt, чекбоксы таксономий с пагинацией, inline-коррекция текстом («сделай заголовок короче»).
- Дедупликация по `source_url`, черновики, fallback на OG-картинку.
- SQLite-схемы: `drafts`, `publications`, `taxonomy_cache`.

### 3.3 Слабые места (решаются новой платформой)

- Жёсткая мапа «рубрика-ID → CPT» (`98→novost, 128→sobytie, 249→analitika, 129→interesnoe, 296→kompaniya-p, 107→trends`).
- LLM может выбрать только существующие термины — новую компанию/тикер заводят руками в WP.
- Генерация картинок через Moonshot отдаёт 403 (OG-fallback).

### 3.4 План интеграции с новой платформой

- Переписать только `services/wordpress.py` (~170 строк) → клиент API нового сайта.
- Бот шлёт `type` статьи напрямую вместо мапы рубрик.
- Бот может создавать новые сущности: «Компания не найдена — создать?» → создаётся через API, связи тикер→компания→индустрия выставляются по цепочке автоматически.
- Категоризатор упрощается: LLM находит тикер/компанию, остальное подтягивается из графа.

---

## 4. Целевая модель данных (предложение)

Одна сущность **Статья** + справочники-сущности со взаимными связями:

```
Тикер ──belongs_to──▶ Компания ──belongs_to──▶ Индустрия
  ▲                      ▲                          ▲
  └──── Статья ◀─────────┴──────────────────────────┘
        (many-to-many: тикер, компания, индустрия, тренд,
         стадия сделки, стратегия, класс рынка + поле type)
```

- **Статья**: `type` (новость/событие/аналитика/идея/интересное), дата, автор, заголовок, контент, excerpt, обложка, источник (`source_url`).
- **Тикер** → принадлежит Компании. **Компания** → принадлежит Индустрии(-ям). **Тренд** → связан с индустриями/компаниями.
- «Карусели» = один тип запроса к графу, а не 9 отдельных механик.
- Бонус: страница тикера → его компания → индустрия → все тренды, где фигурирует.

### 4.1 Предметная модель: венчурный портфель (уточнено владельцем 2026-11-06)

Стиль платформы — венчурный портфель со всем пайплайном, от глобального тренда до архива:

```
ТРЕНД (мега-тренд: квантовые компьютеры, CRISPR) — лонгрид-лендинг
   └── ИДЕЯ (внутри тренда; может БЫТЬ компанией
        │      или содержать несколько компаний;
        │      может существовать БЕЗ компаний — идея опережает рынок)
        └── КОМПАНИЯ (профиль-карточка) ← ТИКЕР
              └── ПАЙПЛАЙН СДЕЛКИ: pipeline → портфель → архив
ЖИВОЙ ПРОЦЕСС: СОБЫТИЕ («Прометей перешёл в оформление») — хронология через Сюжет
КОНТЕКСТ: АНАЛИТИКА / ИНТЕРЕСНОЕ — обогащают тренды и компании
```

Ключевые свойства модели:

- **Идея → сделка — одна сущность, движущаяся по фазам**: идея становится сделкой сменой `deal_phase`, потом попадает в портфель, затем в архив. Страницы `/pipeline`, `/portfel`, `/arhiv` — выборки по фазе
- **Идея без компании — легальный случай**: тренд есть, идея ясна, компаний на рынке ещё нет. Привязки опциональны
- **`articles.thesis`** — тезис идеи (2–3 предложения «почему это инвестиция»), отдельно от excerpt
- **Карточка компании** — `one_liner` (строка для карточки портфеля), `logo_media_id`, `founded_year` (миграция 0001)

### 4.2 Навигация «проваливание из любой точки» (концепция владельца, 2026-11-06)

С любой точки сайта можно провалиться дальше по графу. Три типа перехода:

1. **Вглубь** — по иерархии: статья → тикер → компания → индустрия → тренд
2. **Вширь** — «другое такое же»: по смыслу (сюжет + векторная близость)
3. **Вбок** — та же сущность, другой тип контента: видео про SpaceX → новости SpaceX → идеи тренда «Космос» → аналитика

Пример пути: `Интересное/видео SpaceX → [ещё Интересное] | [Новости SpaceX] | [Тренд: Космос] | [Идеи в теме]`. Каждый узел-карточка — это меню следующего шага; сайт — граф для ходьбы, а не лента.

Реализация:

- чипы-сущности (компания/тикер/тренд/сюжет) на каждой карточке — точки проваливания
- панель «куда дальше» на странице статьи, сгруппированная по типам перехода
- эндпоинт `GET /api/articles/:id/related` — блоки: развитие сюжета / те же компании другие типы / идеи того же тренда / векторно-похожие (механика из 7.3)
- «карусели» = отрисованный подграф («всё по тренду», «всё по тикеру»)

### 4.3 Принцип отображения: показываем только внесённое (2026-11-06)

Данные по оценкам/раундам есть не всегда — и это норма (частные компании без раскрытий). Правила:

- **Блок рендерится только если данные внесены.** Нет раундов — нет пустого заголовка «Оценки и раунды» и прочерков на странице компании
- **Каждая цифра — с источником**: `funding_rounds.source_url` обязателен (API отдаёт 400 без него). Доверие = ссылка на новость/раскрытие
- **Частичность допустима**: раунд может иметь сумму без оценки, оценку без инвесторов; график динамики строится по точкам, где оценка известна
- Аналогично для тикеров, стадий сделки и пр. — отсутствие данных ≠ «0», это отсутствие блока

## 5. Схема БД новой платформы (PostgreSQL)

### 5.1 Справочники-сущности (граф знаний)

```sql
industries (                       -- Индустрии (24)
  id            SERIAL PRIMARY KEY,
  slug          TEXT UNIQUE NOT NULL,   -- 'spacetech' → /industriya/spacetech/
  name          TEXT NOT NULL,          -- 'SpaceTech'
  description   TEXT,
  cover_media_id INT REFERENCES media(id)
)

companies (                        -- Компании (73)
  id            SERIAL PRIMARY KEY,
  slug          TEXT UNIQUE NOT NULL,   -- 'spacex' → /kompaniya/spacex/
  name          TEXT NOT NULL,          -- 'SpaceX'
  one_liner     TEXT,                   -- строка для карточки портфеля
  description   TEXT,
  logo_media_id INT REFERENCES media(id),
  website       TEXT,
  country       TEXT,
  founded_year  INT,
  is_public     BOOLEAN DEFAULT FALSE,  -- торгуется ли на бирже
  cover_media_id INT REFERENCES media(id),
  created_at, updated_at
)

company_industries (               -- компания ↔ индустрия (many-to-many)
  company_id   INT REFERENCES companies(id) ON DELETE CASCADE,
  industry_id  INT REFERENCES industries(id) ON DELETE CASCADE,
  PRIMARY KEY (company_id, industry_id)
)

tickers (                          -- Тикеры (23)
  id            SERIAL PRIMARY KEY,
  slug          TEXT UNIQUE NOT NULL,   -- 'spcx' → /tiker/spcx/
  symbol        TEXT UNIQUE NOT NULL,   -- 'SPCX'
  company_id    INT REFERENCES companies(id),  -- тикер ЗНАЕТ свою компанию
  exchange      TEXT,                   -- MOEX, NASDAQ, NYSE...
  currency      TEXT,
  instrument    TEXT,                   -- stock | bond | crypto | etf
  created_at, updated_at
)

trends (                           -- Тренды (16), сливаем trend + trends
  id            SERIAL PRIMARY KEY,
  slug          TEXT UNIQUE NOT NULL,   -- 'kosmos' → /trend/kosmos/
  name          TEXT NOT NULL,
  description   TEXT,                   -- длинный лендинг-текст (бывший CPT trends)
  status        TEXT DEFAULT 'active',  -- active | closed
  cover_media_id INT REFERENCES media(id),
  created_at, updated_at
)

trend_industries (trend_id, industry_id, PRIMARY KEY(trend_id, industry_id))
company_trends   (company_id, trend_id, PRIMARY KEY(company_id, trend_id))

funding_rounds (                   -- РАУНДЫ И ОЦЕНКИ (питчбук-лайт), миграция 0002
  id            SERIAL PRIMARY KEY,
  company_id    INT REFERENCES companies(id) ON DELETE CASCADE,
  stage         TEXT,                   -- seed | series-a..e | ipo | grant | mna
  date          DATE,
  amount        NUMERIC,                -- сумма раунда
  currency      TEXT DEFAULT 'USD',
  post_money_valuation NUMERIC,         -- для графика динамики оценки
  investors     TEXT[],                 -- MVP: список имён
  source_url    TEXT NOT NULL,          -- обязателен: каждая цифра — со ссылкой
  status        TEXT DEFAULT 'completed',
  created_at, updated_at
)

stories (                          -- СЮЖЕТЫ (решение 2026-11-06): объединяют
  id            SERIAL PRIMARY KEY,      -- серии статей об одном событии
  slug          TEXT UNIQUE NOT NULL,    -- 'spacex-ipo' → /syuzhet/spacex-ipo/
  name          TEXT NOT NULL,
  description   TEXT,
  primary_article_id INT REFERENCES articles(id),  -- каноническая статья (для SEO)
  status        TEXT DEFAULT 'active',   -- active | closed
  cover_media_id INT REFERENCES media(id),
  created_at, updated_at
)

article_stories (                  -- статья ↔ сюжет
  article_id  INT REFERENCES articles(id) ON DELETE CASCADE,
  story_id    INT REFERENCES stories(id) ON DELETE CASCADE,
  is_primary  BOOLEAN DEFAULT FALSE,     -- главная статья сюжета
  added_via   TEXT DEFAULT 'manual',     -- manual | vector (автопредложение ботом)
  PRIMARY KEY (article_id, story_id)
)

deal_stages (                      -- Стадии сделки (8): pre-seed..IPO
  id, slug UNIQUE, name, sort_order
)
deal_phases (                      -- Этапы сделки (3): pipeline / portfel / arhiv
  id, slug UNIQUE, name
)
project_stages (id, slug UNIQUE, name)        -- Стадии проекта (4)
strategies (id, slug UNIQUE, name)            -- Стратегии (3)
market_classes (id, slug UNIQUE, name)        -- Классы рынков (4)
```

### 5.2 Контент

```sql
articles (                         -- ОДНА таблица вместо 6 CPT
  id            SERIAL PRIMARY KEY,
  type          TEXT NOT NULL,          -- novost | sobytie | analitika |
                                        -- interesnoe | ideya  → /{type}/{slug}/
  slug          TEXT NOT NULL,
  title         TEXT NOT NULL,
  content_html  TEXT NOT NULL,
  excerpt       TEXT,
  thesis        TEXT,                   -- тезис идеи (для type='ideya')
  source_url    TEXT,                   -- дедупликация (как в wptg)
  cover_media_id INT REFERENCES media(id),
  author_id     INT REFERENCES users(id),
  status        TEXT DEFAULT 'draft',   -- draft | published
  published_at  TIMESTAMPTZ,
  created_at, updated_at,
  old_wp_id     INT, old_wp_type TEXT,  -- миграция: сверка и 1:1 URL
  UNIQUE (type, slug)
)

-- Привязки статьи (many-to-many; заменяет 9 таксономий WP)
article_companies    (article_id, company_id,    PRIMARY KEY(article_id, company_id))
article_tickers      (article_id, ticker_id,     PRIMARY KEY(article_id, ticker_id))
article_industries   (article_id, industry_id,   PRIMARY KEY(article_id, industry_id))
article_trends       (article_id, trend_id,      PRIMARY KEY(article_id, trend_id))
article_deal_stages  (article_id, stage_id,      PRIMARY KEY(article_id, stage_id))
article_deal_phases  (article_id, phase_id,      PRIMARY KEY(article_id, phase_id))
article_project_stages(article_id, stage_id,     PRIMARY KEY(article_id, stage_id))
article_strategies   (article_id, strategy_id,   PRIMARY KEY(article_id, strategy_id))
article_market_classes(article_id, class_id,     PRIMARY KEY(article_id, class_id))

media (
  id, file_path TEXT, alt TEXT, source_url TEXT,  -- source_url — откуда скачано (OG)
  created_at
)
```

### 5.3 Пользователи и вовлечение

```sql
users (
  id, email TEXT UNIQUE NOT NULL, password_hash TEXT,
  display_name TEXT, role TEXT DEFAULT 'reader',   -- super_admin | admin | author | reader
  old_wp_id INT,                                    -- миграция из Ultimate Member
  created_at
)
bookmarks (                        -- закладки (было в UM)
  user_id, article_id, created_at,
  PRIMARY KEY (user_id, article_id)
)
subscriptions (                    -- подписка на тикер/компанию/тренд/индустрию
  user_id, entity_type TEXT,        -- ticker | company | trend | industry
  entity_id INT, created_at,
  PRIMARY KEY (user_id, entity_type, entity_id)
)
article_views (                    -- аналитика чтения
  user_id, article_id, viewed_at
)
```

### 5.4 SEO и переезд

```sql
redirects (                        -- fallback, только для изменившихся путей
  old_path TEXT PRIMARY KEY, new_path TEXT NOT NULL, http_code INT DEFAULT 301
)
meta_fields (                      -- перенос Yoast: description, canonical
  owner_type TEXT, owner_id INT,    -- article | company | trend ...
  key TEXT, value TEXT,
  PRIMARY KEY (owner_type, owner_id, key)
)
```

### 5.5 Векторный поиск (pgvector — без отдельного сервиса)

```sql
CREATE EXTENSION vector;

article_embeddings (
  article_id  INT PRIMARY KEY REFERENCES articles(id) ON DELETE CASCADE,
  embedding   VECTOR(1024),         -- зависит от выбранной модели
  model       TEXT,                 -- какой моделью посчитано
  updated_at  TIMESTAMPTZ
)
CREATE INDEX ON article_embeddings USING hnsw (embedding vector_cosine_ops);
```

- Эмбеддинг считается при публикации (title + excerpt + первые ~2000 символов контента), пересчёт при редактировании
- Модель: мультиязычная (RU+EN важны — тикеры/новости на англ.), например multilingual-e5-large или аналог; финальный выбор под бюджет
- Поиск: гибридный = векторный (смысл) + полнотекстовый GIN (точные тикеры/названия)

Где используем:

1. **Поиск по сайту** — находит статьи по смыслу, а не по точному совпадению слов
2. **«Похожие статьи»** — на карточке статьи и на страницах тикера/компании/тренда (карусели станут умнее)
3. **Бот wptg** — перед публикацией: «похожие статьи уже есть?» → автоподсказка привязок (тикер/компания из похожих) + защита от дублей по смыслу
4. **RAG-ответы** — «что мы писали про роботакси Tesla?» с выдержками из своих статей

## 6. Стек и админка

### 6.1 Стек (решено 2026-11-06 — унификация со вторым проектом)

**Бэкенд**: Node.js 20, Express, TypeScript, PostgreSQL, bcrypt + JWT, node-cron, axios.
**Фронтенд**: React 19 + TypeScript, Vite, Tailwind CSS 3.4, shadcn/ui, Framer Motion, Lucide, React Router.

Важная поправка к схеме «SQLite dev / PostgreSQL prod» второго проекта: **здесь в dev тоже PostgreSQL** (Docker-контейнер) — иначе недоступны pgvector, полнотекстовый поиск и часть миграций.

**SSO со вторым проектом**: тот же подход (bcrypt + JWT). Детали (общий секрет/таблица пользователей vs отдельный auth-сервис) — решаем при интеграции, оба проекта Express, стыковка несложная.

### 6.2 Админка: варианты и рекомендация

Требование: админка нужна сразу, редактируется всё (контент, сущности, связи, сюжеты, пользователи).

| Вариант | Оценка |
|---|---|
| **Refine.dev** (рекомендация) | React-фреймворк для админок: тот же стек (React 19 + Vite + Tailwind + shadcn/ui), работает поверх нашего Express API. Таблицы/формы/фильтры/права из коробки, кастомные экраны — обычные React-страницы |
| AdminJS | Авто-CRUD из моделей, но проект устаревает, кастомизация ограничена |
| Directus | Готовая админка поверх Postgres, но другой стек, своя система прав, слабее встраивается |
| Payload CMS | Требует Next.js, у нас Vite SPA — не подходит |
| Своя с нуля | Отвергнуто: месяцы работы против дней |

**Обязательные экраны админки:**

1. Редактор статьи (rich-text, тип, slug, обложка, источник, статус, дата)
2. Привязки статьи — мультиселекты с автодополнением + **автоподстановка цепочки**: выбрал тикер SPCX → подставились компания SpaceX и индустрия SpaceTech
3. Конструктор сюжетов: хронология, главная статья, очередь автопредложений от эмбеддингов
4. Справочники: компании, тикеры, индустрии, тренды + словари (стадии, стратегии)
5. Медиатека
6. Редиректы и SEO-поля
7. Пользователи и роли (см. 6.3)
8. Аналитика просмотров

Открыто: отдельное приложение админки или защищённый раздел основного SPA (склоняюсь к отдельному Vite-приложению — проще права и деплой).

**Редактор статей (решено 2026-11-06): TipTap 3** — как в PULSE (`@tiptap/react` + starter-kit + table + image). Причины: выдаёт HTML в `articles.content_html` (паритет со схемой БД), открывает LLM-HTML из бота wptg без конвертации, один пакет для автора (site) и админки. Пайплайн: TipTap HTML → `sanitize-html` (теги p/h2/h3/ul/li/strong/a/img, защита от XSS и мусора) → БД; excerpt — plain-text из редактора или вручную.

### 6.3 Роли и доступ (решено 2026-11-06)

| Роль | Где работает | Что может |
|---|---|---|
| **super_admin** | админка | всё, включая пользователей и настройки |
| **admin** | админка | контент, сущности, сюжеты, справочники, медиатека, редиректы, SEO; не управляет пользователями |
| **author** | **сайт** (личный кабинет) | писать и редактировать СВОИ статьи, видеть статус модерации |
| reader | сайт | читать, закладки, подписки |

Ключевой нюанс: автор **регистрируется на сайте** (как обычный юзер), а не в админке. Значит:

- на фронтенде сайта нужен **упрощённый редактор статьи** для роли author (заголовок, текст, обложка, источник) — его статьи уходят в статус `draft`/`pending`
- привязки сущностей (тикер/компания/тренд) автору **не доверяем** — их выставляет admin в админке (либо LLM-категоризатор бота, либо автоподстановка цепочкой)
- связка с вторым проектом: регистрация единая, роль `author` присваивает admin
- `articles.author_id` уже в схеме — авторство привязываем к юзеру

### 6.4 Структура монорепозитория (npm workspaces)

```
investicionno_rf/
├── apps/
│   ├── api/                  # Express + TS: REST API, auth (JWT), cron-задачи
│   │   └── src/routes/       # /articles /companies /tickers /trends /stories ...
│   ├── web/                  # основной сайт: React 19 + Vite + Tailwind + shadcn/ui
│   │   └── src/pages/        # /:type/:slug /trend/:slug /kompaniya/:slug ...
│   └── admin/                # админка: Refine.dev поверх того же API
├── packages/
│   ├── db/                   # Drizzle ORM: схема (раздел 5), миграции, seed
│   │   └── migrations/       # SQL-миграции, pgvector-индексы
│   ├── shared/               # общие TS-типы, DTO, константы (роли, типы статей)
│   └── config/               # общие tsconfig, eslint
├── infra/
│   ├── docker-compose.yml    # PostgreSQL 16 + pgvector (dev-окружение)
│   └── docker/               # Dockerfile для api/web/admin
├── docs/
│   └── newinvesticionno.md   # этот документ
└── package.json              # workspaces: apps/*, packages/*
```

Решения:

- **npm workspaces** — одна установка зависимостей в корне, `packages/shared` подключается во все три приложения
- **ORM — Drizzle** (а не Prisma): SQL-first, нативная работа с pgvector и полнотекстовым поиском, миграции — обычные .sql
- **Миграции БД** — Drizzle-kit генерирует, плюс ручные SQL для векторных индексов
- **dev-окружение**: `docker compose up` → Postgres+pgvector на localhost:5432, `.env.example` в каждом app

## 7. PULSE — параллельный проект: стек, БД, вектора (изучено 2026-11-06)

Репозитории: `vladfa2010/pulse` (backend), `vladfa2010/pulse-frontend`. Локальные копии: `reference/pulse`, `reference/pulse-frontend` (в `.gitignore`, не коммитим).

### 7.1 Совпадение стека

Подтверждено по `TECH_STACK.md` (дата сверки 2026-10-27): Node 20 + Express 4 + TS 5.9, `pg` 8, bcrypt + jsonwebtoken, node-cron, axios; React 19 + Vite 6 + Tailwind 3.4 + shadcn-паттерны + Framer Motion 12 + Lucide, React Query 5, ECharts 6.

Отличия, которые важны нам:

- В PULSE **нет ORM** — сырые SQL-миграции `src/migrations/*.sql` + dual-mode SQLite/PG (`USE_SQLITE=true`). Наш Drizzle допустим (генерирует те же SQL-файлы, они коммитятся), но конвенцию «миграции в репо, ручные SQL-стражи для индексов» берём
- PULSE использует **HashRouter** — нам нужен **BrowserRouter** (SEO: чистые URL, 301-редиректы на nginx)
- Инфра PULSE: VPS 4 CPU / 6 ГБ, Docker Compose (Caddy, backend, PostgreSQL 18, TEI-эмбед), standby на Render. Redis в зависимостях, но не используется
- Полезное фронтенд-наследие: TipTap 3 (редактор), `react-helmet-async` (SEO-мета), sanitize-html, Playwright/Vitest

### 7.2 Векторный контур PULSE — переносимые решения

- **Модель: Qwen3-Embedding-0.6B, dim 1024** — совпадает с нашей схемой `vector(1024)`. Сервер: TEI (text-embeddings-inference) в отдельном контейнере, внутренняя сеть `http://embeddings:80`
- **Синергия: оба проекта могут делить один TEI-контейнер** на одном VPS
- Клиент (`services/embeddings.ts`): единый для всех продюсеров; **node:http с keep-alive, НЕ fetch** (undici `headersTimeout 300 с` убивает долгие инференсы — заголовки TEI отдаёт после инференса); `stripLoneSurrogates()` — TEI/serde отклоняет битый Unicode; батч ≤32, бэкфилл батч ≤8; таймауты: реалтайм 8–15 с, бэкфилл 600 с
- Формат текста: `title + ' ' + COALESCE(summary, '')`, обрезка 1000 символов
- Индексы: HNSW создаётся **вручную после бэкфилла** + `ANALYZE` (миграция-страж), не в потоке бэкфилла
- Ресурсы TEI: warmup-спайк ~4.1 ГБ RAM; финальная конфигурация RAYON=1, cpus 1.5, mem 4500m на 4 CPU / 6 ГБ; одиночный embed 4–6 с
- Ограничение: релевантность 0.6B на редких русских запросах умеренная (sim ~0.6, англоязычные хиты) — если будет больно, апгрейдить модель

### 7.3 Гибридный поиск PULSE (ТЗ-161/163/213/214/215)

- Точная ветка: ILIKE word-AND первым разделом выдачи; **ловушка**: JS-регулярка `\W` — ASCII-only, съедает кириллицу; правильно `[^\p{L}\p{N}]`
- Семантика: kNN HNSW топ-50, скор = косинус + **буст свежести** (+0.10 ≤14 сут, +0.05 ≤90 сут), дедуп vs exact, фиксированный блок «20 лучших» без пагинации
- TEI недоступен → молчаливый фолбэк: exact на месте, `semantic: null` (не валить запрос)
- Тем же query-вектором ищутся смежные сущности (у них курсы/уроки, у нас — компании/тикеры/тренды)

### 7.4 Каскады PULSE → нашим «Сюжетам»

У PULSE пирамида: **КАСКАД** (часы–сутки, авто) → **СЮЖЕТ** (дни–недели, группировка каскадов LLM) → **ТЕМА** (недели–месяцы, ночной HDBSCAN). Реалтайм-кластеризация с трёхзонной склейкой:

- sim ≥ 0.80 → авто-склейка без LLM
- 0.55–0.80 → серая зона → LLM-верификатор (max 3 попытки, отказ → следующий кандидат)
- < 0.55 → одиночка; **числовое вето**: разные значимые числа в заголовках → не клеить («763 беспилотника» ≠ «258»)
- Окно кандидатов 48 ч, GAP кластера 36 ч, advisory lock против гонок ingest↔cron

Урок для нас: наш «Сюжет» (решение раздела 6) можно строить **полуавтоматически** по той же трёхзонной логике — автоматика предлагает привязку, редактор подтверждает. Авторский контур остаётся главным, как и решили.

### 7.5 Документация как практика

У PULSE доки живут в репозитории: `TECH_STACK.md` с правилом «меняешь зависимость → правишь файл тем же коммитом», `embeddings.md` с хронологией инцидентов, методология каскадов в корне. Берём как стандарт — наш `docs/newinvesticionno.md` уже ведётся так же.

## 8. Дубли: анализ и решения

### Слой 1. Дубли сущностей (проверено вживую 2026-11-06)

| Что | Таксономия-архив | CPT-лендинг | Разница |
|---|---|---|---|
| Тренд | `/trend/kosmos/` — автоархив, ~6.7 тыс. симв. | `/trends/kosmos/` — лонгрид ~11.9 тыс. симв., H1, редакционные секции | два URL об одном |
| Компания | `/kompaniya/` — 73 архива | `/kompaniya-p/` — только 5 карточек (Amazon, Anthropic, Alibaba, B2B-RTS, 1X) | неполный дубль |

**Решение**: слить в одну сущность. `trends` = {slug, name, лонгрид description, статус} — одна страница показывает и лонгрид, и выборку статей. То же с `companies`. Дубль-URL → 301.

### Слой 2. Дубли классификации

Рубрики `novosti`, `sobytie`, `analitika-r`, `interesnoe`, `ideya` один в один дублируют типы записей (бот wptg определяет CPT именно по рубрике). Одна классификация в двух местах → вечный рассинхрон.

**Решение**: у статьи одно поле `type`. Судьба редакционных рубрик (`pipeline`, `case`, `startup-of-the-month`) — на обсуждении (вопрос 2 ниже).

### Слой 3. Контентные дубли (серии)

Одно событие = серия статей разных типов (SpaceX IPO — ≥5 материалов; «Прометей» — 3+). SEO-каннибализация, пользователю разрозненно.

**Решение (принято 2026-11-06)**: вводим сущность **«Сюжет» (story)** — объединяет статьи про одно событие. Схема в разделе 5.1.

- Страница сюжета `/syuzhet/{slug}/`: лента статей в хронологии + каноническая статья
- На страницах статей — блок «развитие сюжета» (хронология серии)
- `primary_article_id` — каноническая статья для SEO (остальные страницы серии отдают canonical на неё при необходимости)
- Автоподсказка привязки через векторную близость: бот предлагает «похоже на сюжет X — привязать?», фиксируется `added_via='vector'`, редактор подтверждает/меняет
- При миграции: существующие серии (SpaceX IPO, «Прометей» и т.п.) собираем вручную + подсказка эмбеддингами

### Слой 4. URL-дубли при миграции

- `/trends/X/` → 301 на `/trend/X/`
- `/kompaniya-p/X/` → 301 на `/kompaniya/X/`

### Вопросы на решение

- [ ] Канонический URL трендов: `/trend/` (предложение) или `/trends/`
- [ ] Редакционные подборки (`pipeline`, `портфель`, `архив`, `case`, `startup-of-the-month`) — сохраняем как систему или убираем?
- [x] Сюжеты: вводим сущность «Сюжет» с автоподсказкой через эмбеддинги (решено 2026-11-06)

## 9. Открытые вопросы

- [x] Стек новой платформы: **унификация со вторым проектом** (Node 20 + Express + TS + PostgreSQL, React 19 + Vite + Tailwind + shadcn/ui). Решено 2026-11-06, раздел 6.1
- [ ] SSO со вторым проектом — каким протоколом (общая БД пользователей / OAuth)
- [ ] SEO-миграция: решено сохранять URL один в один (вариант 1), fallback — таблица 301-редиректов. Детали в разделе 10
- [ ] Что делать с Ultimate Member (миграция пользователей/закладок)
- [ ] Монетизация: клуб «Инсайдер», курс, консультации — как переносим
- [ ] Картинки: OG-fallback vs своя генерация обложек

## 10. SEO и сохранение URL при переезде

**Решение: сохранить URL один в один (вариант 1).**

Текущая структура URL не привязана к WordPress и легко воспроизводится на любой платформе:

- Статьи: `/novost/slug/`, `/analitika/slug/`, `/interesnoe/slug/`, `/sobytie/slug/` (slug — транслит латиницей, без дат и ID)
- Архивы: `/trend/kosmos/`, `/kompaniya/spacex/`, `/tiker/nvda/`, `/industriya/ai/`, `/category/ideya/`

Что делать:

1. Полная выгрузка всех сущностей со slug'ами (статьи, тренды, компании, тикеры, индустрии, рубрики) — из дампа БД, sitemap как запасной источник
2. В новой БД — поле `slug` у каждой сущности; маршруты строятся детерминированно, без таблицы соответствий
3. Склейка существующих дублей: `trend` vs `trends` (два «Космоса»), `kompaniya` vs `kompaniya-p` — один канонический URL, второй → 301
4. Fallback: если какой-то путь всё же меняется — таблица 301-редиректов (~520 URL), один шаг, без цепочек
5. Сохранить: trailing slash, meta description, canonical (поля Yoast переносим)
6. Домен не меняется → «переезд сайта» в Search Console не нужен

## 11. Лог изучения

| Дата | Что сделано |
|---|---|
| 2026-11-06 | Сайт был недоступен из сети (ping 100% loss), позже поднялся. Изучена главная, sitemap (21 подкарта, ~520 URL), REST API (типы, таксономии), страницы статьи/компании/тренда, связи статей с терминами |
| 2026-11-06 | Изучен репозиторий wptg: README, TZ.md, код (bot.py 953 строки, services/*) |
| 2026-11-06 | Зафиксирована стратегия SEO, добавлена детальная схема БД с векторным поиском (раздел 5) |
| 2026-11-06 | Разбор дублей в 4 слоях (раздел 6): сравнение вживую /trend/ vs /trends/, /kompaniya/ vs /kompaniya-p/; вынесены 3 вопроса на решение |
| 2026-11-06 | **Решено: вводим сущность «Сюжет»** (stories + article_stories в схеме БД, раздел 5.1), URL /syuzhet/{slug}/, автоподсказка привязки через эмбеддинги |
| 2026-11-06 | **Стек решён** — унификация со вторым проектом (раздел 6.1). Разобраны варианты админки, рекомендация — Refine.dev поверх нашего Express API (раздел 6.2) |
| 2026-11-06 | **Роли решены**: super_admin / admin / author / reader. Автор регистрируется на сайте → упрощённый редактор во фронтенде, привязки сущностей только через админку (раздел 6.3) |
| 2026-11-06 | Инициализирован локальный git-репозиторий. Добавлена структура монорепозитория: npm workspaces, apps/api + web + admin, packages/db (Drizzle) + shared, infra/docker (раздел 6.4) |
| 2026-11-06 | **Прототип работает локально**: Homebrew Postgres 17 + pgvector 0.8.7 (Docker на машине нет — заменён локальной БД, compose оставлен для сервера). Схема Drizzle (27 таблиц) → миграция применена → смоук-тест зелёный (npm run db:smoke) |
| 2026-11-06 | Изучены репозитории PULSE (backend + frontend). Раздел 7: совпадение стека, TEI + Qwen3-Embedding-0.6B (dim 1024 = наш выбор), гибридный поиск, трёхзонная кластеризация каскадов → идеи для Сюжетов. Репозитории склонированы в reference/ (.gitignore) |
| 2026-11-06 | Сверен TECH_STACK.md с package.json обоих репозиториев — факт совпадает. Фронтенд-наследие для apps/web: TanStack Query 5, TipTap 3, react-helmet-async, ECharts, Vitest/Playwright, DESIGN_SYSTEM.md как основа визуальной семьи |
| 2026-11-06 | **apps/api работает**: Express + JWT + bcrypt, роли super_admin/admin/author/reader (раздел 6.3). Эндпоинты: register/login, список/просмотр статей (публично — только published), author → draft, публикация — admin. Сквозные curl-тесты пройдены. Запуск: npm run seed -w @newinvest/api, dev: npm run dev -w @newinvest/api |
| 2026-11-06 | **Граф знаний в API**: карточки /companies/:slug (тикеры+индустрии+статьи), /trends/:slug (лендинг), /stories/:slug (хронология), автодополнение /tickers?q=. Привязки: PUT /articles/:id/relations (транзакционно), автоподстановка цепочки GET /articles/:id/bindings-suggest (тикер→компания→индустрия) — протестировано end-to-end |
| 2026-11-06 | **Предметная модель «венчурный портфель»** (раздел 4.1): тренд→идея→компания→пайплайн сделки→архив; идея может быть без компаний. Миграция 0001: articles.thesis, companies.one_liner/logo_media_id/founded_year |
| 2026-11-06 | **Питчбук-лайт**: миграция 0002 `funding_rounds` (раунды, post-money оценка, инвесторы TEXT[], обязательный source_url). API: раунды в карточке компании, POST для admin. Принцип 4.3: «показываем только внесённое», 400 без источника. Тесты пройдены |
