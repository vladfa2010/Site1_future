# ТЗ 09 — Время чтения материалов («N мин чтения») — v2 (финал)

## Цель

На медиа «инвестиционно.рф» показывать пользователю ожидаемое время чтения материала:
«3 мин чтения», «12 мин чтения» и т.п. Расчёт — автоматический, без участия редактора
(вводная владельца: «расчёт времени чтения делаем. в админке автоматический расчёт»).

Статус: финальная редакция ТЗ, к реализации. Дата: 2026-11-08.
Связи: ТЗ-04 (лайки/шеры — **общая миграция 0014**, состав зафиксирован в §3),
ТЗ-03 (счётчики просмотров на тех же карточках — координация вывода).

---

## Текущее состояние (проверено по коду)

- Тело материала хранится в `articles.content_html` (Drizzle `articles.contentHtml`,
  `packages/db/src/schema.ts:179`). Также есть `excerpt`, `thesis`, `video_url`, `status`, `published_at`.
- **`stripHtml` продублирована в 4 местах полными копиями** (плюс 2 inline-замены):
  1. `packages/db/src/embed.ts:20-22` — `/<[^>]+>/g`,
  2. `packages/db/src/migrate-wp.ts:59` — `/<[^>]*>/g`,
  3. `apps/admin/src/pages/ArticleEditPage.tsx:256` — `/<[^>]*>/g`,
  4. `apps/web/src/pages/TrendPage.tsx:27` — `/<[^>]*>/g`,
  - inline (не полные копии, но тот же приём): `apps/api/src/services/textGen.ts:61`
    (mock-экстрактор для LLM, стрипит не HTML-контент статьи) и
    `apps/web/src/pages/HomePage.tsx:122` (однострочная замена для описания тренда).
  Везде суть одна: заменить теги на пробелы, схлопнуть пробелы, обрезать.
- Сохранение материала — `apps/api/src/routes/articles.ts`:
  `POST /api/articles` (строки 173–208, insert в строке 190–193),
  `PATCH /api/articles/:id` (строки 218–250, update в строке 245),
  `POST /api/articles/propose` (строки 254–279, конвертирует plain text в HTML через `plainTextToHtml`,
  insert в строке 271–277),
  `POST /api/articles/:id/publish` (строки 282–293, контент не трогает).
- Список `GET /api/articles` (строки 89–108) отдаёт узкий селект:
  `id, type, slug, title, excerpt, status, publishedAt, coverUrl, videoUrl`.
  Детальная `GET /api/articles/:type/:slug` (строка 112+) отдаёт `article: articles` целиком + `coverUrl`.
- **Список идей НЕ идёт через `GET /api/articles`** — `IdeaCard` получает тип `Idea`
  (`apps/web/src/api.ts:95`) из отдельного эндпоинта `apps/api/src/routes/screener.ts`
  (`GET /api/screener/ideas`, селект строки 52–77). Это отдельное место для добавления поля,
  в v1 ТЗ оно было пропущено.
- Карточки на фронте (`apps/web/src/components/`): `ArticleCard.tsx`, `NewsCard.tsx`,
  `VideoCard.tsx`, `IdeaCard.tsx`. `NewsCard` уже выводит дату мелким шрифтом
  (`text-xs text-zinc-600`, строка 30). `ArticleCard` и `VideoCard` даты не выводят,
  `IdeaCard` — тоже.
- **На странице материала (`ArticlePage.tsx`) дата публикации сейчас не рендерится вообще**
  (проверено грепом: `publishedAt` на странице не используется). В v1 ТЗ было «рядом с
  датой/автором» — это неточно, место вывода уточнено в R4.
- Миграции — сырой SQL в `packages/db/migrations/` (последняя — `0013_video_type.sql`,
  формат `ALTER TABLE "articles" ADD COLUMN IF NOT EXISTS ...` — файлы дорабатываются вручную
  после `drizzle-kit generate`). Применяются через `npm run db:migrate`.
- ТЗ-04 забирает номер 0014 под себя: таблицы `article_likes`, `article_share_events`
  + колонки `likes_count`, `shares_count` (TODO/04-likes-counters.md §3.1–3.2).
  Колонка `reading_time` вливается в **тот же файл** — см. §3.
- В репо есть `tsx` (devDependency в `packages/db` и `apps/api`), паттерн скриптов:
  `packages/db/src/embed.ts`, npm-скрипты вида `"embed": "tsx src/embed.ts"`,
  корневые прокси `"db:smoke": "npm run smoke -w @newinvest/db"`.
- `@newinvest/db` экспортирует только `"." → ./src/index.ts` (`packages/db/package.json`),
  и `index.ts` при импорте **создаёт pg.Pool и грузит dotenv** — импорт пакета в браузерный
  бандл недопустим. Это определяет стратегию R6.
- Существующих материалов ~306 (WordPress-миграция). У них `reading_time` отсутствует — нужен backfill.

---

## Модель данных

**Решение ТЗ: отдельная колонка `articles.reading_time integer`, не meta_fields.**

Альтернатива — ключ `reading_time` в `meta_fields` (owner_type='article', паттерн
`saveMetaDescription`, articles.ts:211) проигрывает колонке:

- колонка выбирается одним селектом вместе со списком (списку время чтения нужно всегда —
  306+ запросов к meta_fields на страницу ленты);
- тип `int` схемы vs `text` значений meta_fields (кастинг на каждом чтении);
- сортировка/фильтрация по времени чтения (потенциально «длинные чтения») на уровне SQL;
- семантически это атрибут материала, как `published_at`, а не произвольная метка.

### Состав общей миграции 0014 (зафиксирован, объединяет ТЗ-04 и ТЗ-09)

Один файл `packages/db/migrations/0014_<generated>.sql`, один прогон `npm run db:generate`
после правок схемы из обоих ТЗ. Состав:

```sql
-- ТЗ-04:
CREATE TABLE article_likes (...);          -- PK (user_id, article_id) + индекс
CREATE TABLE article_share_events (...);   -- + 2 индекса
ALTER TABLE "articles" ADD COLUMN IF NOT EXISTS "likes_count" integer NOT NULL DEFAULT 0;
ALTER TABLE "articles" ADD COLUMN IF NOT EXISTS "shares_count" integer NOT NULL DEFAULT 0;
-- ТЗ-04 backfill счётчиков: UPDATE ... FROM (SELECT article_id, COUNT(*) ...) (таблицы пусты, но миграция должна быть корректна для восстановления из бэкапа)

-- ТЗ-09 (наше):
ALTER TABLE "articles" ADD COLUMN IF NOT EXISTS "reading_time" integer;
```

**Решение ТЗ:** колонку `reading_time` миграция **не заполняет** (нет DEFAULT и нет UPDATE в SQL) —
заполнение только backfill-скриптом R8. `integer` nullable осознанно: существующие строки
до backfill имеют `NULL` — фронт по `NULL` ничего не показывает (аккуратная деградация).
Nullable оставляем навсегда: `NULL` = «не рассчитано» (например, материал создан до
внедрения и backfill ещё не гоняли, либо контент пустой).

Ручная доводка после `drizzle-kit generate`: добавить `IF NOT EXISTS` к ALTER (как в 0013)
и backfill-UPDATE счётчиков из ТЗ-04.

В `packages/db/src/schema.ts` в `articles` (после `videoUrl`, строка 183) добавить:

```ts
readingTime: integer('reading_time'), // минуты чтения, авто-пересчёт при сохранении (TODO 09); NULL = не рассчитано
```

---

## Требования

### R1. Расчёт

- Чистый текст: `stripHtml(content_html)` — единая реализация (см. R6).
- Слова: `countWords(text) = text.split(/\s+/).filter(Boolean).length`.
- Минуты: `calcReadingTime(contentHtml, wpm = 200) = Math.max(1, Math.round(countWords(stripHtml(contentHtml)) / wpm))`.
- **Обоснование 200 слов/мин:** для русского языка средняя скорость чтения
  взрослым — ~150–250 слов/мин в зависимости от сложности текста; 200 — серединный
  компромисс между лёгкими новостями (~250) и плотной аналитикой (~150). Формат
  «N мин» (без десятых) сам по себе округляет погрешность; точность 250 vs 200
  на типичном материале отличается на ±1 минуту — приемлемо. Смена константы — один
  аргумент `wpm`, без миграций.
- **Решение ТЗ:** HTML-сущности (`&nbsp;`, `&mdash;` и т.п.) НЕ декодируем — после WP-миграции
  в контенте их мало, а тащить decoder в общую утилиту ради ±1 «слова» избыточно. Зафиксировано.
- В расчёт входит только тело `content_html`; `excerpt`, `thesis`, заголовок не считаем.

### R2. Где считается (автоматический расчёт = на бэке при сохранении)

- `POST /api/articles` (articles.ts:190–193): в `.values()` добавить
  `readingTime: calcReadingTime(data.contentHtml)`.
- `PATCH /api/articles/:id` (articles.ts:245): если в `updates` пришёл `contentHtml`
  (`!== undefined`) — `updates.readingTime = calcReadingTime(updates.contentHtml)`;
  если PATCH без `contentHtml` (только смена статуса, обложки и т.п.) — колонку не трогать.
  **Важно:** не считать от `existing.contentHtml` при отсутствии поля в PATCH — иначе любой
  PATCH перезатрёт значение (сейчас не страшно, т.к. фронт админки шлёт весь payload,
  но хрупко).
- `POST /api/articles/propose` (articles.ts:271–277): считать от `text` (plain text ДО
  `plainTextToHtml` — результат идентичен, на одну конвертацию меньше).
- `POST /api/articles/:id/publish`: не считать (контент не меняется).
- **Решение ТЗ:** маршрут пейволла/доступа на расчёт не влияет; расчёт выполняется для
  материалов всех типов, включая видео (дешево, значение пригодится при смене типа и
  на детальной странице — см. R5).

### R3. API

- `GET /api/articles` (список, селект строки 89–100): добавить `readingTime: articles.readingTime`.
  В `ArticleListItem` (`apps/web/src/api.ts:12`) добавить `readingTime: number | null`.
- `GET /api/articles/:type/:slug` (детальная): отдаёт `article: articles` целиком —
  колонка подтянется автоматически. В `ArticleDetail` (`apps/web/src/api.ts:23`)
  поле тоже появится автоматически через наследование от `ArticleListItem`, отдельная
  правка не нужна (проверить typecheck'ом).
- **`GET /api/screener/ideas` (screener.ts:52–77) — добавить `readingTime: articles.readingTime`
  в селект.** Это список, который питает `IdeaCard`; в v1 ТЗ было пропущено. В тип `Idea`
  (`apps/web/src/api.ts:95`) добавить `readingTime: number | null`.

### R4. Фронт (показ)

- **Страница материала** (`apps/web/src/pages/ArticlePage.tsx`): выводить под заголовком
  (`<h1>`, строка 100), над телом, в одну строку с типом материала/датой, если она
  появится позже. Формат «N мин чтения», инлайн SVG-иконка часов (stroke текущего цвета,
  `className="h-3.5 w-3.5"`), текст мелкий (`text-sm text-zinc-600`). **Уточнение по v1:**
  даты на странице сейчас нет — «рядом с датой» некорректно; не добавляем дату в рамках
  этого ТЗ (отдельная задача/ТЗ-03 по аналогии).
- **Карточки** (`ArticleCard`, `NewsCard`, `IdeaCard`): мелко (`text-xs text-zinc-600`,
  тот же размер, что у даты в `NewsCard`), формат «N мин чтения» с той же иконкой
  (`h-3 w-3`), через разделитель «·» в строке даты, если дата есть; если даты нет —
  отдельной строкой под заголовком/тезисом. В `NewsCard` — в существующий блок даты
  (строка 29–31). В `ArticleCard` — под лидом. В `IdeaCard` — под тезисом, перед чипсами.
- **VideoCard: не показывать** (см. R5).
- Скрывать, если `readingTime == null`.
- **Общий форматтер** `apps/web/src/lib/format.ts` (рядом с `sanitize.ts`, `video.ts`):
  `formatReadingTime(min: number | null): string | null` → «5 мин чтения» или `null`
  для null — один хелпер на страницу и карточки, иконку рендерит отдельный компонент
  `ReadingTimeBadge` (`apps/web/src/components/ReadingTimeBadge.tsx`), чтобы не дублировать
  разметку в 4 местах.

### R5. Видео-материалы (`type = 'video'`)

Для видео «время чтения описания» вводит в заблуждение — пользователь ждёт длительность ролика.
**Решение ТЗ:** на `VideoCard` время чтения **не показывать**; на детальной странице видео
оставить (там рядом текст статьи). Автоматический расчёт для видео всё равно выполнять
(дешево, и при смене типа материала значение уже есть). Длительность ролика из внешнего
URL не извлекаем — отдельная задача (нужен oEmbed/API видеохостингов).

### R6. Общая утилита (устранение дублирования stripHtml)

**Канонический файл: `packages/db/src/text-utils.ts`** (не `reading-time.ts` — утилита
шире, чем одна фича; переименование от v1 зафиксировано):

```ts
/** Каноническая stripHtml: теги → пробелы, схлопывание \s+, trim. Без декодирования HTML-сущностей (решение ТЗ, R1). */
export function stripHtml(html: string): string;
export function countWords(text: string): number;
export function calcReadingTime(contentHtml: string, wpm?: number): number; // max(1, round(words/wpm))
```

Экспорт из `packages/db/src/index.ts`: `export * from './text-utils.js';`
(без side effects — файл чистый, пул БД он не трогает).

**Перечень 4 мест-дублей для замены (зафиксирован):**

1. `packages/db/src/embed.ts:20-22` → импорт из `./text-utils.js`.
2. `packages/db/src/migrate-wp.ts:59` → импорт из `./text-utils.js`.
3. `apps/admin/src/pages/ArticleEditPage.tsx:256` → локальная копия остаётся допустимой,
   но предпочтительно импорт из `@newinvest/db/text-utils` (см. ниже).
4. `apps/web/src/pages/TrendPage.tsx:27` → то же.

**Решение ТЗ (резолвинг для фронтов):** в `packages/db/package.json` добавить сабпас-экспорт
`"./text-utils": "./src/text-utils.ts"` — чистый модуль без pg/dotenv, браузерный бандл
не пострадает. Импорт корня `@newinvest/db` во фронтах по-прежнему запрещён (side effects).
Если резолвинг сабпаса через Vite/tsc в `apps/web`/`apps/admin` не заработает — допустимо
оставить локальные 3-строчные копии во фронтах (зафиксировано как fallback), но тогда
в `text-utils.ts` добавить комментарий «держать вручную синхронной с копиями во фронтах».
Inline-замены `textGen.ts:61` и `HomePage.tsx:122` в обязательный объём не входят
(первая стрипит не HTML, вторая — однострочник без trim); желательно перевести при случае.

### R7. Ручное переопределение

**Не делаем (решение ТЗ).** Только автоматический расчёт. Вводная владельца — «автоматический
расчёт», ручного override не просил. Ручное поле — лишний UI, источник рассинхрона
(редактор поменял текст — забыл поправить минуты) и вопрос приоритета (auto vs manual).
Если позже понадобится — отдельная задача, через meta_fields и явным правилом «manual wins».

### R8. Backfill существующих материалов

Скрипт `packages/db/src/backfill-reading-time.ts` (tsx, паттерн как `embed.ts`):

1. Аргумент `--force` — пересчитать все; без него — только `where reading_time is null`
   (идемпотентно, безопасно перезапускать).
2. `select id, content_html from articles [where reading_time is null]`.
3. Для каждого: `calcReadingTime(contentHtml)`, `update articles set reading_time = ... where id = ...`
   (батчами по 50, как BATCH в embed.ts).
4. Финальный лог: «обновлено N» + контрольный запрос
   `select count(*) from articles where reading_time is null` — если не 0 (при отсутствии
   --force), exit code 1; иначе «Готово ✓», exit 0.

npm-скрипты:

- корневой `package.json`: `"db:backfill:reading-time": "npm run backfill:reading-time -w @newinvest/db"`
  (прокси-стиль как `db:smoke`),
- `packages/db/package.json`: `"backfill:reading-time": "tsx src/backfill-reading-time.ts"`.

Запускается один раз владельцем/разработчиком после миграции 0014. Перезапуск с `--force`
безопасен (чистый пересчёт от текущего контента).

---

## Тестирование

В репо нет тест-раннера (см. ТЗ-04 §4.7: Playwright только в доноре). **Решение ТЗ:**
мини-тесты на встроенном `node:test` через `tsx --test` — без новых зависимостей.

1. **Юнит-тест утилиты** `packages/db/src/text-utils.test.ts` (node:test, запуск
   `"test": "tsx --test src/*.test.ts"` в `packages/db`):
   - `stripHtml('<p>foo <b>bar</b></p>')` → `'foo bar'` (вложенные теги, схлопывание);
   - `stripHtml('')` → `''`, `countWords('')` → 0;
   - `calcReadingTime('')` → 1 (защита `max(1, …)` от нуля);
   - текст ~200 слов → 1 мин; ~400 слов → 2 мин; ~100 слов → 1 мин (округление);
   - табличный HTML (`<td>1</td><td>2</td>`) — числа считаются словами (известная
     завышенность, зафиксирована в рисках, тест фиксирует текущее поведение).
2. **Ручная проверка API** (curl после миграции и деплоя кода):
   - `POST /api/articles` с контентом ~800 слов → в БД `reading_time` ≈ 4;
   - `PATCH` с новым `contentHtml` → пересчитано; `PATCH` только со `status` → значение не изменилось (проверить двумя запросами к БД);
   - `POST /api/articles/propose` → созданный черновик с не-NULL `reading_time`;
   - `GET /api/articles` и `GET /api/screener/ideas` → поле `readingTime` в каждой записи.
3. **Backfill:** запуск `npm run db:backfill:reading-time` → финальный лог «осталось NULL: 0»;
   повторный запуск без `--force` → «обновлено 0» (идемпотентность).
4. **Фронт:** материалы ~1 / ~5 / ~12 минут — бейдж корректен на странице и карточках;
   `VideoCard` бейджа не имеет; материал с NULL (до backfill) — бейджа нет, вёрстка не ломается.
5. **`npm run typecheck`** зелёный в `apps/api`, `apps/web`, `apps/admin`, `packages/db`.

---

## Реализация (шаги)

1. `packages/db/src/text-utils.ts` + экспорт из `index.ts` + сабпас `"./text-utils"` в `package.json` (R6).
2. `packages/db/src/text-utils.test.ts` + npm-скрипт `test` (см. «Тестирование»).
3. Замена 4 мест-дублей stripHtml на импорт утилиты (R6); фронты — через сабпас, при неудаче fallback на локальные копии (зафиксировать в комментарии кода).
4. `packages/db/src/schema.ts`: `readingTime: integer('reading_time')` в `articles` (после `videoUrl`). **В координации с ТЗ-04**: `articleLikes`, `articleShareEvents`, `likesCount`, `sharesCount` — один прогон `npm run db:generate` даёт общий `0014_<generated>.sql`; вручную добавить `IF NOT EXISTS` и backfill-UPDATE счётчиков (состав — §3).
5. `npm run db:migrate` (локально и на проде — один раз).
6. `apps/api/src/routes/articles.ts`: расчёт в POST/PATCH/propose (правила R2) + `readingTime` в селекте списка; `apps/api/src/routes/screener.ts`: `readingTime` в селекте идей.
7. `apps/web/src/api.ts`: `readingTime: number | null` в `ArticleListItem` и `Idea`.
8. `apps/web/src/lib/format.ts` (`formatReadingTime`) + `apps/web/src/components/ReadingTimeBadge.tsx`; вывод: `ArticlePage` (под заголовком), `ArticleCard`, `NewsCard`, `IdeaCard` (правила R4); `VideoCard` — без изменений (R5).
9. `packages/db/src/backfill-reading-time.ts` + npm-скрипты (R8).
10. Запустить `npm run test -w @newinvest/db` (зелёный), затем `npm run db:backfill:reading-time`, проверить «осталось NULL: 0».
11. `npm run typecheck` во всех затронутых workspace (список — «Тестирование» п. 5).

Порядок с ТЗ-03/ТЗ-04: схему удобно менять одним коммитом вместе с ТЗ-04 (общая миграция 0014);
фронт карточек при этом получит правки из трёх ТЗ — конфликтов не будет (разные блоки разметки),
но вести лучше последовательно: 0014-схема → API → карточки.

---

## Критерии приёмки

1. Миграция 0014 применена: колонка `articles.reading_time` существует (в составе общего файла с ТЗ-04, §3).
2. Создание материала через админку (POST) → в БД сразу не-NULL `reading_time`.
3. Редактирование текста (PATCH с `contentHtml`) → `reading_time` пересчитан; PATCH без `contentHtml` → значение не изменилось.
4. Предложение материала читателем (`/api/articles/propose`) → `reading_time` заполнен.
5. Backfill отработал: `select count(*) from articles where reading_time is null` = 0 (~306 материалов); повторный запуск идемпотентен.
6. `GET /api/articles` и `GET /api/screener/ideas` возвращают `readingTime` для каждой записи; детальная страница тоже.
7. На странице материала отображается «N мин чтения» с иконкой под заголовком.
8. На карточках `ArticleCard`/`NewsCard`/`IdeaCard` — мелко; на `VideoCard` — скрыто.
9. Формат везде один: «5 мин чтения»; при `readingTime = null` бейдж не рендерится.
10. Юнит-тесты `text-utils` зелёные; `npm run typecheck` зелёный в `apps/api`, `apps/web`, `apps/admin`, `packages/db`.

---

## Риски и открытые вопросы

- **Субъективность скорости чтения.** 200 слов/мин — усреднение; часть аудитории читает
  медленнее. Компенсация: целые минуты + `max(1, …)` делают отклонение некритичным.
  Константа — параметр `wpm` в `calcReadingTime`, смена на 180/250 — одна строка.
- **Типы материалов с коротким телом.** Для идей (`ideya`) с 2–3 абзацами получится «1 мин чтения» —
  нормально; `max(1, …)` защищает от нуля. `thesis` и `excerpt` в расчёт не входят (считаем только тело).
- **Видео.** Решение R5 (скрыть на карточке) — решение ТЗ; если владелец хочет «как у всех» —
  одна строка в `VideoCard`. Длительность ролика — отдельная задача (oEmbed видеохостингов).
- **Дублирование stripHtml.** При сабпас-импорте (R6) остаются inline-замены в `textGen.ts:61`
  и `HomePage.tsx:122` — зафиксированы как вне объёма; риск расхождения канонической
  реализации с ними низкий (оба места не считают время чтения).
- **Большие HTML (галереи, таблицы).** Теги заменяются пробелами, числа в таблицах посчитаются
  «словами» — небольшая завышенность на табличных материалах, приемлемо для оценки
  (поведение закреплено юнит-тестом).
- **HTML-сущности не декодируются** (решение ТЗ, R1) — `&nbsp;` после stripHtml превратится
  в текст «nbsp», посчитавшись частью слова. На реальном контенте после WP-миграции
  встречается редко; если всплывёт — отдельная правка утилиты, миграция не нужна.
- **Ручной override отложен** (R7) — если редакция потребует, отдельная задача.
- **Зависимость от ТЗ-04 по миграции 0014.** Если ТЗ-04 реализуется значительно позже,
  колонку `reading_time` всё равно вносим в тот же файл 0014 (номер принадлежит первому
  прогону generate; лишние объекты ТЗ-04 в файле отсутствуют — generate создаст файл
  только из текущей схемы). Расхождение номеров допустимо, расхождение состава — нет:
  перед `db:generate` сверить схему с §3.

---

## Правки ревью v2.1 (принято, обязательны к реализации)

1. **170 слов/мин** (не 200: инвест-аудитория, плотные термины; константа — один аргумент wpm).
2. **Место: meta-строка `тип · N мин чтения` сразу после `</h1>`** (перед thesis), тип перенести из span над h1 в эту строку — «одну строку с типом» из v2 нереальна без переноса.
3. **IdeaCard (screener): показывать бейдж только при readingTime >= 2** (все «1 мин» — шум; IdeaCard и так плотный).
4. package.json сабпас: `"./text-utils": { "types": "./src/text-utils.ts", "default": "./src/text-utils.ts" }` — иначе строгий tsc фронтов не подтянет типы.
5. PATCH: проверка `contentHtml != null` (не `!== undefined` — zod не допускает null, но строгость не повредит; зафиксировать решение: `typeof === 'string'`).
6. npm script теста: `tsx --test "src/**/*.test.ts"` (glob в кавычках — tsx разворачивает сам; шелл-glob ломается на Windows).
7. Backfill UPDATE батчем (`where id in (...)`) вместо поштучного — меньше roundtrips.
8. Канонический regex stripHtml — `/\+/` (как embed.ts:20), не `*`.
9. Формулировка VideoCard: скрыт подтверждено; на странице видео-статьи (под плеером) — показываем.
