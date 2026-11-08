# ТЗ-04. Счётчики лайков и репостов на материалах

Статус: **финальная версия v2**, к реализации.
Дата: 2026-11-08.
Связи: ТЗ-02 (соцшеринг), ТЗ-03 (счётчики просмотров на карточках), ТЗ-09 (время чтения) — **все три ТЗ делят одну миграцию 0014**, паттерны — избранное (favorites), подписки (subscriptions), пейволл (accessCondition).

---

## 1. Цель

Добавить на материалы (articles) два публичных счётчика вовлечения:

- **лайки** — реальные, привязанные к пользователю (1 юзер = 1 лайк на материал, повторный клик отменяет лайк);
- **«поделились» (shares)** — счётчик кликов по кнопкам соцшеринга (ТЗ-02). Честно фиксируем в ТЗ: считаем **факт нажатия кнопки шеринга**, а не подтверждённый внешний пост. Внешнего подтверждения ни одна соцсеть надёжно не даёт.

Зачем: социальное доказательство на карточках и страницах материалов + сигнал для редакции о виральности. База для будущей сортировки «популярное».

---

## 2. Текущее состояние (подтверждено чтением кода, 2026-11-08)

- **`packages/db/src/schema.ts`**
  - `favorites` (user_id + entity_type + entity_id, PK-кортеж) — паттерн per-user действия;
  - `article_views` (события просмотров, userId nullable, `onDelete: 'set null'`) — паттерн журналирования;
  - `articles` — счётчик-колонок (`likes_count` и т.п.) **нет**;
  - `subscriptions` — второй паттерн per-user.
- **`apps/api/src/routes/cabinet.ts`** — `PUT /api/favorites` (idempotent, `onConflictDoNothing`), `DELETE /api/favorites/:type/:id`, `GET /api/favorites/keys`. Весь роутер под `authRequired`.
- **`apps/api/src/routes/articles.ts`**
  - Список `GET /api/articles` (строки 89–108): узкий селект `id, type, slug, title, excerpt, status, publishedAt, coverUrl, videoUrl` — без счётчиков; пейволл-фильтр через `accessCondition()` (строки 48–58, 67–69), публично только `status = 'published'` (строки 74–79).
  - Детальная `GET /api/articles/:type/:slug` (строки 112–170): фиксирует просмотр через `article_views` (fire-and-forget, строка 158), пейволл — 403 с уровнем доступа (строки 126–134).
- **`apps/api/src/index.ts`** — `bindingsRouter` смонтирован на строке 57 (`app.use('/api', bindingsRouter)`) **перед** `articlesRouter` (строка 58) именно из-за конфликта `/articles/:id/...` vs `/articles/:type/:slug`. Все лимиты — в строках 39–45.
- **`apps/api/src/middleware/security.ts`** — готовая фабрика лимитов на `express-rate-limit` (`limiterDefaults`, `apiLimiter` 300 запросов/мин/IP, паттерн `message: { error: ... }`, `skip`/`skipSuccessfulRequests` поддержаны библиотекой).
- **Web: `apps/web/src/favorites.tsx`** — `FavoritesProvider`: грузит ключи при логине, оптимистичный toggle с откатом, заголовок `Authorization: Bearer <token>`.
- **Web: `apps/web/src/components/FavoriteButton.tsx`** — кнопка-иконка (образец для LikeButton): анониму открывает `AuthModal` (`open('login', window.location.pathname)`), `e.preventDefault(); e.stopPropagation()` против навигации по ссылке карточки, активное состояние — лаймовый `#beff00` с `fill="currentColor"`, неактивное — `bg-black/60 text-zinc-300 hover:text-[#beff00]`.
- **Web: `apps/web/src/components/ArticleCard.tsx`** — `FavoriteButton` позиционирован `absolute top-2 right-2`.
- **Web: `apps/web/src/api.ts`** — `ArticleListItem` и `ArticleDetail` — сюда добавляются поля счётчиков.
- **Web: `apps/web/src/pages/CabinetPage.tsx`** — лайков нет; «мои лайки» в кабинете **не входит** в объём (решение ТЗ, см. §8).
- **Миграции**: `packages/db/migrations/`, последняя — `0013_video_type.sql`; drizzle-kit генерирует следующую как `0014_*.sql`. **0014 общая с ТЗ-03 и ТЗ-09** (см. §3.4).
- **E2E в репо нет; Playwright НЕ добавляем** (решение ТЗ, см. §4.7) — тестирование curl-e2e по образцу `packages/db/src/smoke.ts`.
- **Кнопок шеринга пока нет** — они появятся в ТЗ-02; настоящее ТЗ определяет API и счётчик так, чтобы ТЗ-02 только вызвал `POST /api/articles/:id/share`.

---

## 3. Модель данных

### 3.1. Новые таблицы (миграция `0014`)

```sql
-- Лайки: реальные, per-user, идемпотентность на уровне PK
CREATE TABLE article_likes (
  user_id    INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  article_id INTEGER NOT NULL REFERENCES articles(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, article_id)
);
CREATE INDEX article_likes_article_idx ON article_likes (article_id);

-- Журнал кликов по шерингу: нужен для rate limit per-user и для честности
-- («сколько раз этот юзер кликал»), а не только для итогового числа
CREATE TABLE article_share_events (
  id         SERIAL PRIMARY KEY,
  user_id    INTEGER REFERENCES users(id) ON DELETE SET NULL, -- NULL = аноним
  article_id INTEGER NOT NULL REFERENCES articles(id) ON DELETE CASCADE,
  channel    TEXT NOT NULL DEFAULT 'unknown',                 -- telegram | vk | ok | copylink | ... (из ТЗ-02)
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX article_share_events_article_idx ON article_share_events (article_id, created_at);
CREATE INDEX article_share_events_user_idx ON article_share_events (user_id, created_at);
```

Имена в Drizzle: `articleLikes`, `articleShareEvents` (не `articleShares` — во избежание путаницы с колонкой; **решение ТЗ**).

### 3.2. Денормализованные счётчики — колонки на `articles`

```sql
ALTER TABLE articles
  ADD COLUMN likes_count  INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN shares_count INTEGER NOT NULL DEFAULT 0;
```

**Почему likes/shares — колонки, а views (ТЗ-03) — вычисляемый `count(*) + offsets`? Различие осознанное (решение ТЗ):**

1. Счётчики нужны в **списках** (`GET /api/articles` — до 100 карточек на страницу). `COUNT(*)` по `article_likes` для каждой строки списка = N подзапросов на каждое чтение списка. Это чтение-доминируемая нагрузка (карточек смотрят на порядки чаще, чем лайкают).
2. Лайки — юзер-фейсинг число, обязано быть **точным и консистентным** с состоянием кнопки; просмотры (ТЗ-03) — аналитика, там допустимы виртуальные офсеты и вычисление на лету.
3. Записей лайков мало (1 на юзера на материал) и пишутся редко; инкремент колонки в той же транзакции, что и вставка/удаление строки лайка, даёт точность без отдельных джобов. Просмотров много (строка на каждое открытие) — материализовать их было бы дорого.
4. Аналогия в коде уже есть: `articles.publishedAt`, денормализация считается приемлемой практикой репо.

Инвариант: `articles.likes_count == COUNT(article_likes)` и `articles.shares_count == COUNT(article_share_events)` — поддерживается **только транзакциями в API**, прямыми правками колонок не пользоваться. Миграция `0014` заполняет колонки разовым `UPDATE ... FROM (SELECT article_id, COUNT(*) ...)`.

### 3.3. Общий состав миграции 0014 (согласование с ТЗ-03 и ТЗ-09)

**Решение ТЗ: одна общая миграция `0014_engagement.sql`** (генерируется drizzle-kit после того, как все три ТЗ внесены в `packages/db/src/schema.ts` — порядок согласования: правки схемы из ТЗ-03, ТЗ-04, ТЗ-09 затем **один** `drizzle-kit generate`).

Состав DDL:

**Новые таблицы** (этот ТЗ): `article_likes`, `article_share_events` — см. §3.1.

**Новые колонки `articles`**:

| Колонка | Тип | Default | Источник | Смысл |
|---|---|---|---|---|
| `likes_count` | integer notNull | 0 | ТЗ-04 | счётчик лайков |
| `shares_count` | integer notNull | 0 | ТЗ-04 | счётчик кликов «поделиться» |
| `views_base_offset` | integer notNull | 0 | ТЗ-03 | стартовые просмотры (seed) |
| `views_auto_bump_enabled` | boolean notNull | false | ТЗ-03 | автодокрутка включена |
| `views_auto_bump_every_hours` | integer | null | ТЗ-03 | период докрутки, часы (1–168) |
| `views_auto_bump_min` | integer | null | ТЗ-03 | мин. добавка |
| `views_auto_bump_max` | integer | null | ТЗ-03 | макс. добавка |
| `views_bump_accumulated` | integer notNull | 0 | ТЗ-03 | суммарно накручено |
| `views_bump_last_at` | timestamptz | null | ТЗ-03 | последний тик докрутки |
| `reading_time` | integer | null | ТЗ-09 | минуты чтения (NULL = не рассчитано, backfill отдельным скриптом ТЗ-09) |

Backfill внутри 0014: только для `likes_count`/`shares_count` (таблицы на старте пустые, но миграция обязана быть корректной для восстановления из бэкапа):

```sql
UPDATE articles a SET likes_count = COALESCE(c.cnt, 0)
  FROM (SELECT article_id, COUNT(*) cnt FROM article_likes GROUP BY article_id) c
  WHERE a.id = c.article_id;
UPDATE articles a SET shares_count = COALESCE(c.cnt, 0)
  FROM (SELECT article_id, COUNT(*) cnt FROM article_share_events GROUP BY article_id) c
  WHERE a.id = c.article_id;
```

`reading_time` миграция не трогает — backfill скриптом ТЗ-09; views-офсеты дефолтятся нулём.

### 3.4. Drizzle-схема

- `packages/db/src/schema.ts`: экспорты `articleLikes`, `articleShareEvents` (таблицы §3.1) + колонки `likesCount`, `sharesCount` в `articles`. Комментарий про инвариант — рядом с таблицей.
- Координация: колонки ТЗ-03 (`viewsBaseOffset` и т.д.) и ТЗ-09 (`readingTime`) вносятся в ту же схему до генерации 0014 (см. §3.3).

---

## 4. Требования

### 4.1. Лайки

| № | Требование |
|---|-----------|
| L1 | Лайкать могут **только залогиненные**. Аноним, нажавший кнопку, получает открытие `AuthModal` (паттерн `FavoriteButton`), лайк не создаётся. API при отсутствии токена — **401**. |
| L2 | **Один лайк на юзера на материал.** Обеспечено PK `(user_id, article_id)` + `onConflictDoNothing()`. |
| L3 | **Отмена повторным кликом** — второй клик удаляет лайк (DELETE), счётчик декрементится. Повторный клик после отмены — снова лайк. |
| L4 | `PUT /api/articles/:id/like` **идемпотентен**: повторный PUT при уже существующем лайке — 200, счётчик не меняется (не инкрементится повторно). Аналогично DELETE на отсутствующем лайке — 200 без изменений. |
| L5 | Счётчик лайков **виден всем**, включая анонимов. Состояние «я лайкнул» — только залогиненным. |
| L6 | Двойной клик / гонка двух запросов от одного юзера не приводят к счётчику > реального числа лайков (защита транзакцией + PK). |

### 4.2. «Поделились» (shares)

| № | Требование |
|---|-----------|
| S1 | Считается **каждый клик** по кнопке шеринга (любой канал: Telegram, VK, копирование ссылки и т.д. — список каналов определяет ТЗ-02). Подтверждение публикации во внешней сети **не требуется и не ожидается** — число означает «столько раз нажали поделиться». |
| S2 | Шерить могут **все, включая анонимов** (шеринг — привлечение новых юзеров, запрет анонимам контрпродуктивен). |
| S3 | **Rate limit** (решение ТЗ — реализация двумя limiter'ами из `middleware/security.ts`): залогиненный — не более **30 кликов/час** (`keyGenerator: 'u:' + req.user.id`, `skip: !req.user`), аноним — не более **10 кликов/час** по IP (`keyGenerator: req.ip`, `skip: !!req.user`). Оба с `windowMs: 3_600_000`, `message: { error: 'share limit reached' }`. Плюс per-article throttle: залогиненному не чаще **1 клика на тот же материал в 10 минут** — проверкой последнего `article_share_events` для пары user+article (для анонимов не применяется: у события нет IP-колонки, ограничивает только IP-лимит — решение ТЗ). Нарушение — 429, счётчик не меняется. |
| S4 | Анти-накрутка полноценная **не входит** в объём (см. Риски). Повторные клики одного юзера по разным каналам считаются — это осознанный компромисс, зафиксированный здесь. |
| S5 | Идемпотентность **не требуется**: каждый клик — новое событие (иначе клик по «копировать ссылку» и по «Telegram» не различить). |
| S6 | `channel` валидируется zod: `z.string().max(32).optional()`; значения не из whitelist ТЗ-02 приводятся к `'unknown'`, а не к 400 (**решение ТЗ** — ТЗ-02 не должно ломаться расширением списка каналов). |

### 4.3. UI

| № | Требование |
|---|-----------|
| U1 | **`LikeButton`** — новый компонент `apps/web/src/components/LikeButton.tsx`, по образцу `FavoriteButton.tsx`: иконка `Heart` из `lucide-react`, рядом число (минимальная ширина, чтобы не «прыгала» раскладка при изменении числа), активное состояние — лаймовый `#beff00` с `fill="currentColor"`, неактивное — как у FavoriteButton (`bg-black/60 text-zinc-300 hover:text-[#beff00]`). |
| U2 | Лайк-кнопка — на **карточке** (`ArticleCard.tsx`) и на **странице материала** (`ArticlePage.tsx`). На карточке клик не должен уходить в навигацию по ссылке (`e.preventDefault(); e.stopPropagation()` — как в FavoriteButton). Размещение на карточке: рядом с FavoriteButton (низ/верх обложки), не перекрывая друг друга. |
| U3 | Оптимистичное обновление счётчика с откатом при ошибке — как в `favorites.tsx` (pattern `toggle`). Состояние «лайкнул» для текущего юзера приходит с бэкенда (список — поле `liked`, страница — поле `liked`). |
| U4 | **Счётчик shares** отображается рядом с блоком кнопок шеринга (из ТЗ-02) на странице материала: «Поделились: N» или иконка share + число. На карточках списка shares не выводим (не засоряем карточку; при необходимости — отдельным решением). |
| U5 | Счётчики показываем всегда, включая 0 (честность, стимул первого лайка). Формат: компактное число (`1.2k` при ≥ 10000 — на усмотрение реализации, допускается просто число; общий форматтер кладём в `apps/web/src/lib/format.ts`, туда же при желании кладётся `formatViews` из ТЗ-03). |

### 4.4. API

Новые маршруты — **в новом файле `apps/api/src/routes/engagement.ts`** (не в `bindings.ts`: тот — домен привязок к графу сущностей; engagement — отдельная доменная зона). Смонтирован в `apps/api/src/index.ts` строкой `app.use('/api', engagementRouter)` **строго до** `app.use('/api/articles', articlesRouter)` (строка 58) — по той же причине, что bindings: `/articles/:id/like` конфликтует с `/articles/:type/:slug`. **Решение ТЗ: отдельный engagement.ts, отдельный роутер.**

| Метод и путь | Авторизация | Поведение | Ответ |
|---|---|---|---|
| `PUT /api/articles/:id/like` | `authRequired` | Проверка: статья существует и `status = 'published'`, иначе 404. Транзакция: `INSERT ... ON CONFLICT DO NOTHING` в `article_likes`; если вставка состоялась — `likes_count + 1` (`sql\`${articles.likesCount} + 1\``). | `200 { ok, likesCount, liked: true }` (идемпотентно: повторный PUT — тот же ответ без инкремента). Аноним — 401. |
| `DELETE /api/articles/:id/like` | `authRequired` | Транзакция: `DELETE ... RETURNING`; если строка была удалена — `likes_count = GREATEST(likes_count - 1, 0)` (защита от ухода в минус). | `200 { ok, likesCount, liked: false }`. Удаление отсутствующего лайка — 200, счётчик не меняется. |
| `POST /api/articles/:id/share` | `optionalAuth` | Rate limit (S3: два limiter'а + per-article throttle для залогиненных), затем проверка статьи (`status = 'published'`, иначе 404), затем вставка `article_share_events` (user_id или NULL, channel по S6) + `shares_count + 1` в одной транзакции. | `201 { ok, sharesCount }`. Превышение лимита — 429. |
| `GET /api/articles` (список) | `optionalAuth` | К селекту (строки 89–100) добавить `likesCount: articles.likesCount`, `sharesCount: articles.sharesCount`; для залогиненного — `liked: boolean` через `leftJoin(articleLikes, and(eq(articleLikes.articleId, articles.id), eq(articleLikes.userId, req.user.id)))` + `isNotNull(articleLikes.userId)`. Для анонима — без джойна, `liked: false`. | как сейчас + `likesCount, sharesCount, liked` на каждой карточке. |
| `GET /api/articles/:type/:slug` (страница) | `optionalAuth` | К ответу добавить `likesCount`, `sharesCount` (из строки `article`) и `liked: boolean` (есть ли лайк у `req.user`; для анонима `false`) — отдельными полями в корне ответа, не внутрь `article`. | как сейчас + `likesCount, sharesCount, liked`. |

Замечания:

- Счётчики в списке отдаются **всем**, в том числе анонимам; фильтр пейволла (`accessCondition`) на выдачу счётчиков не влияет.
- Тело ответа лайка/шера отдаёт **актуальный серверный** счётчик — клиент после оптимистичного обновления подтягивает его (заодно лечит гонки).
- `GET /api/articles` оборачивается в один запрос: не N+1 подзапросов `liked`, а один `leftJoin` (см. SQL выше).

### 4.5. Пейволл

Не влияет. Лайк/шер — действие **над** материалом, а не доступ к контенту: `accessCondition` не применяется к маршрутам like/share (материал при этом должен существовать и быть `published`; лайкать черновики нельзя — проверка `status = 'published'` в маршрутах, иначе 404).

### 4.6. Тестирование (curl-e2e)

**Решение ТЗ (отменяет пункт про Playwright из v1): Playwright в репо НЕ добавляем** — инфраструктуры e2e нет, а сценарии покрываются curl-e2e по образцу `packages/db/src/smoke.ts` (tsx-скрипт с npm-скриптом). UI-часть проверяется ручным проходом по чеклисту U1–U5.

Скрипт: **`apps/api/src/e2e/engagement.e2e.ts`** (tsx, npm-скрипт `"e2e:engagement": "tsx src/e2e/engagement.e2e.ts"` в `apps/api/package.json`; в CI/locally запускается вручную против поднятого API + БД). Шаги:

0. **Подготовка**: регистрация двух тестовых юзеров (через `POST /api/auth/register`), логин → токены; выбор опубликованной статьи (`GET /api/articles?status=published` от admin-токена или поиск по БД); фиксация начальных `likesCount`/`sharesCount`.

1. **Идемпотентность лайка** (критерий приёмки 2):
   - `PUT /api/articles/:id/like` (токен A) → 200, `liked: true`, `likesCount = N+1`;
   - повторный `PUT` → 200, `liked: true`, `likesCount = N+1` (не вырос);
   - `DELETE` → 200, `liked: false`, `likesCount = N`;
   - повторный `DELETE` → 200, `liked: false`, `likesCount = N` (не упал ниже);
   - гонка: два параллельных `PUT` (Promise.all) → ровно один инкремент, финальный `likesCount = N+1`.

2. **401 анонима**: `PUT /api/articles/:id/like` без `Authorization` → 401; `DELETE` без токена → 401; `likesCount` после обоих запросов не изменился (проверка `GET /api/articles/:type/:slug`).

3. **Счётчики в выдаче**: `GET /api/articles` (аноним) → каждая карточка содержит `likesCount`, `sharesCount`, `liked: false`; тот же запрос с токеном A после лайка → `liked: true` на этой статье; `GET /api/articles/:type/:slug` → `likesCount` совпадает со списком.

4. **Rate limit шеринга**: 11 анонимных `POST /api/articles/:id/share` подряд с одного IP → первые ≤10 — 201, 11-й — 429; `sharesCount` вырос ровно на число успешных. Залогиненный: 31 клик → 30 × 201, 31-й — 429. Per-article throttle: второй клик залогиненного на ту же статью в пределах 10 минут → 429.

5. **Черновики и несуществующие**: like/share на `status = 'draft'` → 404; like/share на `id = 999999` → 404.

6. **Инвариант БД**: `SELECT likes_count = (SELECT COUNT(*) FROM article_likes a WHERE a.article_id = articles.id)` для всех строк — без расхождений (тот же запрос для shares).

Скрипт выводит итог `PASS/FAIL` по каждому шагу и завершается ненулевым кодом при любом FAIL.

---

## 5. Реализация (файлы-чеклист)

Бэкенд:

- [ ] `packages/db/src/schema.ts` — `articleLikes`, `articleShareEvents`, колонки `likesCount`/`sharesCount` в `articles` (+ координация: колонки ТЗ-03/ТЗ-09 в той же схеме до генерации 0014).
- [ ] `packages/db/migrations/0014_engagement.sql` — один общий DDL (состав §3.3) + backfill likes/shares; **генерируется одним `drizzle-kit generate` совместно с ТЗ-03/ТЗ-09**.
- [ ] `apps/api/src/middleware/security.ts` — `shareLimiterUser` (30/час, key `u:<id>`, `skip: !req.user`) и `shareLimiterAnon` (10/час, key IP, `skip: !!req.user`), оба `windowMs: 3_600_000`.
- [ ] `apps/api/src/routes/engagement.ts` (новый) — `PUT/DELETE /articles/:id/like`, `POST /articles/:id/share`; транзакции через `db.transaction`; проверки `status = 'published'`; per-article throttle для залогиненных (последнее событие user+article за 10 мин).
- [ ] `apps/api/src/index.ts` — `app.use('/api', engagementRouter)` **до** строки 58 (`articlesRouter`), рядом с bindings (строка 57); монтирование лимитеров share на `/api/articles/` перед роутерами (паттерн строк 39–45).
- [ ] `apps/api/src/routes/articles.ts` — список: `likesCount`/`sharesCount` + `liked` (leftJoin для залогиненного); детальная страница: `likesCount`, `sharesCount`, `liked` в корне ответа.
- [ ] `apps/api/src/e2e/engagement.e2e.ts` + npm-скрипт `"e2e:engagement"` (см. §4.6).

Фронтенд:

- [ ] `apps/web/src/api.ts` — поля в `ArticleListItem` (`likesCount`, `sharesCount`, `liked`) и `ArticleDetail`.
- [ ] `apps/web/src/lib/format.ts` — общий форматтер компактного числа (при желании общий с `formatViews` ТЗ-03).
- [ ] `apps/web/src/components/LikeButton.tsx` — новый компонент (образец: `FavoriteButton.tsx`), оптимистичный toggle с откатом.
- [ ] `apps/web/src/components/ArticleCard.tsx` — LikeButton рядом с FavoriteButton.
- [ ] `apps/web/src/pages/ArticlePage.tsx` — LikeButton + блок счётчика shares (финальный вид — после ТЗ-02; в рамках этого ТЗ счётчик shares выводим рядом с местом под кнопки шеринга).
- [ ] Состояние `liked` для списка — из поля `liked` ответа списка (не отдельный запрос).

Тесты:

- [ ] curl-e2e `engagement.e2e.ts` — идемпотентность, 401 анонима, выдача счётчиков, rate limit 429, 404 черновиков, инвариант БД (§4.6).
- [ ] **Playwright НЕ добавлять** (решение ТЗ §4.6) — пункт из v1 отменён.
- [ ] Ручной UI-проход по U1–U5.

---

## 6. Критерии приёмки

1. Один юзер физически не может поставить два лайка на один материал (PK + `onConflictDoNothing`); гонка параллельных запросов даёт счётчик +1 максимум (шаг 1 curl-e2e).
2. `PUT /api/articles/:id/like` дважды подряд → счётчик вырос ровно на 1; `DELETE` дважды → упал ровно на 1, не ниже 0.
3. Повторный клик по сердечку в UI снимает лайк; состояние переживает перезагрузку страницы.
4. `GET /api/articles` возвращает `likesCount` и `sharesCount` на каждой карточке (анониму тоже); число на карточке равно числу на странице материала; у залогиненного лайкнувшего карточка показывает `liked: true`.
5. Аноним видит счётчики, но лайк не ставится: клик открывает AuthModal, прямой `PUT` без токена → 401, счётчик не изменился. Шерить аноним может, в пределах лимита.
6. Превышение лимита шеринга → 429, `shares_count` не меняется; per-article throttle залогиненного работает (2-й клик на ту же статью < 10 мин → 429).
7. Пейволл-материалы лайкаются/шерятся на уровне API при наличии материала (действие, а не контент); черновики и несуществующие id — 404.
8. Миграция 0014 применяется на пустой БД и на бэкапе (backfill) без ошибок; `likes_count == COUNT(article_likes)`, `shares_count == COUNT(article_share_events)` после миграции и после e2e.
9. curl-e2e `engagement.e2e.ts` полностью зелёный; `npm run typecheck` зелёный в `apps/api`, `apps/web`, `packages/db`.

---

## 7. Риски и ограничения

| Риск | Оценка | Митигация |
|---|---|---|
| **Накрутка likes** через регистрацию ботов | Низкая для старта: 1 лайк = 1 аккаунт, аккаунты дороже кликов; общий `apiLimiter` + косвенная защита `registerLimiter` (10 регистраций/час/IP). Полноценная антифрод-аналитика (device fingerprint, поведенческие признаки) — за пределами ТЗ, отдельная задача при первых признаках злоупотреблений. | Мониторинг: админ-метрика «лайки/регистрации» (есть `metricsRouter`). |
| **Накрутка shares** кликами (счётчик = клики, а не посты) | Принято осознанно (S1/S4). Внешнее подтверждение постов ненадёжно ни у одной сети. Ограничиваем rate limit (S3) и журналом событий — при необходимости выгрузим «кто кликал». | В UI подпись формата «Поделились: N» без слова «репосты» — не обещаем лишнего. |
| **Горячая строка `articles`** при инкременте счётчиков (row lock на строке списка) | Приемлемо на текущем и прогнозируемом масштабе: пишется 1 строка на действие, чтения списка не блокируются длинно (row lock только на обновляемой строке). Если станет узким местом — Redis-агрегатор с фоновой записью (отложенная точность ±N минут), это известный путь миграции без смены API. | Индекс/locks мониторить через `pg_stat_activity`. |
| **Счётчики рассинхронизированы** при правках в обход API или падении между двумя запросами | Инкремент и вставка события — в **одной транзакции**; прямые SQL-правки запрещены конвенцией (инвариант задокументирован в schema.ts). | Раз в сутки опциональный сверочный запрос (не входит в объём, зафиксировано как идея); сверка включена в curl-e2e как шаг 6. |
| **Конфликт маршрутов** `/articles/:id/like` vs `/articles/:type/:slug` | Если смонтировать после `articlesRouter`, `like` распарсится как `type` и сломается. | Роутер `engagement.ts` монтируется в `index.ts` **до** `articlesRouter` (паттерн bindings, строка 57); проверка входит в curl-e2e (шаги 1–2 достижимы = маршрутизация верна). |
| **ТЗ-02 не сделано** — кнопок шеринга нет | Счётчик shares существует без источника кликов. | API и модель этого ТЗ не зависят от ТЗ-02; UI счётчика временно рядом с заглушкой блока шеринга. Приоритет: ТЗ-02 доставляет кнопки, этот ТЗ — счётчики; можно в любом порядке, но ценность полная только вместе. |
| **Тройная согласованность миграции 0014** (ТЗ-03 + ТЗ-04 + ТЗ-09) | Если генерировать миграции по одной, drizzle-kit создаст 0014/0015/0016 с разнобоем в порядке колонок — работоспособно, но порядок применения и review усложняются. | Решение ТЗ (§3.3): все правки schema.ts трёх ТЗ вносятся до одного `drizzle-kit generate`; миграция одна — `0014_engagement.sql`. |

---

## 8. Открытые вопросы (решенные дефолты, менять только по решению владельца)

1. **Анонимные лайки** — по умолчанию запрещены (AuthModal + 401). Альтернатива: разрешить по cookie/localStorage — отклонено: накрутка тривиальна, ценность низкая.
2. **Shares анонимам** — по умолчанию разрешены (rate limit по IP). Альтернатива: только залогиненным — отклонено: шеринг — воронка привлечения.
3. **Сортировка/рейтинги по счётчикам** — не входит; счётчики сейчас только отображаются. «Популярное» — отдельное ТЗ.
4. **Лайки на сущностях, кроме articles** (компании, тренды) — не входит; `favorites` уже покрывает «сохранить себе», лайки остаются материало-специфичными.
5. **«Мои лайки» в кабинете** — не входит (в `CabinetPage` лайков нет; добавление — отдельной задачей). Список лайков пользователя тривиально получается из `article_likes` по user_id, но UI-список вне объёма этого ТЗ.
6. **Per-article throttle шеринга для анонимов** — не делаем (нет IP в `article_share_events`; ограничивает общий IP-лимит 10/час). Если понадобится точнее — отдельной задачей добавить колонку `ip` в журнал.
7. **Playwright/e2e-инфраструктура** — не добавляем (решение ТЗ §4.6); curl-e2e + ручной UI-проход. Если позже появится общая e2e-инфраструктура — сценарии §4.6 переносятся 1:1.

---

## Правки ревью v2.1 (принято, обязательны к реализации)

1. **Лимитеры — внутри engagement.ts ПОСЛЕ optionalAuth** (не в index.ts: там req.user ещё undefined → user-лимитер никогда не сработает, anon-лимитер посчитает всех по IP).
2. Детект факта вставки/удаления — по **длине массива returning** (`insert().onConflictDoNothing().returning()` / `delete().returning()`), НЕ по rowCount.
3. e2e шаг 4: лимит 30/час залогиненного тестировать на ≥30 РАЗНЫХ материалах (per-article throttle даст 429 раньше на одной). Зафиксировать порядок шагов.
4. e2e: данные не удаляются — прогон только на dev-БД; явная строка в скрипте.
5. Подпись: **«иконка share + число» без слов** (не «Поделились: N» — число это клики, подпись вводит в заблуждение).
6. Позиция Like на карточке: конкретно `bottom-2 left-2` (Favorite занимает top-2 right-2 — наложения не будет). Активные состояния Favorite и Like оба лаймовые — принято, но развести формой (сердечко vs закладка).
7. Ссылка на `app.set('trust proxy', ...)` (index.ts:34) в разделе лимитеров — IP-лимит зависит от этой строки.
8. «Pending intent» (после логина вернуться и автоматически поставить лайк) — вне объёма; отложенный пункт (повторяется в избранном).
9. Дрейф счётчиков: в той же транзакции писать `likes_count = (SELECT COUNT(*) FROM article_likes WHERE article_id = ?)` — самосхождение к истине вместо +/-1 (цена ничтожна).
10. Комментарий в 0014: каналы `telegram | vk | whatsapp | copylink | native_share` (убрать `ok`).
11. Инвариант: раз в сутки сверка `likes_count` vs COUNT reconcile-скриптом (копипаста SQL миграции) — добавить в объём, npm script.

---

## СТАТУС: ✅ РЕАЛИЗОВАНО (2026-11-08, агент-48, принято)

По ТЗ + правкам v2.1. routes/engagement.ts (PUT/DELETE like — count-based самосхождение к истине в транзакции, детект по returning; POST share — whitelist→unknown, лимитеры ВНУТРИ после optionalAuth: 30/час юзер / 10/час аноним IP + per-article throttle 10мин → 429; черновики 404), likesCount/sharesCount/liked в списках/детали/screener, LikeButton (bottom-2 left-2 на карточках, оптимистичный+откат, аноним→AuthModal login), счётчик шеров (иконка+число без слов) в шапке статьи, reconcile-engagement.ts (починил 32 дрейфа ручных тестов), cwd-независимая подгрузка .env в db (чинит db:smoke), e2e +20 (итог 189/189). Отклонения: LikeButton также в NewsCard/IdeaCard (шире U2); IdeaCard liked=false локально (скринер публичный — состояние сбросится после рефетча, принято); e2e-блок требует чистого прогона.
