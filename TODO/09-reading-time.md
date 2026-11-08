# ТЗ 09 — Время чтения материалов («N мин чтения»)

## Цель

На медиа «инвестиционно.рф» показывать пользователю ожидаемое время чтения материала:
«3 мин чтения», «12 мин чтения» и т.п. Расчёт — автоматический, без участия редактора
(вводная владельца: «расчёт времени чтения делаем. в админке автоматический расчёт»).

## Текущее состояние

- Тело материала хранится в `articles.content_html` (Drizzle `articles.contentHtml`,
  `packages/db/src/schema.ts:179`). Есть также `excerpt`, `thesis`, `video_url`, `status`, `published_at`.
- Экстракция чистого текста из HTML (`stripHtml`) уже реализована в трёх местах дублирующимся кодом:
  - `packages/db/src/embed.ts:20` (через `[^>]+`),
  - `packages/db/src/migrate-wp.ts:59` (через `[^>]*`),
  - `apps/admin/src/pages/ArticleEditPage.tsx:256`,
  - `apps/web/src/pages/TrendPage.tsx:27`.
  Везде суть одна: заменить теги на пробелы, схлопнуть пробелы, обрезать.
- Сохранение материала — `apps/api/src/routes/articles.ts`:
  `POST /api/articles` (строки 173–208), `PATCH /api/articles/:id` (строки 218–250),
  `POST /api/articles/propose` (строки 254–279, конвертирует plain text в HTML через `plainTextToHtml`),
  `POST /api/articles/:id/publish` (строки 282–293). Все мутации контента проходят через POST/PATCH.
- Список `GET /api/articles` (строки 89–108) отдаёт узкий селект: `id, type, slug, title, excerpt, status, publishedAt, coverUrl, videoUrl`. Детальная `GET /api/articles/:type/:slug` (строка 112+) отдаёт `article: articles` целиком + `coverUrl`.
- Карточки на фронте (`apps/web/src/components/`): `ArticleCard.tsx`, `NewsCard.tsx`,
  `VideoCard.tsx`, `IdeaCard.tsx`. Тип списка — `ArticleListItem` в `apps/web/src/api.ts`.
  `NewsCard` уже выводит дату мелким шрифтом (`publishedAt.slice(0, 10)`, строка 30).
- Миграции — сырой SQL в `packages/db/migrations/` (последняя — `0013_video_type.sql`,
  формат: `ALTER TABLE "articles" ADD COLUMN IF NOT EXISTS ...`). Применяются через `npm run db:migrate` (drizzle-kit).
- В репо есть `tsx` (devDependency в `packages/db` и `apps/api`), паттерн скриптов: `packages/db/src/embed.ts`, `src/smoke.ts` с npm-скриптами вида `"embed": "tsx src/embed.ts"`.
- Существующих материалов ~306 (WordPress-миграция). У них `reading_time` отсутствует — нужен backfill.

## Модель данных

**Рекомендация: отдельная колонка `articles.reading_time int`, а не meta_fields.**

Альтернатива — ключ `reading_time` в таблице `meta_fields` (owner_type='article'):
миграция не нужна (структура уже есть, см. `saveMetaDescription`, articles.ts:211).
Но она проигрывает колонке:

- колонка выбирается одним селектом вместе со списком (списку `GET /api/articles` время чтения нужно всегда — 306+ запросов к meta_fields на страницу ленты);
- тип `int` схемы vs `text` значений meta_fields (кастинг на каждом чтении);
- сортировка/фильтрация по времени чтения (потенциально «длинные чтения») на уровне SQL;
- семантически это атрибут материала, как `published_at`, а не произвольная метка.

Миграция `0014_reading_time.sql`:

```sql
ALTER TABLE "articles" ADD COLUMN IF NOT EXISTS "reading_time" integer;
```

`integer` (не `notNull`) осознанно: существующие строки до backfill имеют `NULL` — фронт по `NULL` ничего не показывает (аккуратная деградация), backfill заполняет все. Можно оставить nullable навсегда: `NULL` = «не рассчитано». После backfill скрипт сам проверит `count(*) where reading_time is null = 0`.

В `packages/db/src/schema.ts` в `articles` добавить:

```ts
readingTime: integer('reading_time'), // минуты чтения, авто-пересчёт при сохранении (см. TODO 09)
```

## Требования

### R1. Расчёт

- Чистый текст: `stripHtml(content_html)` — единая реализация (см. R6).
- Слова: `text.split(/\s+/).filter(Boolean).length`.
- Минуты: `Math.max(1, Math.round(words / 200))`.
- **Обоснование 200 слов/мин:** для русского языка средняя скорость чтения
  взрослым — ~150–250 слов/мин в зависимости от сложности текста; 200 — серединный
  компромисс между лёгкими новостями (~250) и плотной аналитикой (~150). Формат
  «N мин» (без десятых) сам по себе округляет погрешность, точность 250 vs 200
  на типичном материале отличается на ±1 минуту — приемлемо.

### R2. Где считается (автоматический расчёт в админке = на бэке при сохранении)

- `POST /api/articles` (articles.ts:192): в `.values()` добавить `readingTime: calcReadingTime(data.contentHtml)`.
- `PATCH /api/articles/:id` (articles.ts:245): если в `updates` пришёл `contentHtml` —
  пересчитать; если пришёл PATCH без `contentHtml` (например, только смена статуса) — не трогать колонку.
  Важно: не считать от `existing.contentHtml` при отсутствии поля в PATCH — иначе любой PATCH
  перезатрёт значение (сейчас не страшно, т.к. фронт админки шлёт весь payload, но хрупко).
- `POST /api/articles/propose`: `plainTextToHtml(text)` → считать от того же текста.
- `POST /api/articles/:id/publish`: не считать (контент не меняется).

### R3. API

- `GET /api/articles` (список): добавить `readingTime: articles.readingTime` в селект (строки 89–100).
  В `ArticleListItem` (`apps/web/src/api.ts`) добавить `readingTime: number | null`.
- `GET /api/articles/:type/:slug` (детальная): отдаёт `article: articles` целиком — колонка подтянется автоматически, отдельных изменений не требуется, но проверить тип на фронте.

### R4. Фронт (показ)

- **Страница материала** (`apps/web/src/pages/ArticlePage.tsx`, рядом с датой/автором):
  формат «N мин чтения», иконка часов (инлайн SVG, stroke текущего цвета — в стиле шрифтовых иконок репо), текст мелкий, цвет как у даты (`text-zinc-600` / `text-zinc-400`).
- **Карточки** (`ArticleCard`, `NewsCard`, `VideoCard`, `IdeaCard`): мелко (тот же размер, что у даты в `NewsCard` — `text-xs text-zinc-600`), рядом с датой. На карточках без даты — после заголовка/лида отдельной строкой или в одну строку с датой через разделитель «·».
- Скрывать, если `readingTime == null`.
- Общий форматтер в `apps/web/src/lib/` (например `formatReadingTime(min): string` → «5 мин чтения»), чтобы не дублировать в четырёх карточках.

### R5. Видео-материалы (`type = 'video`)

Для видео «время чтения описания» вводит в заблуждение — пользователь ждёт длительность ролика.
Решение: для `type = 'video'` на карточке `VideoCard` **не показывать** время чтения
(на детальной странице можно оставить — там рядом текст статьи). Автоматический расчёт
для видео всё равно выполнять (дешево, и при смене типа материала значение уже есть).

### R6. Общая утилита расчёта (устранение дублирования)

Сейчас `stripHtml` скопирован в 4 местах. Создать `packages/db/src/reading-time.ts`:

```ts
export function stripHtml(html: string): string; // каноническая копия
export function countWords(text: string): number;
export function calcReadingTime(contentHtml: string, wpm = 200): number; // max(1, round(words/200))
```

- Бэк (`apps/api/src/routes/articles.ts`) — импортирует из `@newinvest/db`
  (добавить в `packages/db/src/index.ts`).
- `packages/db/src/embed.ts` и `migrate-wp.ts` — заменить свои копии на импорт (не обязательно в этом же PR, но желательно).
- Админка/веб (`ArticleEditPage.tsx:256`, `TrendPage.tsx:27`) — могут оставить свои локальные копии (другие workspace, импорт `@newinvest/db` в браузерный бандл проверить; если резолвится — тоже перевести).

### R7. Ручное переопределение

**Не делаем.** Только автоматический расчёт. Вводная владельца — «автоматический расчёт»,
ручного override не просил. Ручное поле — это лишний UI, источник рассинхрона
(редактор поменял текст — забыл поправить минуты) и вопрос приоритета (auto vs manual).
Если позже понадобится — отдельная задача, через meta_fields и явным правилом «manual wins».

### R8. Backfill существующих материалов

Скрипт `packages/db/src/backfill-reading-time.ts` (tsx, паттерн как `embed.ts`):

1. `select id, content_html from articles where reading_time is null` (или все — idempotent).
2. Для каждого: `calcReadingTime(contentHtml)`.
3. `update articles set reading_time = ... where id = ...` (батчами по 50).
4. Итоговый лог: «обновлено N, осталось NULL: 0».

npm-скрипт:

- корневой `package.json`: `"db:backfill:reading-time": "npm run backfill:reading-time -w @newinvest/db"`,
- `packages/db/package.json`: `"backfill:reading-time": "tsx src/backfill-reading-time.ts"`.

Запускается один раз владельцем/разработчиком после миграции 0014.

## Реализация (шаги)

1. `packages/db/src/reading-time.ts` + экспорт из `index.ts`.
2. `packages/db/migrations/0014_reading_time.sql` + `schema.ts` (`readingTime: integer('reading_time')`).
3. `npm run db:migrate`.
4. `apps/api/src/routes/articles.ts`: расчёт в POST/PATCH (по правилам R2) + поле в селекте списка.
5. `apps/web/src/api.ts`: `readingTime: number | null` в `ArticleListItem` (и тип детальной).
6. `apps/web/src/lib/` форматтер + вывод: `ArticlePage` (рядом с датой/автором), `ArticleCard`, `NewsCard`, `IdeaCard` (мелко), `VideoCard` — не показывать (R5).
7. `packages/db/src/backfill-reading-time.ts` + npm-скрипты (R8).
8. Запустить backfill, проверить `reading_time is null = 0`.
9. `npm run typecheck` в затронутых workspace (`apps/api`, `apps/web`, `packages/db`).

## Критерии приёмки

1. Миграция 0014 применена: колонка `articles.reading_time` существует.
2. Создание материала через админку (POST) → в БД сразу не-NULL `reading_time`.
3. Редактирование текста (PATCH с `contentHtml`) → `reading_time` пересчитан; PATCH без `contentHtml` → значение не изменилось.
4. Предложение материала читателем (`/api/articles/propose`) → `reading_time` заполнен.
5. Backfill отработал: `select count(*) from articles where reading_time is null` = 0 (~306 материалов).
6. `GET /api/articles` возвращает `readingTime` для каждой записи; детальная страница тоже.
7. На странице материала отображается «N мин чтения» с иконкой рядом с датой/автором.
8. На карточках `ArticleCard`/`NewsCard`/`IdeaCard` — мелко; на `VideoCard` — скрыто.
9. Формат везде один: «5 мин чтения»; при `readingTime = null` бейдж не рендерится.
10. `npm run typecheck` зелёный в `apps/api`, `apps/web`, `packages/db`.

## Риски и открытые вопросы

- **Субъективность скорости чтения.** 200 слов/мин — усреднение; часть аудитории читает
  медленнее. Компенсация: целые минуты + `max(1, …)` делают отклонение некритичным.
  Константу `wpm` вынести в параметр `calcReadingTime` — смена на 180/250 — одна строка.
- **Типы материалов с коротким телом.** Для идей (`ideya`) с 2–3 абзацами получится «1 мин чтения» —
  нормально; `max(1, …)` защищает от нуля. `thesis` и `excerpt` в расчёт не входят (считаем только тело).
- **Видео.** Решение R5 (скрыть на карточке) — предложение; если владелец хочет «как у всех» —
  одна строка в `VideoCard`.
- **Дублирование stripHtml.** Если в R6 не убрать все копии, риск расхождения реализаций
  (`[^>]+` vs `[^>]*`). Минимум — каноническая утилита для бэка и backfill.
- **Большие HTML (галереи, таблицы).** Теги заменяются пробелами, числа в таблицах посчитаются
  «словами» — небольшая завышенность на табличных материалах, приемлемо для оценки.
- **Ручной override отложен** (R7) — если редакция потребует, отдельная задача.
