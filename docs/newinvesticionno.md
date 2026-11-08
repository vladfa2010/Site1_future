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

### 1.1 Конкурентная карта: PitchBook и аналоги (2026-11-06)

| Сервис | Отличие | Цена |
|---|---|---|
| **PitchBook** | Эталон глубины: раунды, post-money оценки, cap tables, мультиплы, фонды LP/GP; analyst-verified | от ~$100K/год, quote-based |
| **Crunchbase** | Crowdsourced: шире, но поверхностнее и менее точно; лучший для быстрого дискавери | Pro ~$49/мес |
| **Tracxn** | Analyst-verified как PB, дешевле; силён в индустриях/трендах | средний сегмент |
| **CB Insights** | Аналитика и market maps, «радары трендов» — ближе всего к медиа-формату | enterprise |
| **Dealroom** | Европейский PB, точнее всех по европейским раундам | enterprise |
| **S&P Capital IQ Pro** | Институциональные финансы, ownership, comps, Excel-плагин | $30K+/год |
| **Grata** | Семантический поиск по private middle market | enterprise |
| **ZoomInfo / LinkedIn / Orbis** | Смежные: sales-data, живой headcount, владения | — |
| **СПАРК, Контур.Фокус** (РФ) | Юрлица, госзакупки — не про венчур | — |

**Вывод: наша ниша свободна.** Все игроки — либо сухие базы данных без редакции и мнения, либо аналитика без портфеля идей. Формата «медиа + граф знаний + карточки компаний с оценками + тезисы идей + пайплайн сделок» на русском рынке нет.

Что заимствовать: у PB — таблицу раундов и график оценок (делаем); у CB Insights — радары трендов (наши `trends` со статусами); у Crunchbase — блок «похожие компании» (выборка из графа); у Tracxn — иерархические индустрии; у Grata — семантический поиск (гибрид из 7.3).

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
                                        -- interesnoe | ideya | video → /{type}/{slug}/
  slug          TEXT NOT NULL,
  title         TEXT NOT NULL,
  content_html  TEXT NOT NULL,
  excerpt       TEXT,
  thesis        TEXT,                   -- тезис идеи (для type='ideya')
  source_url    TEXT,                   -- дедупликация (как в wptg)
  video_url     TEXT,                   -- type='video': внешнее видео (embed)
  cover_media_id INT REFERENCES media(id),
  author_id     INT REFERENCES users(id),
  status        TEXT DEFAULT 'draft',   -- draft | pending | published
  access_level  TEXT DEFAULT 'public',  -- пейволл: public | auth | tariff
  access_tariff_id INT REFERENCES tariff_plans(id),
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
-- ВАЖНО: словари project_stages/strategies/market_classes существуют, но junction-таблицы
-- к статьям НЕ заводили — привязки только через компании/тренды/индустрии (решение 2026-11-08)

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
  avatar TEXT,                                      -- эмодзи из пресета (10 шт)
  tariff_id INT REFERENCES tariff_plans(id),        -- пейволл: тариф юзера
  tariff_expires_at TIMESTAMPTZ,                    -- null = бессрочно
  old_wp_id INT,                                    -- миграция из Ultimate Member
  created_at
)
bookmarks (                        -- закладки (было в UM)
  user_id, article_id, created_at,
  PRIMARY KEY (user_id, article_id)
)
subscriptions (                    -- подписка на тикер/компанию/тренд/индустрию/идею
  user_id, entity_type TEXT,        -- ticker | company | trend | industry | article
  entity_id INT, created_at,
  PRIMARY KEY (user_id, entity_type, entity_id)
)

-- Пейволл и тарифы (модель PULSE PAYMENTS.md §3.1)
tariff_plans (
  id, slug TEXT UNIQUE, name, description,
  price_monthly NUMERIC, price_yearly NUMERIC, yearly_discount INT,
  features JSONB,              -- {telegram,email,aiSummary,earlyAccess,...}
  is_active BOOL, coming_soon_label TEXT, sort_order INT,
  created_at, updated_at
)
features_registry (               -- реестр фич для тогглов в админке
  id TEXT PRIMARY KEY, label, description,
  is_active BOOL, integration_status TEXT, created_at, updated_at
)

-- Уведомления и интеграции
notification_settings (           -- 1:1 к users
  user_id PRIMARY KEY, email_daily BOOL, email_weekly BOOL,
  last_daily_sent_at, last_weekly_sent_at
)
tg_bindings (user_id PRIMARY KEY, chat_id BIGINT, tg_username, connected_at)
tg_link_codes (code TEXT PRIMARY KEY, user_id, expires_at)  -- одноразовые deep-link коды
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

### 5.5 Векторный поиск (pgvector — без отдельного сервиса) — РЕАЛИЗОВАН 2026-11-07

```sql
CREATE EXTENSION vector;

article_embeddings (
  article_id  INT PRIMARY KEY REFERENCES articles(id) ON DELETE CASCADE,
  embedding   VECTOR(1024),         -- под Moonshot embeddings (1024-мерные)
  model       TEXT,                 -- какой моделью посчитано (миграции моделей без пересчёта)
  updated_at  TIMESTAMPTZ
)
CREATE INDEX ON article_embeddings USING hnsw (embedding vector_cosine_ops);

-- Полнотекстовый слой: tsvector GENERATED ALWAYS (russian-стемминг:
-- title + thesis + excerpt + content без HTML) + GIN (миграция 0012)
```

- **Гибридный поиск** (`GET /api/search?q=&mode=auto|fts|vector`): FTS (ts_rank, websearch_to_tsquery russian) + косинусное расстояние pgvector, слияние **RRF** (k=60); векторная часть включается при заданном ключе и наличии эмбеддингов, иначе честный FTS; пейволл соблюдается (accessCondition); лимит 20/мин
- **Бэкфилл**: `npm run embed -w @newinvest/db` (батчи 20, идемпотентно, --force; требует MOONSHOT_API_KEY + MOONSHOT_EMBED_MODEL или настройки из /kimi)
- **Авто-пересчёт при публикации** — в бэклоге
- Модель: Moonshot embeddings (настраивается в админке /kimi), 1024-мерная под колонку vector(1024)

Где используем:

1. **Поиск по сайту** — находит статьи по смыслу, а не по точному совпадению слов
2. **«Похожие статьи»** — на карточке статьи и на страницах тикера/компании/тренда (карусели станут умнее)
3. **Бот wptg** — перед публикацией: «похожие статьи уже есть?» → автоподсказка привязок (тикер/компания из похожих) + защита от дублей по смыслу
4. **RAG-ответы** — «что мы писали про роботакси Tesla?» с выдержками из своих статей

## 6. Стек и админка

### 6.1 Стек (решено 2026-11-06 — унификация со вторым проектом)

**Бэкенд**: Node.js 20, Express, TypeScript, PostgreSQL, bcrypt + JWT, node-cron (HTTP — fetch/node:http, axios нет)
**Фронтенд**: React 19 + TypeScript, Vite, Tailwind CSS 3.4, shadcn/ui, Framer Motion, Lucide, React Router.

Важная поправка к схеме «SQLite dev / PostgreSQL prod» второго проекта: **здесь в dev тоже PostgreSQL** (Docker-контейнер) — иначе недоступны pgvector, полнотекстовый поиск и часть миграций.

**SSO со вторым проектом**: тот же подход (bcrypt + JWT). Детали (общий секрет/таблица пользователей vs отдельный auth-сервис) — решаем при интеграции, оба проекта Express, стыковка несложная.

### 6.2 Админка: варианты и рекомендация

Требование: админка нужна сразу, редактируется всё (контент, сущности, связи, сюжеты, пользователи).

| Вариант | Оценка |
|---|---|
| **Refine.dev** | Рекомендован ранее, но при старте выяснилось: ценность Refine (авто-CRUD из моделей) нивелируется нашим кастомным API (скринер, транзакционные привязки, автоподстановка цепочки) — data provider пришлось бы писать руками в любом случае. **Отложен**, не отменён: если кастомная админка разрастётся — вернёмся (2026-11-06) |
| Своя компактная админка (реализовано) | Один день работы, полный контроль, тот же стек. apps/admin: статьи (список/редактор/публикация), привязки с кнопкой «Подставить цепочку», компании (карточка+индустрии), тренды (лонгрид), индустрии/тикеры |
| AdminJS | Авто-CRUD из моделей, но проект устаревает, кастомизация ограничена |
| Directus | Готовая админка поверх Postgres, но другой стек, своя система прав, слабее встраивается |
| Payload CMS | Требует Next.js, у нас Vite SPA — не подходит |
| Своя с нуля «большая» | Отвергнуто: месяцы работы против дней |

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

### 6.4 Структура монорепозитория (npm workspaces) — актуально на 2026-11-07

```
investicionno_rf/
├── apps/
│   ├── api/                  # Express + TS: REST API, auth (JWT + роли), все роуты
│   │   └── src/routes/       # auth, articles, entities, stories, bindings, screener,
│   │                         # media (+generate-text), admin (users/redirects/stats),
│   │                         # market (MOEX ISS), cabinet (favorites/subscriptions/feed/
│   │                         # tg-link/propose), features, search (hybrid FTS+
│   │                         # vector), kimiSettings
│   │   └── src/services/     # mediaGen (обложки), textGen (лиды/SEO, персоны editor|seo),
│   │                         # embeddings (Moonshot /embeddings), kimiSettings (ключ+модели
│   │                         # из meta_fields, кэш), digest+email (Resend), telegram
│   │                         # (polling), marketData (MOEX)
│   │   └── src/middleware/   # auth (JWT, alg pinning), security (заголовки, CORS, лимиты)
│   │   └── src/seed*.ts      # seed (super_admin), seed-test (test admin)
│   ├── web/                  # основной сайт: React 19 + Vite + Tailwind (порт 5173)
│   │   └── src/pages/        # главная (карусели), статья, компания, тренд, сюжет,
│   │                           # скринер /portfolio, архивы типов, /search, /pricing,
│   │                           # /cabinet (избранное/подписки/лента/настройки уведомлений),
│   │                           # /propose, /privacy, /terms, StaticPage, AuthModalOpener
│   │   └── src/components/   # Carousel, CoverThumb (3:4), ArticleCard, IdeaCard(+IdeaChart),
│   │                           # EntityChips, RoundsTable, Layout, Breadcrumbs, AuthModal
│   │                           # (1:1 PULSE), Paywall, FavoriteButton, SubscribeButton,
│   │                           # TelegramConnect, Avatar (пресет 10)
│   └── admin/                # админка: React + Tailwind (порт 5174)
│       └── src/pages/        # статьи (+редактор), компании, тренды, индустрии, тикеры,
│       │                       # сюжеты, медиатека, редиректы, пользователи, тарифы,
│       │                       # фичи, аналитика, /kimi (настройки API)
│       └── src/components/   # RichTextEditor (TipTap, лениво), PreviewModal (десктоп/
│                               # планшет/мобайл+масштаб), MediaPickerModal (выбор обложки
│                               # из медиатеки), EntityCloud (облака тегов: дроплист+создание
│                               # по Enter), SearchInput (дебаунс), Layout
├── packages/
│   ├── db/                   # Drizzle ORM: схема (раздел 5), миграции 0000–0013,
│   │   └── src/migrate-wp.ts # импорт контента с донора (WP REST API)
│   │   └── src/embed.ts      # бэкфилл эмбеддингов (npm run embed)
│   ├── shared/               # (зарезервировано) общие TS-типы, DTO, константы
│   └── config/               # (зарезервировано) общие tsconfig, eslint
├── infra/
│   ├── docker-compose.yml    # PostgreSQL + pgvector (для сервера; локально — Homebrew PG)
│   └── docker/               # Dockerfile для api/web/admin
├── scripts/
│   └── e2e.sh                # E2E-сьют (123 проверки: auth, админка, юзер-сценарии, поиск,
│                             # безопасность) — API_URL=http://localhost:4000 bash scripts/e2e.sh
├── reference/                # локальные копии репозиториев PULSE (в .gitignore)
├── docs/
│   └── newinvesticionno.md   # этот документ
└── package.json              # workspaces: apps/*, packages/*; npm run dev = api+web+admin
```

Решения:

- **npm workspaces** — одна установка зависимостей в корне; приложения зависят только от `@newinvest/db` (packages/shared и packages/config — пустые-заготовки, типы дублируются)
- **ORM — Drizzle** (а не Prisma): SQL-first, нативная работа с pgvector и полнотекстовым поиском, миграции — обычные .sql
- **Миграции БД** — Drizzle-kit генерирует (`npm run db:generate`), применяются `npm run db:migrate`
- **dev-окружение**: локально Homebrew Postgres 17 + pgvector (Docker на машине нет); на сервере — docker-compose
- **Три приложения на трёх портах**: api :4000 (проксируется через /api), web :5173, admin :5174

### 6.5 Состояние прототипа и запуск (2026-11-07)

**Построено:**

| Слой | Что | Статус |
|---|---|---|
| `packages/db` | Схема 29+ таблиц (раздел 5), миграции 0000–0013 (FTS search_tsv + pgvector + video_url), смоук-тест pgvector | ✅ |
| `apps/api` | JWT-авторизация, роли (super_admin/admin/author/reader); статьи (CRUD+публикация+возврат в черновик, paywall public/auth/tariff); граф знаний + привязки + автоподстановка цепочки; скринер; раунды; тарифы (каталог+фичи, из PULSE); поиск гибридный FTS+vector (RRF); генерация: обложки (Kimi Images), тексты/лиды/SEO (Chat Completions, персоны), эмбеддинги; email-дайджесты (Resend: день 20:00 + недельный вс 20:00); TG-контур (deep-link + polling + дайджесты); настройки Kimi API из БД (super_admin-only, baseUrl allowlist); аудит безопасности 3 раунда: пентест, white-box, финальный лид — пейволл на всех контурах, scoped trust proxy, http(s)-URL, admin-TTL 12ч, bcrypt 12, seed-гварды | ✅ |
| миграция контента | 306 статей, 73 компании, 24 тикера, 26 индустрий, 16 трендов, связи (383/118/366/334) | ✅ |
| `apps/web` | Главная как у донора (палитра чёрный #000 + лайм #beff00), статья (thesis, чипсы, график MOEX при «Торги на бирже», breadcrumbs), тренд-лендинг, сюжет-хронология, скринер, **/search** (гибридный, бейдж «векторный+текстовый»), /pricing (тарифы из БД), /cabinet (избранное, подписки→лента, настройки уведомлений email/TG, удаление аккаунта), AuthModal 1:1 PULSE, «Предложить идею» | ✅ |
| `apps/admin` | Все экраны: статьи (TipTap, авто-slug, обложка — генерация/загрузка/выбор из медиатеки, привязки EntityCloud с созданием по Enter, генерация лида и SEO-description, превью десктоп/планшет/мобайл, публикация/возврат в черновик, paywall-уровни), компании, тренды, индустрии, тикеры, сюжеты, медиатека, редиректы, пользователи (роли), тарифы, фичи, аналитика, **настройки Kimi API** (/kimi) | ✅ |
| E2E | scripts/e2e.sh — 123 проверки (реестр механик — раздел 6.6), зелёные | ✅ |

**Запуск с нуля:**

```bash
npm install
createdb newinvest && psql -d newinvest -c "CREATE EXTENSION vector;"
echo "DATABASE_URL=postgres://$(whoami)@localhost:5432/newinvest" > .env
npm run db:migrate                      # применить схему
npm run seed -w @newinvest/api          # супер-админ admin@local.dev / admin123
npm run seed:test -w @newinvest/api     # тестовый админ test@test.ru / test
npm run db:migrate:wp                   # контент с донора (опционально, ~30 с)
npm run dev                             # api :4000 + web :5173 + admin :5174
API_URL=http://localhost:4000 bash scripts/e2e.sh   # E2E-регрессия (123 проверки)
# векторный поиск после ввода ключа в /kimi:
MOONSHOT_API_KEY=… MOONSHOT_EMBED_MODEL=… npm run embed -w @newinvest/db
```

**Известные ограничения (бэклог):**

- [ ] Обложки — hotlink с донора; скачать в медиатеку при переносе на прод
- [x] ~~Редактор контента — textarea HTML~~ → TipTap 3 (e00657f)
- [x] ~~Эмбеддинги не считаются (нужен TEI + Qwen3)~~ → контур на Moonshot embeddings: таблица article_embeddings + FTS search_tsv (миграция 0012), бэкфилл `npm run embed`, гибридный поиск с RRF (47cbe0e); авто-пересчёт при публикации — не подключён
- [x] ~~Сюжеты — автопредложения через эмбеддинги~~ → появится после бэкфилла эмбеддингов (косинусная близость готова в smoke.ts)
- [ ] Панель «куда дальше» на странице статьи (related через эмбеддинги)
- [ ] SSO со вторым проектом; бот wptg не переподключён к новому API
- [ ] Редиректы 301 и SEO-поля: таблицы есть, наполнение — при переезде
- [ ] `packages/shared` и `packages/config` — пустые (типы дублируются между web/admin)
- [ ] Бэклог безопасности «первый месяц» (аудиты раундов 2–3, вердикт лида: не блокируют запуск): SSO одноразовый код вместо ?auth=, смена пароля, аудит-лог admin-мутаций, CSP на фронтах + HSTS, per-account login-лимит, верификация email + one-click unsubscribe, квота на propose, шифрование kimi_api_key at-rest. Позже: tokenVersion/отзыв JWT, httpOnly-cookie, article_views retention

### 6.6 Реестр механик и покрытие E2E (2026-11-08)

Полный список механик платформы. Каждая — минимум один тест в `scripts/e2e.sh` (123 проверки, `API_URL=http://localhost:4000 bash scripts/e2e.sh`).

**Авторизация и роли**

| Механика | Эндпоинт | Тест |
|---|---|---|
| Логин (JWT), неверный пароль 401 | POST /auth/login | ✅ |
| Регистрация, email/username case-insensitive 409 | POST /auth/register | ✅ |
| Политика паролей (2 класса символов) | POST /auth/register | ✅ |
| Профиль по токену | GET /auth/me | ✅ |
| Удаление аккаунта (транзакция, токен отзывается) | DELETE /auth/me | ✅ |

**Статьи и контент**

| Механика | Эндпоинт | Тест |
|---|---|---|
| CRUD, PATCH, публикация/возврат в черновик | /articles | ✅ |
| Дубль (type,slug) → 409 (не падение 500) | POST /articles | ✅ |
| Автор не публикует напрямую; автор правит только свои draft | POST/PATCH /articles | ✅ (частично — e2e-юзер author) |
| Предложить материал (reader→author upgrade) | POST /articles/propose | ✅ |
| Пейволл public/auth/tariff + просроченный тариф 403 | GET /articles/:type/:slug | ✅ |
| Пейволл на ВСЕХ выборках: скринер, /feed, дайджесты (тариф из БД), поиск FTS+vector, events | /screener, /feed, digest | ✅ (аудиты 3 раундов) |
| Привязки к графу (PUT), автоподстановка цепочки | /articles/:id/relations, /bindings-suggest | ✅ |
| Материалы по идее (?type=), валидация типа 400 | GET /articles/:id/events | ✅ |
| SEO meta description (meta_fields) | POST/PATCH /articles | ✅ (при создании) |

**Граф знаний**

| Механика | Эндпоинт | Тест |
|---|---|---|
| CRUD компаний/трендов/индустрий/тикеров | /companies /trends /industries /tickers | ✅ |
| Автодополнение тикеров | GET /tickers?q= | ✅ |
| Редактирование карточек (PATCH company/trend) | PATCH /companies/:id, /trends/:id | ✅ |
| Раунды финансирования, source_url обязателен 400 | POST /companies/:id/rounds | ✅ |
| Сюжеты: состав + главная статья | /stories | ✅ |
| Скринер: фазы, стадии, индустрии | /screener, /deal-phases, /deal-stages | ✅ |

**Кабинет пользователя**

| Механика | Эндпоинт | Тест |
|---|---|---|
| Избранное: add/list/keys/delete, невалидный тип 400 | /favorites | ✅ |
| Подписки: trend/company/ticker/industry/article | PUT/GET/DELETE /subscriptions | ✅ |
| Персональная лента по подпискам (вкл. идеи) | GET /feed | ✅ |
| Настройки уведомлений email daily/weekly | PUT/GET /notification-settings | ✅ |
| Аватар из пресета | PUT /avatar | ✅ |
| Telegram-контур: статус, deep-link 503 без бота, disconnect | /telegram/* | ✅ |

**Админка**

| Механика | Эндпоинт | Тест |
|---|---|---|
| Пользователи: смена роли (только super_admin), 403 | PATCH /users/:id | ✅ |
| Редиректы SEO-миграции: CRUD, список | /redirects | ✅ |
| Тарифы: создание (NUMERIC строкой), PATCH, публичный список | /tariff-plans | ✅ |
| Фичи: публичный список, админ-тоггл isActive | /features, /admin/features | ✅ |
| Аналитика просмотров | GET /admin/stats/views + фиксация при открытии статьи | ✅ |
| Ручной запуск дайджестов | POST /admin/notifications/send | ✅ |
| Настройки Kimi: GET/POST, маскирование ключа, 401/403 | /admin/kimi-settings | ✅ |

**Генерация и медиа**

| Механика | Эндпоинт | Тест |
|---|---|---|
| Обложки через Kimi/mock-заглушка | POST /media/generate | ✅ |
| Лиды/SEO-тексты: персоны editor/seo, mock-флаг | POST /media/generate-text | ✅ |
| Загрузка файлов: magic bytes (подделка 400) | POST /media/upload | ✅ |
| Медиатека: список | GET /media | ✅ |

**Поиск и котировки**

| Механика | Эндпоинт | Тест |
|---|---|---|
| Гибридный поиск FTS+vector, RRF; mode=fts; пейволл | GET /search | ✅ |
| Валидация запроса (min 2 chars) | GET /search | ✅ |
| График MOEX ISS + fallback без дат; не-MOEX 404 | GET /market/chart | ✅ |

**Безопасность**

| Механика | Тест |
|---|---|
| CORS: allowlist origin'ов, чужой 403; в проде CORS_ORIGINS только punycode (Origin браузера всегда xn--) | ✅ |
| Security headers (X-Frame-Options и др.) | ✅ |
| Anon 401 на защищённых роутах (users, relations, admin/*, features) | ✅ |
| Non-super 403 на смене ролей и kimi-settings | ✅ |
| Rate limiting: login 10/15мин, search 20/мин, генерация 30-60/час; trust proxy scoped (loopback/linklocal/uniquelocal — за Caddy реальный IP) | ⚠️ in-memory, не тестируется автоматически |
| XSS-саинтизация контента (sanitize-html на фронте) | ⚠️ фронт, не покрыто curl-тестами |
| JWT: alg pinning HS256, TTL 12ч (admin) / 7д (юзер) | ✅ (e2e: admin TTL = 43200с) |

Легенда: ✅ — автотест в scripts/e2e.sh; ⚠️ — проверено код-ревью/вручную, автотест не писать (in-memory состояние, фронт-рендер или уже покрыто аудитом).

## 7. PULSE — параллельный проект: стек, БД, вектора (изучено 2026-11-06)

Репозитории: `vladfa2010/pulse` (backend), `vladfa2010/pulse-frontend`. Локальные копии: `reference/pulse`, `reference/pulse-frontend` (в `.gitignore`, не коммитим).

### 7.1 Совпадение стека

Подтверждено по `TECH_STACK.md` (дата сверки 2026-10-27): Node 20 + Express 4 + TS 5.9, `pg` 8, bcrypt + jsonwebtoken, node-cron (axios заявлен в PULSE, у нас нет); React 19 + Vite 6 + Tailwind 3.4 + shadcn-паттерны + Framer Motion 12 + Lucide, React Query 5, ECharts 6.

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
| 2026-11-06 | **apps/web скелет собран**: React 19 + Vite + Tailwind + BrowserRouter + TanStack Query. Страницы: лента по типам, статья (thesis + чипсы-сущности из нового публичного relations в API), компания (профиль + RoundsTable по наличию), тренд, сюжет-хронология, портфель. Раздел 1.1 — конкурентная карта. Build + смоук через прокси зелёные |
| 2026-11-06 | **Миграция контента с донора** (migrate-wp.ts, WP REST API): 306 статей текстом + 73 компании + 24 тикера + 26 индустрий + 16 трендов + фазы/стадии; карточки kompaniya-p (5) и лендинги trends (6) слиты в description; обложки URL в media. Связи: 383/118/366/334 (компании/тикеры/индустрии/тренды), цепочки выведены по совместной встречаемости. Идемпотентно |
| 2026-11-06 | **Скринер проектов**: /api/screener?phase&stage&industry (идеи с бейджами), словари /deal-phases, /deal-stages; web /portfolio — фильтры в URL, карточки с бейджами стадий/индустрий. Тесты: portfel=19, pre-IPO=15, portfel+pre-IPO=10, ai=14 |
| 2026-11-06 | **apps/admin — админка** (порт 5174): статьи (список/редактор/публикация), привязки с «Подставить цепочку», компании (карточка+индустрии), тренды, справочники. Guard по роли admin. Refine.dev отложен (6.2, с причиной). Логин test@test.ru/test |
| 2026-11-06 | **Генерация обложек**: POST /api/media/generate (Kimi Images API; без ключа — фирменная SVG-заглушка), файлы в uploads/, статика /uploads, обложка сразу вешается на статью; в редакторе админки — кнопка «✨ Сгенерировать обложку» с редактируемым промптом из контекста статьи. Ловушка: рантайм Kimi Work экспортирует свои KIMI_API_KEY/KIMI_BASE_URL в дочерние процессы → используем MOONSHOT_* |
| 2026-11-06 | Документация синхронизирована с кодом: 6.4 (routes/media, services/mediaGen), 6.5 (генерация в «построено»), правка баннера ошибки загрузки главной (commit 28258f7) |
| 2026-11-06 | **Админка доведена до полного покрытия 6.2**: сюжеты (конструктор состава + главная статья), медиатека (сетка + загрузка), редиректы CRUD, пользователи (смена роли — только super_admin), аналитика просмотров (фиксация при открытии статьи), SEO meta description статей. API: routes/admin.ts, media upload (multer), PATCH stories, GET/PUT /stories/:id/articles. Все эндпоинты протестированы |
| 2026-11-06 | **Доработки редактора и UX** (всё по сессии с пользователем): тёмная тема админки (графит+оранж), ссылка «← На сайт», npm run dev поднимает api+web+admin, индустрии и тикеры — отдельные разделы, загрузка обложки из файла (jpeg/png/webp ≤5МБ), создание тикера «на лету» в облаке тегов, **автогенерация slug из заголовка** (транслит донора: й→j, щ→shh, ю→ju, я→ja; сверено с существующими slug), «Лента событий» на главной (как у донора), fix NULLS LAST в сортировках, fix пустых /o-nas /zachem /smysl /missiya |
| 2026-11-06 | **Аудит безопасности и исправления** (commit c30c589): stored XSS в контенте статей → sanitize-html allowlist на рендере; CORS cors() → allowlist CORS_ORIGINS; rate limiting (api/login/register/generate); SVG-upload → stored XSS, только jpeg/png/webp; утечка ошибок → generic 500; дефолтный JWT_SECRET → fail fast в production; скачивание от Kimi → проверка image/*. Чисто: секретов в git нет, SQL параметризован, path traversal не применим |
| 2026-11-06 | **AuthModal 1:1 с PULSE** (37b26b3): изучены AUTH_MODAL_SPEC.md (471 стр., ТЗ-119 v3), AuthModal.tsx, BorderGlow.tsx, бэкенд /register PULSE. Скопировано: модал 400px, табы pill, регистрация 3 шага со степпером, живой счётчик пароля, BorderGlow-зажигание, Success-экран, ошибки EMAIL_EXISTS/USERNAME_EXISTS (case-insensitive). Бэкенд: username обязателен/уникален, пароль от 8. «Предложить идею» для анонимов → регистрация с возвратом |
| 2026-11-06 | **AuthModal 1:1 с PULSE** (37b26b3): изучены AUTH_MODAL_SPEC.md (471 стр., ТЗ-119 v3), AuthModal.tsx, BorderGlow.tsx, бэкенд /register PULSE. Скопировано: модал 400px, табы pill, регистрация 3 шага со степпером, живой счётчик пароля, BorderGlow-зажигание, Success-экран, ошибки EMAIL_EXISTS/USERNAME_EXISTS (case-insensitive). Бэкенд: username обязателен/уникален, пароль от 8. «Предложить идею» для анонимов → регистрация с возвратом |
| 2026-11-06 | **Финальная пачка**: график котировок на идее в статусе «Торги на бирже» (MOEX ISS, SVG, d898725); редактирование пользователей в админке (email/имя/роль, 409 CI, 68561d2); страница тренда = структура донора (про тренд + секции по типам, e42908a); **палитра донора** — чёрный #000 + лайм #beff00/#c9ff2a вместо zinc+orange (9ece376) |
| 2026-11-06 | **Документация приведена в порядок**: раздел 6.4 — актуальное дерево монорепо (apps/admin, migrate-wp.ts, reference/), раздел 6.5 — состояние прототипа, команды запуска с нуля, бэклог известных ограничений. Добавлен скрипт db:migrate:wp |
| 2026-11-06 | **Вторая большая пачка (вечер)**: «Предложить новость/идею» из футера (5cf7332); AuthModal 1:1 PULSE (37b26b3); SSO-проброс сайт→админка ?auth= (0448b08); график котировок на идее «Торги на бирже» (d898725); ЛК фаза 1 — избранное/подписки/моя лента (bfb2678); удаление аккаунта (2bc21b1); email-уведомления Resend: дайджест 20:00 + недельный репорт (0ad8336); TG-контур: deep-link /start + polling + дайджесты в ЛС (02f6afb); пейволл public/auth/tariff с тарифами из БД (b2b13fb); аватар-пресет 10 иконок, «Выйти» в кабинет (1305e10); **админка тарифов** — порт PAYMENTS.md PULSE: каталог цен/фич/active, таба «Тарифы», срок тарифа (74491ef) |
| 2026-11-06 | **E2E-аудит всей платформы** (scripts/e2e.sh, 61 проверка, итог 61/61): авторизация+регистрация (409 CI), админка целиком (статьи/сущности/сюжеты/редиректы/юзеры/тарифы/медиа/статистика/уведомления), юзер-сценарии (пейволл 3 уровней, избранное, подписки→лента, кабинет, propose), безопасность (CORS 403 чужой origin, 401, security headers). Найден и исправлен баг: свежие draft'и с published_at=NULL тонули в конце списка → coalesce(published_at, created_at) |
| 2026-11-07 | **Аудит безопасности — раунд 2** (5 фиксов + репорт): JWT alg pinning (verify строго HS256 — защита от alg-confusion); DELETE /auth/me в транзакции (draft'и + юзер атомарно); upload — проверка магических байтов PNG/JPEG/WebP вместо доверия к mimetype; rate limit на POST /api/telegram/link (20/час); политика паролей (≥2 класса символов: буквы/цифры/спец, не «aaaaaaaa»). Проверено чисто: SQL параметризован (Drizzle), IDOR нет (везде req.user.id), mass assignment закрыт zod-вайтлистами, SSRF нет (фетчи: MOEX ISS, Kimi, Telegram API — фиксированные хосты), TG-коды одноразовые 16 байт hex TTL 10 мин. Бэклог для прода: trust proxy за реверс-прокси, HSTS+CSP для SPA, httpOnly-cookie вместо localStorage JWT, one-click unsubscribe в email, верификация email, ротация/отзыв JWT, ротация article_views. Тест e2e «не-super не меняет роли» переведён на reader-токен (test@test.ru теперь super_admin). 61/61 PASS |
| 2026-11-07 | **Поиск над списками в админке**: общий компонент SearchInput (иконка, дебаунс 300 мс, кнопка очистки) + filterRows (клиентский case-insensitive фильтр по полям). Статьи — серверный `?q=` по title/slug (lower() like, безопасно — параметр); компании/тренды/тикеры/индустрии/сюжеты/редиректы/пользователи/медиатека — клиентский фильтр со счётчиком «N из M». Типизация чистая, E2E 61/61 |
| 2026-11-07 | **Векторный + полнотекстовый поиск по материалам** (миграция 0012, `/api/search`, страница `/search`): articles.search_tsv — tsvector GENERATED ALWAYS (russian-стемминг: title+thesis+excerpt+content без HTML) + GIN; эмбеддинги в существующей таблице article_embeddings (vector(1024), HNSW, поле model). Гибрид: FTS (ts_rank) + косинусное расстояние, слияние RRF (k=60); векторная часть включается только при MOONSHOT_EMBED_MODEL + наличии эмбеддингов, без ключа — честный FTS. Пейволл соблюдается через accessCondition. Rate limit 20/мин. Бэкфилл: `MOONSHOT_API_KEY=… MOONSHOT_EMBED_MODEL=… npm run embed -w @newinvest/db` (батчи 20, идемпотентно, --force для полного пересчёта, проверка размерности 1024). Фронт: SearchPage + иконка в шапке. E2E 66/66 (FTS-поиск, 400 на короткий/пустой запрос, пейволл в поиске) |
| 2026-11-07 | **Возврат статьи в черновик**: селект статуса разблокирован для опубликованных + кнопка «Вернуть в черновик» в редакторе. PATCH /articles/:id при status=draft очищает published_at (список снова сортирует её как черновик), при status=published без даты — ставит now. Авторы (не админы) по-прежнему не могут менять статус. E2E 69/69 (+3: смена статуса, очистка published_at, anon 404 после снятия) |
| 2026-11-07 | **Генерация лида (excerpt) в редакторе**: POST /api/media/generate-text (сервис textGen.ts — Moonshot Chat Completions, модель из MOONSHOT_TEXT_MODEL, без ключа — mock-экстракция первых предложений из блока «ТЕКСТ:»). Промпт собирается из ВСЕХ полей формы: заголовок, тезис, текущий лид, привязанные компании/тикеры/тренды, тип материала + полный текст (до 6000 знаков); выбор размера 150/250/400 ±20%. Отдельный rate limit 60/час. Кнопка «✨ Сгенерировать из текста» под полем Excerpt, бейдж «mock (без ключа)». E2E 73/73 (+4: текст, mock-флаг, 400, 401) |
| 2026-11-07 | **Генерация SEO meta description**: персоны в textGen (editor|seo — системный промпт только из серверного списка, клиент шлёт enum), seo-персона: «опытный SEO-специалист», читает статью + заголовок/тезис/лид/текущий meta, ключевые слова из текста естественно, без кликбейта, temperature 0.3. Кнопка «✨ Сгенерировать (SEO)» под полем meta description, размер 150/200/300 ±10%, результат обрезается до 300 знаков. E2E 73/73. Побочно: починен зависший dev-контур (дубли vite/tsx на портах) |
| 2026-11-07 | **Выбор обложки из медиатеки**: MediaPickerModal (сетка файлов из GET /api/media, живой поиск, галочка текущей обложки) + кнопка «🗂 Из медиатеки» в редакторе. Работает и для новых статей (просто ставит coverMediaId, сохраняется со статьёй), в отличие от загрузки/генерации. API-прокси /uploads добавлен в vite-конфиг админки. В dev-скрипт API добавлен --ignore '**/node_modules/**' (iCloud-синк Desktop дёргал tsx watch). E2E 73/73 |
| 2026-11-07 | **Облака тегов с автодополнением (EntityCloud)**: единый компонент для компаний/тикеров/индустрий/трендов в редакторе. Поведение: ввод → дроплист из существующих (до 8, клик/Enter — привязать, ↑↓ навигация, Esc закрыть); точного совпадения нет → Enter создаёт сущность (POST /companies|/tickers|/industries|/trends) и сразу привязывает; slug автотранслит в стиле донора. Привязанные — чипсы лаймовые (клик снимает привязку), в дроплисте помечены «привязано ✓». Тикер: валидация латиницы/цифр ≤15, uppercase. Заменён отдельный блок «тикер на лету» и CheckGroup (удалены). E2E 73/73; эндпоинты создания — 201 |
| 2026-11-07 | **Настройки Kimi API — таба в админке** (страница /kimi, пункт «Настройки Kimi»): ключ (ввод заменяет, маскирован в GET ••••+last4, кнопка удалить), baseUrl, три модели — текстовая, обложек, эмбеддингов (select+datalist: live-список из GET {baseUrl}/models аккаунта + подсказки из доков Kimi Platform). Хранение: meta_fields ownerType='app' ownerId=0 (kimi_api_key/base_url/text_model/image_model/embed_model) с in-memory кэшем; сервисы mediaGen/textGen/embeddings и mock-флаги читают настройки из БД — env MOONSHOT_* теперь только fallback, смена без перезапуска. API: GET/POST /api/admin/kimi-settings (admin-only, маскированный ответ). Актуальный дефолт текстовой модели — kimi-k3 (moonshot-v1-* и kimi-k2-* серия отключены платформой 31.08.2026, см. platform.kimi.ai/docs/models). E2E 77/77 (+4: anon 401, POST, persist, reader 403) |
| 2026-11-07 | **Фикс доступности dev-серверов**: Vite (web+admin) слушал только IPv6 (::1), а localhost у части клиентов резолвится в 127.0.0.1 → «Error» в браузере. В vite-конфиги обоих приложений добавлен `server.host: true` (оба стека). Побочно выявлено: login-лимитер (10/15 мин с IP) блокирует частые curl-проверки в dev — лечится перезапуском API (in-memory), вынести лимиты в env при необходимости | E2E 77/77 |
| 2026-11-07 | **Секция «События тренда»** на странице тренда (TrendPage): тип sobytie добавлен в SECTIONS между «Новостями» и «Аналитикой». У «Роботов» 4 события раньше не показывались вовсе | страница 200 |
| 2026-11-07 | **Карусель «События по идее»** на странице идеи (после чипсов-тегов): GET /api/articles/:id/events (публично) — события (type=sobytie, published) с пересечением привязок по любой связке (компании/тикеры/индустрии/тренды), UNION-поиск по junction-таблицам, пейволл через accessCondition, свежие первыми, до 10; не-идея → 404. Фронт: IdeaEvents в ArticlePage (карусель как на главной, принцип 4.3 — без событий секция скрыта). Также: секция «События тренда» добавлена в TrendPage. E2E 80/80 (+3) |
| 2026-11-07 | **Нижние карусели на странице идеи** (как у донора): «Новости по идее» (связанные через привязки, ?type=novost), «Аналитика», «Интересное», «Все идеи» (карусели по типу, api.byType; текущая идея исключается). Эндпоинт /articles/:id/events обобщён: параметр ?type= (валидация через ARTICLE_TYPES, 400 при чужом). MOEX: fallback без from/till — ISS периодически падает 500 на датах | E2E 80/80 |
| 2026-11-07 | **Избранное + подписка на странице идеи**: кнопки в шапке статьи (FavoriteButton entityType=article — уже поддерживался; SubscribeButton с label «Подписаться на идею»). В API добавлен тип подписки 'article' (SUB_TYPES): в «Мою ленту» попадает сама идея + материалы с общими трендами/компаниями | E2E 80/80 |
| 2026-11-07 | **Подзаголовки-типы в админке «Статьи»**: строка «Все · Новость · Идея · Событие · Аналитика · Интересное» под заголовком, клик — предвыбранный список; тип в URL (?type=ideya, replace), работает «назад» в браузере; счётчик «N шт.»; активный тип лаймовый + кнопка сброса | типизация чистая |
| 2026-11-08 | **Страница /feed (персональная лента)**: пункт «Лента» в меню сайта ведёт на /feed, а не на главную (главная — по клику на логотип). Анониму — экран с объяснением и кнопкой входа (возврат на /feed после логина); залогиненному — материалы по подпискам (тот же /api/feed, что и таб «Моя лента» в кабинете) | E2E 80/80 |
| 2026-11-08 | **Аватар профиля — через «edit» в кабинете**: встроенный выбор иконки убран из страницы; клик по аватарке в шапке профиля открывает модал AvatarPickerModal (сетка 5×2, клик сразу сохраняет, лаймовое кольцо на текущей; при наведении на аватар — бейдж «edit») | страница 200 |
| 2026-11-08 | **E2E-аудит всех механик + реестр 6.6**: сьют расширен 80→115 проверок. Новое покрытие: подписка на идею в ленте, список/отписка подписок, развёрнутое избранное + 400 на невалидный тип, GET настроек уведомлений, telegram-контур (статус/link 503/disconnect), удаление аккаунта (токен отзывается, юзер удалён), создание тарифа (priceMonthly строкой) + публичный список, фичи (публичные/тоггл/anon 401), PATCH карточек компании и тренда, upload PNG + отсев подделки по magic bytes, search mode=fts, список редиректов, не-MOEX 404, фиксация просмотров (article_views растёт), маскирование ключа Kimi (полный ключ не отдаётся), просроченный тариф 403. Фикс: дубль (type,slug) ронял API 500 → теперь 409 SLUG_EXISTS (pg 23505) | E2E 115/115 |
| 2026-11-08 | **Спецкарточка «Пайплайн» в карусели главной**: как у трендов — первый слайд с объяснением (путь идеи от тренда до архива) и кнопкой «Смотреть пайплайн» → /portfolio?phase=pipeline; счётчик секции +1 | страница 200 |
| 2026-11-08 | **Спецкарточка «Наш портфель»**: объяснение — портфель сообщества, идеи в фокусе внимания участников; кнопка → /portfolio?phase=portfel | страница 200 |
| 2026-11-08 | **Опасная зона — отдельная таба кабинета**: удаление аккаунта переехало из-под всех табов в последнюю табу «Опасная зона» (красная кнопка, активная — красная заливка) | страница 200 |
| 2026-11-08 | **Спецкарточка «Архив идей»**: идея завершила путь (IPO, сделка или закрытие) — итог как опыт портфеля; кнопка → /portfolio?phase=arhiv. Все 3 вентурные секции главной (Пайплайн/Портфель/Архив) + Тренды теперь со спецкарточками-объяснениями | страница 200 |
| 2026-11-08 | **GET /subscriptions обогащается данными сущностей** (как /favorites): article → {type, slug, title}, company/trend/industry → {slug, name}, ticker → {slug, symbol}. Таб «Подписки» кабинета переделан: имена из data сервера (было «article #N»), иконка 💡 для идей, названия стали ссылками на материал/карточку, 5 словарных запросов → 1 | E2E 115/115 |
| 2026-11-08 | **NewsCard — широкие новостные карточки как у донора**: горизонтальная картинка 2:1 сверху (зум при наведении), под ней заголовок (2 строки), дата, лид (3 строки); избранное в углу картинки. Используется: главная «Свежие новости», архив /novost, карусели идеи «Новости по идее» и TypeCarousel при type=novost. Остальные типы — книжные 3:4 как раньше | страницы 200 |
| 2026-11-08 | **Скринер: компании, тренды и стадия финансирования на карточках**: /api/screener возвращает companies[], trends[] (бейджи-агрегаты по junction) и fundingStage (последний раунд компаний идеи из funding_rounds, order by date desc). IdeaCard (карусели): компания (лайм, 1) → тренд (1) → 💰 fundingStage → стадии → индустрии. PipelinePage (скринер): фазы → компании (2) → тренды (2) → 💰 fundingStage → стадии → индустрии. Порядок бейджей: от конкретного к общему | E2E 115/115 |
| 2026-11-08 | **Тип контента «video» (курация, embed как в WordPress)** — закрывает главный пробел концепта (видео как вход в тему): миграция 0013 (articles.video_url), ARTICLE_TYPES+video. Редактор: поле «Ссылка на видео» (YouTube/RuTube/VK/Vimeo/Dailymotion) с валидацией платформы. Фронт: lib/video.ts toEmbedUrl (watch/youtu.be/shorts→youtube.com/embed, rutube→play/embed, vk→video_ext) + videoThumbnail (ytimg для превью); VideoCard (16:9, play-кнопка, лаймовая плашка «Видео»); страница статьи — iframe-плеер над текстом. Воронка на TrendPage: Видео → Аналитика → Новости → События → Идеи → Интересное. Меню: «Портфель» → «Стартапы» (точка входа концепта). /video — архив и роут работают автоматически | E2E 119/119 (+4) |
| 2026-11-08 | **Аудит двумя агентами + приёмка**: (1) мёртвый код — удалён ArticleRowCard, videoThumbnail из admin/lib (дубль web), зомби config.databaseUrl, 12 неиспользуемых импортов (cabinet/digest/kimiSettings/admin/articles/screener/search/VideoCard/ArticlePage/FeaturesPage); digest.ts переведён на getKimiSettings (ключ из админки теперь работает и для AI-сводки недели); кнопки ручного запуска дайджестов в «Аналитике». (2) документация — убраны 3 фантомные таблицы (article_project_stages/strategies/market_classes — junction не заводили), раздел 5 дополнен (video_url, пейволл-колонки, users.avatar/tariff, tariff_plans/features_registry/notification_settings/tg_*), счётчики E2E 77/115→119, убран axios, infra описание приведено к реальности. (3) СОЗДАНА инфра для деплоя: infra/docker-compose.yml (pgvector+api+web+admin+caddy), Dockerfile.{api,web,admin}, nginx.spa.conf, Caddyfile (TLS, admin-поддомен, /api-прокси), infra/.env.example. Фикс git-индекса миграции 0013 + snapshot 0013 (чистый клон не сломается) | типизация всех приложений чистая |
| 2026-11-08 | **Документация деплоя: docs/DEPLOY.md** — полный цикл: требования к VPS, env, docker compose up (миграции автоматом при старте api), супер-админ, перенос контента (migrate-wp / pg_dump), векторный контур в БД (pgvector: ключ в /kimi → embed.ts бэкфилл → проверка mode=hybrid, --force для смены модели), бэкапы (pg_dump cron 04:17 + том uploads), обновление релиза, эксплуатация, таблица частых проблем | — |
| 2026-11-08 | **Аудит безопасности двумя агентами (пентест + white-box) и remediation**: исправлено — пейволл в скринере (accessCondition, anon не видит auth/tariff-идеи), пейволл в /feed и дайджестах (в т.ч. АКТУАЛЬНЫЙ тариф из БД, не JWT), POST /kimi-settings только super_admin + baseUrl allowlist (api.moonshot.ai/cn, api.kimi.com — защита от угона ключа), http(s)-only валидация всех URL-полей (sourceUrl/videoUrl/website — блок data:/javascript:), trust proxy scoped (loopback/linklocal/uniquelocal — rate limit за Caddy не склеивает клиентов и не спуфится), admin-JWT TTL 12h (юзеры 7д), bcrypt cost 12, seed/test заблокированы в production (дефолтный admin123 запрещён), TG-дайджест экранирует title. Отложено в бэклог: tokenVersion/отзыв JWT, смена пароля, per-account login-лимит, SSO через одноразовый код, шифрование kimi_api_key at-rest, аудит-лог, article_views retention, propose-квота. Проверено и в порядке обоими: alg pinning, SQL-параметризация, sanitize-html, magic bytes, TG deep-link, SSRF в market/chart, error handler | E2E 123/123 (+4 security-проверки) |
| 2026-11-08 | **Финальный аудит лидом кибербеза (третий раунд)**: верифицировано 8/9 исправлений, найден провал — baseUrl-allowlist через startsWith обходился (api.moonshot.ai.evil.com) → исправлено на точное сравнение hostname (400 на обход, 200 на легитимный). MUST BEFORE LAUNCH закрыто: CORS_ORIGINS в compose/.env.example переведён на punycode (браузер шлёт Origin как xn--..., иначе админка в проде получила бы 403). Также: PreviewModal экранирует title/excerpt/thesis/coverUrl + sandbox без allow-same-origin, X-Powered-By отключён, поиск q ≤300 символов, healthcheck api в compose. Вердикт лида: 7/10 → после фиксов запуск с открытой регистрацией возможен; FIRST MONTH: SSO-код вместо ?auth=, смена пароля, аудит-лог, CSP на фронтах, per-account login-лимит, верификация email, квота propose | E2E 123/123 |
| 2026-11-08 | **Документация приведена в соответствие после 3 раундов аудита безопасности**: реестр 6.6 — пейволл отмечен на всех контурах (статьи/скринер/лента/дайджесты/поиск/events), trust proxy scoped в строке rate limiting, CORS с пометкой про punycode, JWT — 12ч/7д с e2e-проверкой; бэклог переписан: закрыто trust proxy, актуализировано под вердикт лида (запуск не блокируют); счётчики E2E 119→123 в 4 местах | — |
| 2026-11-08 | **Продуктовые метрики в админке** (страница «Метрики», по стандартам Mixpanel/Product School для контент-платформ): API /admin/metrics/* (admin-only, route-level guard) — overview (KPI: юзеры, DAU/WAU/MAU по просмотрам, stickiness DAU/MAU, прочтения, избранное, подписки), registrations (по дням + кумулятивная линия), retention (когортный, недельные когорты × W0–W4, теплокарта — просмотр = значимое действие), engagement (прочтения/избранное/подписки по дням), top-trends (рейтинг тем по просмотрам). Фронт: MetricsPage + SVG-графики без зависимостей (BarChart с cumulative-линией, RetentionTable-теплокарта). **Баг-фикс**: router-level .use(authRequired) в metricsRouter применялся ко ВСЕМ /api-запросам и отдавал 401 публичным эндпоинтам (trends/screener/tariff-plans) → guard перенесён на уровень роутов. loginLimiter: skipSuccessfulRequests — лимит считает только неудачные попытки (брутфорс), легитимные логины не извлекают бюджет | E2E 131/131 (+8 метрик) |
| 2026-11-08 | **Метрики по образцу PULSE (ADMIN_DASHBOARD.md, ProductMetricsTab)**: воронка (регистрация → чтение → избранное → подписка, % от предыдущего и от регистраций), retention D1/D7/D30 (дневные когорты, молодые — «—» как в PULSE, рядом с недельным W0–W4), группы риска (dormant 7д/30д, читают-без-подписки) с кликом → модалка списка юзеров, независимая загрузка секций со stagger 80мс (упавшая секция не роняет страницу, ошибки сводкой). UsersPage: сводка над таблицей (юзеры/с тарифом/читают/суммарные прочтения) + выгрузка CSV (GET /api/users/export.csv, BOM, admin-only). API: /admin/metrics/funnel, retention-daily, at-risk (type whitelist 400) | E2E 138/138 (+7) |
