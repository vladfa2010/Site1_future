# ТЗ-03: Счётчики просмотров на карточках + админская «докрутка»

Статус: **финал v2**, к реализации.
Дата: 2026-11-08.
Связи: существующая таблица `article_views` (`packages/db/src/schema.ts`), фиксация просмотра в `apps/api/src/routes/articles.ts` (GET `/:type/:slug`), аналитика в `apps/api/src/routes/admin.ts` (GET `/api/admin/stats/views`, строка 152), ТЗ-04 (лайки/shares) и ТЗ-09 (время чтения) — **общая миграция 0014, см. §4.4**.

---

## 1. Цель

1. Показывать публичный счётчик просмотров на карточках материалов (ArticleCard, NewsCard, VideoCard, IdeaCard) и на странице статьи (`ArticlePage`).
2. Дать админу (роли `admin` / `super_admin`, НЕ `author`) инструменты «докрутки» счётчиков:
   - **стартовое значение** (seed): начальное число просмотров у материала;
   - **автодокрутка**: раз в `N` часов добавлять случайное число просмотров из диапазона `[min, max]` — бесконечно, пока не выключено.
3. Сохранить честность аналитики: в админке реальные и виртуальные просмотры показываются РАЗДЕЛЬНО.

---

## 2. Текущее состояние

- `article_views (user_id nullable, article_id, viewed_at)` — строка на каждый открытие статьи; индекс `article_views_article_idx(article_id, viewed_at)`.
- Просмотр фиксируется в `GET /api/articles/:type/:slug` асинхронно (`void db.insert(...).catch()`, строка 158), не блокирует ответ.
- Админская аналитика `GET /api/admin/stats/views?days=N` — топ-50 статей по реальным просмотрам за период, поля `views`, `uniqueUsers`, `total`.
- `GET /api/articles` (список, строки 89–108) отдаёт `id, type, slug, title, excerpt, status, publishedAt, coverUrl, videoUrl` — **без просмотров**. Поиск `?q=` (подстрока по title/slug) уже есть — годится для админского поиска статьи.
- `PATCH /api/articles/:id` (строки 218–250): `patchSchema = createSchema.partial()`, автору запрещено менять чужие/опубликованные, `status` автору недоступен — паттерн ролевой защиты есть, расширяем его.
- **Админка — отдельное приложение `apps/admin`** (не `apps/web`): `apps/admin/src/App.tsx` (роуты), `apps/admin/src/components/Layout.tsx` (боковая навигация: статьи, метрики, пользователи…), `apps/admin/src/pages/ArticleEditPage.tsx` (полноценный редактор статьи с RichTextEditor). Утверждение черновика «веб-редактора нет» верно только для `apps/web`; для целей этого ТЗ редактора **достаточно**, отдельную страницу в `apps/web` делать НЕ надо (решение ТЗ, см. §5.3).
- Карточки (`apps/web/src/components/{ArticleCard,NewsCard,VideoCard,IdeaCard}.tsx`) принимают `ArticleListItem` из `apps/web/src/api.ts` (строка 12) — поля `viewsCount` нет ни в типах, ни в API. `NewsCard` уже выводит дату мелким (`text-xs text-zinc-600`, строка 30) — рядом естественное место бейджу просмотров.
- `node-cron` используется в `apps/api/src/index.ts` (дайджесты `0 20 * * *` и `0 20 * * 0`, регистрация в `app.listen`) — паттерн регистрации cron-задач есть.
- Миграции — drizzle-kit (`packages/db/drizzle.config.ts`, `packages/db/migrations/`, последняя `0013_video_type.sql`). **Следующая миграция одна на троих — 0014 (ТЗ-03 + ТЗ-04 + ТЗ-09), состав зафиксирован в §4.4.**
- `meta_fields` (PK `owner_type, owner_id, key`) используется для `meta_description` у статей (`saveMetaDescription`, routes/articles.ts:211).

---

## 3. Требования

### 3.1 Публичный счётчик (R1)

- R1.1. `GET /api/articles` (список, все вызовы: лента, карусели, поисковые выдачи) отдаёт `viewsCount` — **виртуальный** счётчик (см. §4.1).
- R1.2. `GET /api/articles/:type/:slug` (детальная страница) отдаёт `viewsCount` (виртуальный) отдельным полем в корне ответа (рядом с `article`, `coverUrl`, `meta`).
- R1.3. Карточки показывают счётчик в формате «👁 1.2k»: `< 1000` — как есть, `≥ 1000` — с одним десятичным знаком и суффиксом `k` (`1250` → `1.2k`, `580000` → `580k`). Форматтер — один общий хелпер.
- R1.4. Показ на всех четырёх карточках + на `ArticlePage` (рядом с датой публикации). Если `viewsCount = 0` — блок не рендерится.
- R1.5. **(решение ТЗ)** Seed отображается сразу: `viewsBaseOffset > 0` делает `viewsCount > 0` без единого реального просмотра — это и есть смысл стартового значения, отдельной галки «показывать seed» не вводим.

### 3.2 Админские опции докрутки (R2) — только `admin`/`super_admin`

- R2.1. В `PATCH /api/articles/:id` добавить поля настроек (только admin; `author` — 403 при попытке):
  - `viewsBaseOffset: number (int ≥ 0)` — стартовое количество просмотров;
  - `viewsAutoBump: { enabled: boolean, everyHours: int 1..168, min: int ≥ 0, max: int ≥ min } | null` — настройка автодокрутки.
- R2.2. Автор (`author`) НЕ может читать и менять эти настройки: PATCH с этими полями → 403 (даже на свою статью). Колонки физически лежат в `articles` и «утекают» в детальном ответе `article: articles` целиком — **(решение ТЗ)** это приемлемо: там и так есть `authorId` и пр.; важно лишь, что PATCH/список настроек не принимают и не отдают. Если позже потребуется — отдельная задача на чистку детального селекта.
- R2.3. UI: секция «Счётчики просмотров» в **`apps/admin/src/pages/ArticleEditPage.tsx`** (решение ТЗ, см. §2): поля «Стартовые просмотры», чекбокс «Автодокрутка», `everyHours`, `min`, `max`; сохранение через тот же PATCH. Редактор доступен только админам-пользователям админки (вход в `apps/admin` отдельный), повторная клиентская проверка роли в админке избыточна — сервер является единственной линией защиты (решение ТЗ).
- R2.4. Ручной триггер докрутки для теста: `POST /api/admin/views/bump` (admin) — немедленно выполняет один проход авто-докрутки по всем статьям с `enabled = true` и наступившим дедлайном; возвращает `{ processed, details: [{articleId, added}] }`.

### 3.3 Автодокрутка (R3)

- R3.1. Раз в час cron-задача в API (`node-cron`, регистрация в `app.listen` рядом с дайджестами в `apps/api/src/index.ts`) проходит по статьям с включённой автодокруткой, у которых `viewsBumpLastAt + everyHours ≤ now`, и добавляет к `viewsBumpAccumulated` случайное целое из `[min, max]` (вкл.). Обновляет `viewsBumpLastAt = now`.
- R3.2. Докрутка **бесконечная**, пока не выключена: «количество итераций» не задаётся — владельцу достаточно периода и диапазона. Если потребуется ограничение по дате окончания — отдельным полем позже (в ТЗ не входит).
- R3.3. Идемпотентность: выполнение задачи дважды подряд не должно начислять дважды → начисление привязано к `viewsBumpLastAt`, а не к «проходу».
- R3.4. **(решение ТЗ)** При `enabled: false` в PATCH колонки диапазона (`everyHours`, `min`, `max`) **сохраняются, не обнуляются** — повторное включение не требует повторного ввода. Обнуление — только явной перезаписью значений. `viewsBumpLastAt` при включении (`enabled` стал true, а был false/отсутствовал) сбрасывается в `null` → первый тик на ближайшем проходе (cron или ручной триггер).

### 3.4 Честность аналитики (R4)

- R4.1. `GET /api/admin/stats/views` дополняется: для каждой статьи — `realViews` (существующее `count(*)` за период), `virtualViews` (виртуальный счётчик целиком), и, при наличии настроек, `baseOffset` / `accumulatedBump`. Итоговый `total` остаётся по реальным просмотрам; виртуальные не смешиваются с аналитикой.
- R4.2. Виртуальные просмотры **никогда не пишутся** в `article_views` — таблица остаётся источником честной аналитики.

---

## 4. Модель данных

### 4.1 Виртуальный счётчик

```
viewsCount(article) = count(article_views where article_id = X)  -- реальные
                    + views_base_offset                          -- стартовые (seed)
                    + views_bump_accumulated                     -- суммарная докрутка
```

Реальные считаются подзапросом `count(*)`, оффсеты хранятся в колонках. Пересчёт accumulated при каждом тике — дёшево (один UPDATE по PK).

### 4.2 Хранение: новые колонки vs meta_fields — обоснование

**Решение: новые колонки в `articles`** (в составе общей миграции 0014).

Причины:
1. **Типизация и валидация.** Колонки `integer`/`boolean`/`timestamptz` с `notNull`/`default` дают гарантии на уровне БД. В `meta_fields` всё — `text value`, пришлось бы валидировать JSON на каждом чтении, ошибки формата всплывали бы молча.
2. **Частота чтения.** `viewsCount` нужен в КАЖДОЙ строке `GET /api/articles` (лимиты 20–100). С колонками — это бесплатно в том же SELECT. С meta_fields пришлось бы либо доп. JOIN по составному PK `(owner_type, owner_id, key)` на каждый список, либо N+1.
3. **Cron-апдейты.** Тик докрутки = `UPDATE articles SET views_bump_accumulated = ..., views_bump_last_at = now() WHERE id = $1` — одна строка, конкурентно-безопасно. В meta_fields — upsert по составному ключу с сериализацией JSON внутри строки, выше риск race-condition при потере значения.
4. **Индексация/фильтры для cron.** Выбор «статьи, у которых пора докручивать»: `WHERE views_auto_bump_enabled AND views_bump_last_at + every_hours * interval '1 hour' <= now()` — с колонками прямой индекс возможен; с meta_fields — функциональный хелл.
5. `meta_fields` остаётся для SEO-обвязки (meta_description, canonical), где текстовая природа данных уместна. Смешивать туда операционные счётчики — расширять таблицу за пределы её назначения.

### 4.3 Новые колонки `articles` (ТЗ-03)

| Drizzle (camelCase) | Колонка | Тип | Default | Смысл |
|---|---|---|---|---|
| `viewsBaseOffset` | `views_base_offset` | integer notNull | 0 | стартовые просмотры (seed) |
| `viewsAutoBumpEnabled` | `views_auto_bump_enabled` | boolean notNull | false | автодокрутка включена |
| `viewsAutoBumpEveryHours` | `views_auto_bump_every_hours` | integer | null | период, часы (1–168) |
| `viewsAutoBumpMin` | `views_auto_bump_min` | integer | null | мин. добавка |
| `viewsAutoBumpMax` | `views_auto_bump_max` | integer | null | макс. добавка |
| `viewsBumpAccumulated` | `views_bump_accumulated` | integer notNull | 0 | суммарно накручено |
| `viewsBumpLastAt` | `views_bump_last_at` | timestamptz | null | последний тик докрутки |

Первый тик после включения: `viewsBumpLastAt = null` ⇒ докрутка на первом же проходе cron (или ручного триггера).

### 4.4 Общая миграция 0014 (ТЗ-03 + ТЗ-04 + ТЗ-09) — состав зафиксирован

ТЗ-04 (лайки/shares) и ТЗ-09 (время чтения) обе описывают «миграцию 0014». **Решение ТЗ: одна общая миграция `0014_views_likes_reading_time.sql`, генерируется один раз из собранной схемы и закрывает колонки всех трёх ТЗ.** Порядок внутри файла (для ручной сверки, если писать SQL руками):

```sql
-- === ТЗ-03: виртуальный счётчик просмотров ===
ALTER TABLE "articles" ADD COLUMN "views_base_offset" integer NOT NULL DEFAULT 0;
ALTER TABLE "articles" ADD COLUMN "views_auto_bump_enabled" boolean NOT NULL DEFAULT false;
ALTER TABLE "articles" ADD COLUMN "views_auto_bump_every_hours" integer;
ALTER TABLE "articles" ADD COLUMN "views_auto_bump_min" integer;
ALTER TABLE "articles" ADD COLUMN "views_auto_bump_max" integer;
ALTER TABLE "articles" ADD COLUMN "views_bump_accumulated" integer NOT NULL DEFAULT 0;
ALTER TABLE "articles" ADD COLUMN "views_bump_last_at" timestamp with time zone;

-- === ТЗ-04: лайки и шеры ===
CREATE TABLE "article_likes" (...);           -- PK (user_id, article_id) + индекс по article_id
CREATE TABLE "article_share_events" (...);    -- журнал кликов шеринга + 2 индекса
ALTER TABLE "articles" ADD COLUMN "likes_count" integer NOT NULL DEFAULT 0;
ALTER TABLE "articles" ADD COLUMN "shares_count" integer NOT NULL DEFAULT 0;

-- === ТЗ-09: время чтения (nullable осознанно, backfill отдельным скриптом) ===
ALTER TABLE "articles" ADD COLUMN "reading_time" integer;
```

Правила работы с 0014:
1. Сначала в `packages/db/src/schema.ts` добавляются **все** колонки трёх ТЗ (`viewsBaseOffset…viewsBumpLastAt`, `likesCount`, `sharesCount`, `readingTime`, таблицы `articleLikes`/`articleShareEvents` — по ТЗ-04) и только затем `pnpm --filter @newinvest/db drizzle-kit generate` → один файл `0014_*.sql`.
2. Порядок внедрения ТЗ свободный, но **миграция накатывается один раз целиком**; колонки чужих ТЗ присутствуют в схеме до реализации их логики — это нормально (nullable/default-безопасно).
3. Backfill `reading_time` — скриптом из ТЗ-09 после наката; backfill лайков (`likes_count = COUNT(article_likes)`) на старте тривиален (таблица пустая), SQL из ТЗ-04 §4.6 включается в 0014 для корректности восстановления из бэкапа.
4. Если 0014 уже сгенерирована/накатана раньше по одному из соседних ТЗ — этот состав считать эталоном, повторную генерацию не делать; расхождение фиксируется отдельной миграцией 0015+.

---

## 5. Реализация

### 5.1 DB (`packages/db`)

- `src/schema.ts`: 7 колонок из §4.3 в `pgTable('articles', ...)` (строка 172).
- Миграция: общая 0014 по §4.4 (вместе с колонками ТЗ-04/09); применить на dev-БД.

### 5.2 API (`apps/api`)

- **`src/services/viewsBump.ts`** (новый):
  - `runViewsBump(): Promise<{ processed: number; details: { articleId: number; added: number }[] }>` — один проход: SELECT статей с `viewsAutoBumpEnabled AND (viewsBumpLastAt IS NULL OR viewsBumpLastAt + everyHours * interval '1 hour' <= now())`, для каждой `added = randInt(min, max)`, UPDATE `viewsBumpAccumulated += added, viewsBumpLastAt = now`. Один проход — одна транзакция или пакетный UPDATE с RETURNING (на выбор implementor'а; главное — идемпотентность по `viewsBumpLastAt`).
  - `virtualViewsSql` — фрагмент SQL `(select count(*) from article_views av where av.article_id = articles.id) + articles.views_base_offset + articles.views_bump_accumulated` для переиспользования в списке/детали/статистике.
- **`src/index.ts`**: в `app.listen` после дайджестов — `cron.schedule('7 * * * *', ...)` (раз в час на 7-й минуте; не :00/:30, чтобы не совпадать с дайджестами и не грузить старт часа).
- **`src/routes/articles.ts`**:
  - `GET /` (строки 89–108) — добавить в select `viewsCount: sql<number>`${virtualViewsSql}`` (R1.1).
  - `GET /:type/:slug` (строка 163) — добавить `viewsCount: sql…` в ответ (R1.2).
  - `PATCH /:id` (строки 218–250) — расширить `patchSchema`: `viewsBaseOffset` (int ≥ 0), `viewsAutoBump` (объект из R2.1). Валидация zod: `max ≥ min ≥ 0`, `everyHours ∈ [1, 168]`. При `!isAdmin(req.user!.role)` и наличии любого из этих полей в теле → 403 до прочих проверок (R2.2). Раскладывать объект в 5 колонок §4.3; по правилу R3.4 управлять `viewsBumpLastAt` (null при новом включении, сохранять при выключении).
- **`src/routes/admin.ts`**:
  - `POST /views/bump` — вызов `runViewsBump()` (R2.4), рядом со `stats/views` (строка 152).
  - `GET /stats/views` — добавить `virtualViews`, `baseOffset`, `accumulatedBump` в строки; `total` не менять (R4.1).

### 5.3 Админка (`apps/admin`) — решение ТЗ

Черновик предлагал минимальную страницу в `apps/web`. **Отклонено:** админка уже существует как `apps/admin` с редактором статьи и навигацией (`Layout.tsx`); второй админский UI в `apps/web` — дублирование и рассинхрон. Делается так:

- **`src/pages/ArticleEditPage.tsx`**: новая секция «Счётчики просмотров» (внизу формы, отдельный fieldset): числовое поле «Стартовые просмотры», чекбокс «Автодокрутка», при включении — `everyHours` (1–168), `min`, `max`. Состояние собирается в `viewsBaseOffset` / `viewsAutoBump` того же PATCH, что и остальная форма. При загрузке статьи — предзаполнение текущими колонками (детальный GET отдаёт `article` целиком, значения на месте).
- **`src/api.ts`**: типы полей статьи + метод `adminViewsBump(): POST /admin/views/bump`.
- **`src/pages/StatsPage.tsx`**: добавить колонки «Виртуальные» / «Seed» / «Докручено» в таблицу просмотров (если страница показывает `/stats/views`; иначе вывести отдельным блоком).
- Навигация (`Layout.tsx`) — **без изменений**: секция живёт внутри существующего редактора.

### 5.4 Web (`apps/web`) — только публичный показ

- **`src/api.ts`**: в `ArticleListItem` (строка 12) и тип детальной страницы добавить `viewsCount: number`.
- **`src/lib/format.ts`** (новый): `formatViews(n)` — форматирование `k` (R1.3): `0→'0'`, `999→'999'`, `1000→'1.0k'`, `1250→'1.2k'`, `580000→'580k'`. В репо нет jest/vitest в `apps/web` — проверка кейсами из §Тестирование (ручной скрипт/консоль) либо добавить минимальный тест-раннер только если он уже есть в workspace.
- **Компонент `src/components/ViewsBadge.tsx`** (новый): `<span className="text-xs text-zinc-500">👁 {formatViews(n)}</span>`; при `n <= 0` возвращает `null` (R1.4). Использовать в:
  - `ArticleCard.tsx` — под эксерптом, отдельной строкой;
  - `NewsCard.tsx` — в одну строку с датой через «·» (строка 30);
  - `VideoCard.tsx` — рядом с заголовком/датой;
  - `IdeaCard.tsx` — в строке бейджей;
  - `pages/ArticlePage.tsx` — в мета-строке (дата + просмотры).

### 5.5 Порядок работ

1. Общая миграция 0014 + схема (§4.4, §5.1) — координация с ТЗ-04/09.
2. `viewsBump.ts` + cron + ручной триггер (§5.2, R3).
3. `viewsCount` в список/деталь (R1.1, R1.2).
4. PATCH-настройки с защитой ролей (R2.1, R2.2, R3.4).
5. Форматтер + `ViewsBadge` + 4 карточки + `ArticlePage` (R1.3–R1.5).
6. Админская аналитика: разделение real/virtual (R4).
7. Секция в `ArticleEditPage` + кнопка ручного бампа в админке (R2.3, R2.4).

---

## 6. Тестирование

Ручное (curl) + наблюдение логов; автотесты — только если тест-раннер уже есть в затронутом workspace.

1. **Миграция**: накатить 0014 на чистую БД и на копию продуктовой — без правок руками; `\d articles` показывает все 10 новых колонок (7 views + likes_count + shares_count + reading_time).
2. **Список/деталь**: `GET /api/articles?limit=5` → у каждой строки есть `viewsCount`; то же на `/:type/:slug`; значение равно `COUNT(article_views) + baseOffset + accumulated` (сверка SQL-запросом на 2–3 статьях).
3. **PATCH роли**: токен `author` + `{"viewsBaseOffset": 100}` → 403 и колонка не изменилась; токен `admin` → 200, значение сохранено. PATCH без этих полей от author → по-прежнему работает (регрессия).
4. **Валидация**: `max < min`, `everyHours = 0`, `everyHours = 200`, `viewsBaseOffset = -5` → 400.
5. **Ручной бамп**: на статье с `enabled=true, min=10, max=20, lastAt=null` — `POST /api/admin/views/bump` → `added ∈ [10, 20]`, `viewsBumpLastAt` обновлён; повторный вызов подряд → `processed: 0` (идемпотентность); `viewsCount` вырос ровно на сумму начислений.
6. **Честность**: `SELECT count(*) FROM article_views` до и после бампа — не изменился (R4.2).
7. **Cron**: временно поставить паттерн `*/2 * * * *` в dev → в логах API `[cron] views bump: …` каждые 2 минуты; статья с `everyHours=1` докручивается ~1 раз в час; вернуть `7 * * * *`.
8. **Форматтер**: кейсы `0/999/1000/1250/9999/580000` → `0/999/1.0k/1.2k/10.0k/580k` (9999 → `10.0k` после округления — допустимо, фиксируем поведение).
9. **UI**: на всех 4 карточках и `ArticlePage` бейдж виден; при `viewsCount=0` отсутствует; на мобильной ширине не ломает вёрстку карточек.
10. **Сид-отображение**: статье выставлен `viewsBaseOffset=500`, реальных просмотров 0 → на карточке «👁 500» (R1.5).
11. **typecheck**: `npm run typecheck` зелёный в `apps/api`, `apps/web`, `apps/admin`, `packages/db`.

---

## 7. Критерии приёмки

- [ ] `GET /api/articles` и `/api/articles/:type/:slug` возвращают `viewsCount` = реальные + `baseOffset` + `accumulated` (проверить на статье с заведомо известными значениями).
- [ ] На всех 4 карточках и `ArticlePage` виден «👁 N»; форматирование: 999 → `999`, 1000 → `1.0k`, 1250 → `1.2k`, 580000 → `580k`; при 0 блок скрыт.
- [ ] PATCH настроек от `author` → 403; от `admin`/`super_admin` → 200, значения сохранены; невалидные диапазоны → 400.
- [ ] Автодокрутка: `POST /api/admin/views/bump` немедленно начисляет `[min, max]` всем «созревшим» статьям; второй вызов подряд — 0 начислений (идемпотентность); `viewsCount` вырос ровно на сумму начислений.
- [ ] Cron: в логах API виден ежечасный прогон (`[cron] views bump: …`); статья с `everyHours = 2` докручивается ~2 раза в сутки.
- [ ] Админская аналитика (`/stats/views` и StatsPage) показывает реальные и виртуальные просмотры раздельными колонками; `total` — по реальным.
- [ ] В `article_views` не появляется ни одной строки от докрутки (проверка SQL-запросом: `count(*)` не меняется после бампа).
- [ ] Миграция 0014 (общая с ТЗ-04/09) накатывается на чистую БД и на продуктовую копию без правок руками.
- [ ] Настройки докрутки редактируются в `apps/admin` (ArticleEditPage) и сохраняются тем же PATCH.

---

## 8. Риски и замечания

1. **Cron в dev vs prod.** `node-cron` живёт в процессе API: в dev при остановленном сервере докрутка не идёт — при перезапуске накопившиеся «созревшие» статьи докрутятся одним проходом (это корректно по модели). В prod убедиться, что запущен ровно один инстанс API, иначе два процесса с cron → гонка начислений. Защита: UPDATE … WHERE просрочен, с проверкой RETURNING; при конфликте второй инстанс просто не найдёт «созревших» строк. Минимально достаточно, полноценный lock — отдельной задачей.
2. **Дробление кэша.** Если позже появится HTTP-кэш/CDN для `GET /api/articles`, счётчики закэшируются и перестанут расти на карточках. Правило: список кэшировать коротко (≤ 60 с) или выносить `viewsCount` в отдельный лёгкий эндпоинт. Сейчас кэша нет — риск отложенный.
3. **Производительность списка.** Подзапрос `count(*)` на `article_views` на каждую строку списка (до 100) — ок при текущих объёмах; если просмотров станет миллионы — перейти на материализованный счётчик реальных просмотров (колонка `views_real_count`, обновляемая инкрементом при фиксации просмотра). Заложить в модель уже сейчас имя функции `virtualViewsSql`, чтобы замена была точечной.
4. **Этика/прозрачность.** Докрутка — по сути имитация популярности. Продуктовое решение владельца зафиксировано; требование ТЗ — строгое разделение честной аналитики (R4) и отсутствие «докрученных» строк в `article_views`.
5. **Отсутствие секции в редакторе до реализации ТЗ.** Пока секция в `apps/admin` не сделана, настройки можно менять только прямыми PATCH — допустимо как переходное состояние, но не более одного релиза.
6. **Совместная миграция 0014.** Риск расхождения, если ТЗ-04/09 начнут делать раньше и сгенерируют свою 0014: правило одной миграции (§4.4) обязательно к соблюдению всеми тремя задачами.

---

## Правки ревью v2.1 (принято, обязательны к реализации)

1. **viewsCount — во ВСЕ эндпоинты списков**: entities.ts (компании, тренды), stories.ts (сюжеты), bindings.ts (events), screener.ts (IdeaCard — своя выборка!), search.ts. Правило: «viewsCount обязателен в каждом эндпоинте, отдающем список статей/идей». Иначе бейдж дробный — где-то есть, где-то нет.
2. **Явно зафиксировать**: при простое сервера пропущенные периоды НЕ компенсируются — один бамп за проход, догоняющих начислений нет.
3. zod: `viewsAutoBump` — `.nullable()` (явный null принимаем); частичный объект (`{enabled:true}` без min/max) → 400 (валидируется целиком).
4. **Критично**: поля докрутки добавлять через `patchSchema = createSchema.partial().extend({ viewsBaseOffset, viewsAutoBump })` — НЕ в createSchema (иначе автор сможет задать seed при POST).
5. CHECK-констрейнт в 0014: `NOT (views_auto_bump_enabled AND views_auto_bump_every_hours IS NULL)`.
6. VideoCard: бейдж «под заголовком» (даты в VideoCard нет — референс в v2 неточный). Скрывать НЕ нужно.
7. NewsCard: цвет бейджа привести к `text-zinc-600` (как дата).
8. Форматтер: `9999 → 9.9k` (floor, не round).
9. Секция в редакторе — collapsible (`<details>`), форма и так ~600 строк.
10. Скрытие секции по роли: UI показывать только admin/super_admin (авторы в админке бывают, сервер всё равно 403).
11. ⚠️ Этика/риски (дополнить §8.4): внешний аудит (рекламодатели, продажа по просмотрам) — докрученные цифры в публичном поле = репутационно-юридический риск; скриншоты счётчиков живут вечно. Решение владельца принято осознанно.
12. Тиккер (ТЗ-07) использует реальные просмотры за окно — консистентность подтверждена, 👁 из тиккера убирается (правка в ТЗ-07).
