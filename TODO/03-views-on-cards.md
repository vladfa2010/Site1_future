# ТЗ-03: Счётчики просмотров на карточках + админская «докрутка»

Статус: черновик ТЗ, к реализации.
Дата: 2026-11-08.
Связи: существующая таблица `article_views` (`packages/db/src/schema.ts`), фиксация просмотра в `apps/api/src/routes/articles.ts` (GET `/:type/:slug`), аналитика в `apps/api/src/routes/admin.ts` (GET `/api/admin/stats/views`).

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
- Просмотр фиксируется в `GET /api/articles/:type/:slug` асинхронно (`void db.insert(...)`), не блокирует ответ.
- Админская аналитика `GET /api/admin/stats/views?days=N` — топ-50 статей по реальным просмотрам за период, поля `views`, `uniqueUsers`, `total`.
- `GET /api/articles` (список) отдаёт `id, type, slug, title, excerpt, status, publishedAt, coverUrl, videoUrl` — **без просмотров**.
- Карточки (`apps/web/src/components/{ArticleCard,NewsCard,VideoCard,IdeaCard}.tsx`) принимают `ArticleListItem` / `Idea` из `apps/web/src/api.ts` — поля `viewsCount` нет ни в типах, ни в API.
- Веб-редактора статей на фронте пока нет (создание/редактирование идёт напрямую в API: `POST /api/articles`, `PATCH /api/articles/:id`). Админских страниц в `apps/web/src/pages` нет (упоминания admin — только в `CabinetPage`).
- `node-cron` уже используется в `apps/api/src/index.ts` (дайджесты 20:00 и вс 20:00) — паттерн регистрации cron-задач есть.
- Миграции — drizzle-kit (`packages/db/drizzle.config.ts`, `packages/db/migrations/`, последняя `0013_video_type.sql`).
- `meta_fields` (PK `owner_type, owner_id, key`) уже используется для `meta_description` у статей (`saveMetaDescription` в `routes/articles.ts`).

---

## 3. Требования

### 3.1 Публичный счётчик (R1)

- R1.1. `GET /api/articles` (список, все вызовы: лента, карусели, поисковые выдачи) отдаёт `viewsCount` — **виртуальный** счётчик (см. §4).
- R1.2. `GET /api/articles/:type/:slug` (детальная страница) отдаёт `viewsCount` (виртуальный) отдельным полем в корне ответа.
- R1.3. Карточки показывают счётчик в формате «👁 1.2k»: `< 1000` — как есть, `≥ 1000` — с одним десятичным знаком и суффиксом `k` (`1250` → `1.2k`, `580000` → `580k`). Форматтер — один общий хелпер.
- R1.4. Показ на всех четырёх карточках + на `ArticlePage` (рядом с датой публикации). Если `viewsCount = 0` — блок не рендерится.

### 3.2 Админские опции докрутки (R2) — только `admin`/`super_admin`

- R2.1. В `PATCH /api/articles/:id` добавить поля настроек (только admin; `author` — 403 при попытке):
  - `viewsBaseOffset: number (int ≥ 0)` — стартовое количество просмотров;
  - `viewsAutoBump: { enabled: boolean, everyHours: int 1..168, min: int ≥ 0, max: int ≥ min } | null` — настройка автодокрутки.
- R2.2. Автор (`author`) НЕ может читать и менять эти настройки: PATCH с этими полями → 403 (даже на свою статью). Чтение настроек — только через админские эндпоинты (§5).
- R2.3. UI: поскольку веб-редактора статьи сейчас нет, делается **минимальная админская страница** в `apps/web/src/pages` (например `AdminArticlePage` / блок в будущем редакторе): поиск статьи по названию → поля «Стартовые просмотры», чекбокс «Автодокрутка», `everyHours`, `min`, `max` → сохранение через PATCH. Роут защищён проверкой `role ∈ {admin, super_admin}` на клиенте (сервер всё равно валидирует).
- R2.4. Ручной триггер докрутки для теста: `POST /api/admin/views/bump` (admin) — немедленно выполняет один проход авто-докрутки по всем статьям с `enabled = true` и наступившим дедлайном; возвращает список `{articleId, added}`.

### 3.3 Автодокрутка (R3)

- R3.1. Раз в час cron-задача в API (`node-cron`, регистрация рядом с дайджестами в `apps/api/src/index.ts`) проходит по статьям с включённой автодокруткой, у которых `lastBumpAt + everyHours ≤ now`, и добавляет к `accumulated` случайное целое из `[min, max]` (вкл.). Обновляет `lastBumpAt = now`.
- R3.2. Докрутка **бесконечная**, пока не выключена: «количество итераций» не задаётся — владельцу достаточно периода и диапазона. Если потребуется ограничение по дате окончания — отдельным полем позже (в ТЗ не входит).
- R3.3. Идемпотентность: выполнение задачи дважды подряд не должно начислять дважды → начисление привязано к `lastBumpAt`, а не к «проходу».

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

**Решение: новые колонки в `articles`** (миграция `0014_*.sql` через drizzle-kit).

Причины:
1. **Типизация и валидация.** Колонки `integer`/`boolean`/`timestamptz` с `notNull`/`default` дают гарантии на уровне БД. В `meta_fields` всё — `text value`, пришлось бы валидировать JSON на каждом чтении, ошибки формата всплывали бы молча.
2. **Частота чтения.** `viewsCount` нужен в КАЖДОЙ строке `GET /api/articles` (лимиты 20–100). С колонками — это бесплатно в том же SELECT. С meta_fields пришлось бы либо доп. JOIN по составному PK `(owner_type, owner_id, key)` на каждый список, либо N+1.
3. **Cron-апдейты.** Тик докрутки = `UPDATE articles SET views_bump_accumulated = ..., views_bump_last_at = now() WHERE id = $1` — одна строка, конкурентно-безопасно. В meta_fields — upsert по составному ключу с сериализацией JSON внутри строки, выше риск race-condition при потере значения.
4. **Индексация/фильтры для cron.** Выбор «статьи, у которых пора докручивать»: `WHERE views_auto_bump_enabled AND views_bump_last_at + every_hours * interval '1 hour' <= now()` — с колонками прямой индекс возможен; с meta_fields — функциональный хелл.
5. `meta_fields` остаётся для SEO-обвязки (meta_description, canonical), где текстовая природа данных уместна. Смешивать туда операционные счётчики — расширять таблицу за пределы её назначения.

### 4.3 Новые колонки `articles`

| Колонка | Тип | Default | Смысл |
|---|---|---|---|
| `views_base_offset` | integer notNull | 0 | стартовые просмотры (seed) |
| `views_auto_bump_enabled` | boolean notNull | false | автодокрутка включена |
| `views_auto_bump_every_hours` | integer | null | период, часы (1–168) |
| `views_auto_bump_min` | integer | null | мин. добавка |
| `views_auto_bump_max` | integer | null | макс. добавка |
| `views_bump_accumulated` | integer notNull | 0 | суммарно накручено |
| `views_bump_last_at` | timestamptz | null | последний тик докрутки |

Первый тик после включения: `lastBumpAt = null` ⇒ докрутка на первом же проходе cron (или ручного триггера).

---

## 5. Реализация

### 5.1 DB (`packages/db`)

- `src/schema.ts`: колонки из §4.3 в `pgTable('articles', ...)`.
- Миграция: `pnpm --filter @newinvest/db drizzle-kit generate` → `migrations/0014_*.sql`, применить на dev-БД.

### 5.2 API (`apps/api`)

- **`src/services/viewsBump.ts`** (новый):
  - `runViewsBump(): Promise<{ processed: number; details: { articleId: number; added: number }[] }>` — один проход: SELECT статей с `enabled AND (last_at IS NULL OR last_at + every_hours*h <= now())`, для каждой `added = randInt(min, max)`, UPDATE `accumulated += added, last_at = now`. Один проход — одна транзакция или пакетный UPDATE с возвратом (на выбор implementor'а; главное — идемпотентность по `last_at`).
  - `virtualViewsSql` — фрагмент SQL `(select count(*) from article_views av where av.article_id = articles.id) + articles.views_base_offset + articles.views_bump_accumulated` для переиспользования в списке/детали/статистике.
- **`src/index.ts`**: `cron.schedule('7 * * * *', ...)` — раз в час на 7-й минуте (не на :00/:30, чтобы не совпадать с дайджестами).
- **`src/routes/articles.ts`**:
  - `GET /` — добавить в select `viewsCount: sql<number>`${virtualViewsSql}`` (R1.1).
  - `GET /:type/:slug` — добавить `viewsCount` в ответ (R1.2).
  - `PATCH /:id` — расширить `patchSchema`: `viewsBaseOffset`, `viewsAutoBump` (объект из R2.1); при `role === 'author'` наличие этих полей → 403 (R2.2). Валидация: `max ≥ min ≥ 0`, `everyHours ∈ [1, 168]`, `viewsBaseOffset ≥ 0`. Сохранять в колонки §4.3; при включении автодокрутки сбрасывать `lastBumpAt = null` (первый тик сразу).
- **`src/routes/admin.ts`**:
  - `POST /views/bump` — вызов `runViewsBump()` (R2.4).
  - `GET /stats/views` — добавить `virtualViews`, `baseOffset`, `accumulatedBump` в строки; `total` не менять (R4.1).

### 5.3 Web (`apps/web`)

- **`src/api.ts`**: в `ArticleListItem` и `ArticleDetail` добавить `viewsCount: number`; в `Idea` — `viewsCount` (скринер тоже должен отдавать; доработать `routes/screener.ts` аналогично). Методы админки: `adminViewsBump()`.
- **`src/lib/format.ts`** (новый): `formatViews(n)` — форматирование `k` (R1.3), покрыть юнит-тестом если тест-раннер есть, иначе минимум ручная проверка кейсов `0/999/1000/1250/580000`.
- **Компонент `src/components/ViewsBadge.tsx`** (новый): `<span>👁 {formatViews(n)}</span>` в стиле карточек (text-xs text-zinc-500). Использовать в:
  - `ArticleCard.tsx` — под обложкой/эксерптом;
  - `NewsCard.tsx` — рядом с датой;
  - `VideoCard.tsx` — рядом с заголовком;
  - `IdeaCard.tsx` — в строке бейджей;
  - `pages/ArticlePage.tsx` — в мета-строке (дата + просмотры).
- **Страница `src/pages/AdminViewsPage.tsx`** (новая, R2.3): поиск статьи (через `GET /api/articles?q=`), форма настроек докрутки, кнопка «Запустить докрутку сейчас» (`POST /api/admin/views/bump`). Роут `/admin/views`, видим только при `role ∈ {admin, super_admin}` (флаг из `auth.tsx`; сервер — вторая линия защиты).

### 5.4 Порядок работ

1. Миграция + схема (§5.1).
2. `viewsBump.ts` + cron + ручной триггер (§5.2, R3).
3. `viewsCount` в список/деталь/скринер (R1.1, R1.2).
4. PATCH-настройки с защитой ролей (R2.1, R2.2).
5. Форматтер + `ViewsBadge` + 4 карточки + `ArticlePage` (R1.3, R1.4).
6. Админская аналитика: разделение real/virtual (R4).
7. Админская страница настроек (R2.3).

---

## 6. Критерии приёмки

- [ ] `GET /api/articles` и `/api/articles/:type/:slug` возвращают `viewsCount` = реальные + `baseOffset` + `accumulated` (проверить на статье с заведомо известными значениями).
- [ ] На всех 4 карточках и `ArticlePage` виден «👁 N»; форматирование: 999 → `999`, 1000 → `1.0k`, 1250 → `1.2k`, 580000 → `580k`; при 0 блок скрыт.
- [ ] PATCH настроек от `author` → 403; от `admin`/`super_admin` → 200, значения сохранены.
- [ ] Автодокрутка: `POST /api/admin/views/bump` немедленно начисляет `[min, max]` всем «созревшим» статьям; второй вызов подряд — 0 начислений (идемпотентность); `viewsCount` вырос ровно на сумму начислений.
- [ ] Cron: в логах API виден ежечасный прогон (`[cron] views bump: …`); статья с `everyHours = 2` докручивается ~2 раза в сутки.
- [ ] Админская аналитика показывает реальные и виртуальные просмотры раздельными колонками; `total` — по реальным.
- [ ] В `article_views` не появляется ни одной строки от докрутки (проверка SQL-запросом: `count(*)` не меняется после бампа).
- [ ] Миграция накатывается на чистую БД и на продуктовую копию без правок руками.

---

## 7. Риски и замечания

1. **Cron в dev vs prod.** `node-cron` живёт в процессе API: в dev при остановленном сервере докрутка не идёт — при перезапуске накопившиеся «созревшие» статьи докрутятся одним проходом (это корректно по модели). В prod убедиться, что запущен ровно один инстанс API, иначе два процесса с cron → гонка начислений. Защита: UPDATE … WHERE просрочен, с проверкой `affectedRows`/returning; при конфликте второй инстанс просто не найдёт «созревших» строк. Минимально достаточно, полноценный lock — отдельной задачей.
2. **Дробление кэша.** Если позже появится HTTP-кэш/CDN для `GET /api/articles`, счётчики закэшируются и перестанут расти на карточках. Правило: список кэшировать коротко (≤ 60 с) или выносить `viewsCount` в отдельный лёгкий эндпоинт. Сейчас кэша нет — риск отложенный.
3. **Производительность списка.** Подзапрос `count(*)` на `article_views` на каждую строку списка (до 100) — ок при текущих объёмах; если просмотров станет миллионы — перейти на материализованный счётчик реальных просмотров (колонка `views_real_count`, обновляемая триггером/инкрементом при фиксации просмотра). Заложить в модель уже сейчас имя функции `virtualViewsSql`, чтобы замена была точечной.
4. **Этика/прозрачность.** Докрутка — по сути имитация популярности. Продуктовое решение владельца зафиксировано; требование ТЗ — строгое разделение честной аналитики (R4) и отсутствие «докрученных» строк в `article_views`.
5. **Отсутствие веб-редактора.** Админская страница настроек (R2.3) — временная, до появления полноценного редактора статьи; тогда поля переедут в него, API меняться не будет.
