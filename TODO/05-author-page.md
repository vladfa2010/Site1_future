# ТЗ-05: Author box + публичная страница автора + «О себе» в ЛК

Вводная владельца: «author box + страница автора. у нас есть аватарка. Можно добавить в ЛК "о себе"».

---

## 1. Цель

Дать материалам лицо автора (E-E-A-T) и читателю — способ «провалиться» в профиль автора:

1. **Author box** — блок в конце статьи: аватар, имя, короткое «о себе», ссылка на страницу автора, мета (дата регистрации / количество статей).
2. **Публичная страница автора** `/avtor/:id` — профиль + список его опубликованных материалов (с учётом пейволла).
3. **Поле «О себе» (bio)** в ЛК: колонка `users.bio`, редактирование через API, показ в author box и на странице автора.
4. Показ имени автора на странице статьи («Автор: Имя» со ссылкой) и в author box.

Донор показывает имя автора на карточках (`td-author-name`) — **мы не показываем**, на карточках автор не добавляется (опционально, мелко — см. §6, вне скоупа).

---

## 2. Текущее состояние (что уже есть)

| Что | Где |
|---|---|
| `users`: `id, email, passwordHash, displayName, role, avatar, tariffId, createdAt` | `packages/db/src/schema.ts:25-36` |
| Роли: `super_admin \| admin \| author \| reader` | `schema.ts:30` |
| Аватар — эмодзи-пресет `AVATAR_PRESET` (10 иконок), компонент `Avatar`, выбор в ЛК через `PUT /api/avatar` | `apps/web/src/components/Avatar.tsx`, `apps/web/src/pages/CabinetPage.tsx:56-67,126-166`, `apps/api/src/routes/cabinet.ts:180-189` |
| У статей `authorId` (FK → users, `onDelete: set null`), миграция 0005 очищает `author_id` при удалении аккаунта | `schema.ts:185`, `apps/api/src/routes/auth.ts:82-99` |
| Публичный кабинет `/cabinet` — только сам себе, табы: избранное/лента/подписки/уведомления/тариф/опасная зона | `apps/web/src/pages/CabinetPage.tsx:12-20,40`, роут `apps/web/src/App.tsx:40` |
| `GET /api/auth/me` отдаёт свой профиль (email, displayName, role, avatar, тариф) | `apps/api/src/routes/auth.ts:70-80` |
| Детальная статья `GET /api/articles/:type/:slug` возвращает весь ряд `articles` (вкл. `authorId`) + связи, БЕЗ данных автора | `apps/api/src/routes/articles.ts:112-170` |
| Пейволл-условие `accessCondition(user, admin)` — фильтр по `accessLevel` | `apps/api/src/routes/articles.ts:48-58` |
| Роутинг фронта: статические роуты + `/:type/:slug` (статья) + `/:type` (архив) | `apps/web/src/App.tsx:26-58` |
| Регистрация проверяет уникальность `displayName` (case-insensitive) → `USERNAME_EXISTS` | `apps/api/src/routes/auth.ts:52-58` |
| Миграции: `packages/db/migrations/0000…0013_*.sql` (Drizzle), следующая — `0014_*` | `packages/db/migrations/` |

Важно: имя автора сейчас **нигде не показывается** ни на странице статьи, ни на карточках. `ArticlePage.tsx` не рендерит автора вообще.

---

## 3. Модель данных

Новая колонка (миграция `0014_author_bio.sql` + изменение `schema.ts`):

```ts
// packages/db/src/schema.ts — в pgTable('users', …), после avatar (строка 31)
bio: text('bio'), // «О себе», до 500 симв.; null = не заполнено
```

- Только новая колонка, дефолт NULL, бэкапы не нужны, существующие данные не трогаем.
- Ограничение 500 символов — на уровне zod-валидации в API (как `metaDescription` max 300 в `articles.ts:33`), в БД ограничение не добавляем (соответствует стилю проекта).

Счётчики/агрегаты считаем запросами, не денормализуем:
- `articleCount` = count статей автора со `status = 'published'`;
- `registeredAt` = `users.created_at`.

---

## 4. Требования

### 4.1. URL страницы автора — `/avtor/:id` (по id, не slug)

**Обоснование:**
- Сайт держится на русских транслит-путях: `/novost/:slug`, `/kompaniya/:slug`, `/trend/:slug`, `/syuzhet/:slug` → `/avtor/:id` вписывается в конвенцию (англ. `/author` — нет).
- **id, а не slug из displayName.** Уникальность `displayName` проверяется только при регистрации (`auth.ts:52-58`); мигрированные WP-пользователи (`oldWpId`, `schema.ts:34`) уникальности не гарантированы. Транслит кириллического имени — лишняя зависимость + разрешение коллизий (`ivan-1`, `ivan-2`) без какой-либо пользы для SEO. id стабилен, не меняется, никогда не коллизит.
- **Конфликты роутов (`App.tsx`):** занятые первые сегменты: `kompaniya, trend, syuzhet, portfolio, login, register, propose, privacy, terms, cabinet, pricing, search, feed` + служебные. `avtor` свободен. React Router ранжирует статический сегмент выше динамического, поэтому `/avtor/123` победит `/:type/:slug`, а `/avtor` — `/:type`. НО: `ArticlePage` по `/:type/:slug` при неизвестном типе всё равно шлёт запрос и показывает «Страница не найдена» — при добавлении роута регрессионно проверить, что `/avtor/:id` не попадает в `/:type/:slug` (порядок: статический роут добавить ДО или после — не важно, ранжирование статики выше, но для читаемости — рядом с `/:type/:slug`).
- Проверить, что `'avtor'` не входит в `ARTICLE_TYPES` (`schema.ts:169`) — не входит.

### 4.2. Author box (конец статьи)

Состав:
- аватар (`<Avatar size={48}>`), имя (ссылка на `/avtor/:id`),
- bio (обрезка до ~160 симв. с «…», если длинное; если bio пусто — блок bio не рендерим),
- мета-строка мелко: «На сайте с {created_at, ru-RU} · N материалов».

Состояния:
- `authorId IS NULL` (миграция, удалённый аккаунт) → author box **не рендерится** вообще;
- author box рендерится на всех типах статей (не только `ideya`), после контента и строки «Источник:», перед каруселями.

### 4.3. Публичная страница автора

`GET /avtor/:id` → профиль + список материалов:

- шапка: аватар (size 64-80), displayName, bio, «На сайте с …», счётчик опубликованных материалов;
- список материалов: карточки `ArticleCard` (сетка как в избранном, `CabinetPage.tsx:267`) — те же поля, что `ArticleListItem`;
- пусто (нет опубликованных) — заглушка «Пока нет опубликованных материалов»;
- несуществующий id → 404-страница (роут `*` в `App.tsx:57`).

**Доступность страницы по ролям (решение):**
- Показываем страницу любому существующему пользователю, у кого **есть ≥1 опубликованный материал**, независимо от роли (reader после `propose` автоматически становится author — `articles.ts:267-269`, так что с материалами без роли author почти не бывает).
- Пользователь без опубликованных материалов → **404** (не 403): не светим факт существования аккаунта (анти-энумерация), не показываем пустые профили. Это же отвечает на вопрос «reader не должен иметь публичную страницу?» — не роль решает, а наличие контента.

### 4.4. «О себе» в ЛК

- Новый таб **«Профиль»** (`Tab = 'profile'`, первый в списке `TABS`, `CabinetPage.tsx:12-20`) — в шапке остаются аватар/имя/выход, а bio-редактирование логичнее отдельным табом, чем в шапке (принцип «мало полей на экране»).
- UI: textarea + счётчик `N/500`, кнопка «Сохранить» (disabled при >500), после сохранения — `useAuth().refresh()` (как после смены аватара, `CabinetPage.tsx:127-134`), чтобы bio подтянулась в контекст.
- `AuthUser` в `apps/web/src/auth.tsx:3-12` — добавить `bio?: string | null`; `GET /api/auth/me` — добавить `bio` в select (`auth.ts:71-74`).

### 4.5. Показ имени автора на странице статьи

- Под заголовком, рядом с типом материала (`ArticlePage.tsx:96-98`): «Автор: {Имя}» — имя ссылкой на `/avtor/:id`, только если `authorId` не null.
- Тот же объект автора используется author box'ом — один запрос, один источник (см. §5).

### 4.6. Карточки

Имя автора на карточках (`ArticleCard`, `NewsCard`) **не добавляем** (позиция: донор показывает `td-author-name`, мы нет). Опционально потом — мелкая строка под excerpt; в скоуп этого ТЗ не входит.

---

## 5. Реализация

### 5.1. API (`apps/api`)

**Новый файл `apps/api/src/routes/authors.ts`:**

```
GET /api/authors/:id        — optionalAuth
  → 404, если пользователя нет ИЛИ у него 0 опубликованных материалов
  → {
      author: {
        id, displayName, avatar, bio, createdAt,           // НИКАКОГО email
        articleCount,                                       // count(published)
      },
      articles: ArticleListItem[]                           // как в articles.ts:89-108
    }
```

- Статьи: `status = 'published'` + `accessCondition(req.user, isAdmin(req.user?.role))` (импорт из `articles.ts:48`) — пейволл соблюдён, тарифные материалы не утекают в список.
- Сортировка `coalesce(publishedAt, createdAt) desc`, limit 50 (как лента, `cabinet.ts:259-268`).
- Select строго по белому списку полей — `email` и `passwordHash` не выбирать (см. критерий приёмки №2).

**Правка `apps/api/src/routes/articles.ts`** — `GET /:type/:slug` (строки 112-170): добавить в ответ публичный профиль автора:

```ts
const [author] = article.authorId
  ? await db.select({ id: users.id, displayName: users.displayName, avatar: users.avatar, bio: users.bio })
      .from(users).where(eq(users.id, article.authorId)).limit(1)
  : [null];
// …в res.json: author,
```

**Правка `apps/api/src/routes/auth.ts`:**
- `GET /me` (строки 70-80): добавить `bio: users.bio` в select.
- Новый `PATCH /me` (рядом с `DELETE /me`, строки 85-99): `authRequired`, body `{ bio?: string }`, zod `z.string().trim().max(500)`, обновляет только свою запись, возвращает обновлённый `{ user }` (без passwordHash — returning по белому списку). `PATCH` а не `PUT` — правка частичная, рядом с PATCH статей.

**Монтирование** в `apps/api/src/index.ts` (строки 56-69): `app.use('/api/authors', authorsRouter)` — до `cabinetRouter` (у него router-wide `authRequired`, `cabinet.ts:16`), рядом с `articlesRouter`.

**Миграция** `packages/db/migrations/0014_author_bio.sql`: `ALTER TABLE users ADD COLUMN bio text;` + `bio: text('bio')` в `schema.ts:31` (после `avatar`). Сгенерировать через drizzle-kit (`packages/db/drizzle.config.ts`), не писать руками meta-журнал.

### 5.2. Web (`apps/web`)

- **`apps/web/src/api.ts`**: тип `AuthorProfile { id, displayName, avatar, bio, createdAt, articleCount }`; `api.author(id)` → `GET /api/authors/:id`; расширить тип ответа `api.article` полем `author: AuthorProfile | null` (без `articleCount` в контексте статьи — можно тот же тип с опциональным полем).
- **`apps/web/src/components/AuthorBox.tsx`** (новый): принимает `author` (+ `articleCount`/`createdAt` опционально), см. §4.2. Использует существующий `<Avatar>`.
- **`apps/web/src/pages/AuthorPage.tsx`** (новый): `useParams` id → `useQuery(['author', id])` → шапка профиля + сетка `ArticleCard`; 404 — заглушка «Автор не найден»; `Breadcrumbs` как на остальных страницах.
- **`apps/web/src/App.tsx`**: импорт `AuthorPage`, роут `<Route path="/avtor/:id" element={<AuthorPage />} />` — после `/:type/:slug` (строка 29), ранжирование React Router гарантирует приоритет статики.
- **`apps/web/src/pages/ArticlePage.tsx`**:
  - строки 96-98: «Автор: {имя}» со ссылкой (если `data.author`);
  - после блока «Источник» (строки 150-157), перед каруселями: `<AuthorBox author={data.author} />` (рендерим только если author не null).
- **`apps/web/src/pages/CabinetPage.tsx`**: таб `profile` «Профиль» — textarea bio (из `user.bio`), счётчик 500, сохранение `PATCH /api/auth/me`, `refresh()` после; добавить в `TABS` первым.
- **`apps/web/src/auth.tsx:3-12`**: `bio?: string | null` в `AuthUser`.

### 5.3. Admin (`apps/admin`)

Не требуется. Желательно (опционально, вне критериев): показ bio в списке пользователей админки — для модерации перед публикацией.

### 5.4. E-E-A-T / schema.org

- Ссылка «Автор: Имя» → `/avtor/:id` со страницы каждой статьи — это базовый сигнал E-E-A-T, уже закрывается §4.5.
- **JSON-LD `Person`** на странице автора (`name`, `description` = bio, `url`, `image` — аватар-эмодзи в schema не кладём, эмодзи не URL). Если structured-data пакет (ТЗ-01 по schema/SEO) ведётся отдельно — тип `Person` и `Article.author` (@id-ссылка на Person) **поручаем туда**; в этом ТЗ только data-attribute/метки для связки, чтобы не дублировать разметку. Минимум здесь: `<link rel="author">` не нужен, достаточно видимой ссылки (Google игнорирует невидимые author-разметки без качественной страницы).

---

## 6. Критерии приёмки

1. `GET /avtor/:id` для автора с публикациями → 200: профиль (аватар, имя, bio, дата регистрации, счётчик) + список его опубликованных материалов; несуществующий id и пользователь без публикаций → 404.
2. **Email не утекает:** в ответах `GET /api/authors/:id` и `GET /api/articles/:type/:slug` (поле `author`) отсутствуют `email` и `passwordHash` (проверить JSON вручную / тестом).
3. `PATCH /api/auth/me` с `{ "bio": "…" }` → bio сохраняется; видно через `GET /api/auth/me`; >500 симв. → 400; чужой профиль изменить нельзя (только свой, authRequired).
4. В ЛК (`/cabinet`, таб «Профиль») bio редактируется: сохранить → после перезахода значение на месте.
5. На странице опубликованной статьи с `authorId`: видна строка «Автор: …» со ссылкой на `/avtor/:id` и author box внизу (аватар, имя, мета). У статьи без автора (`author_id IS NULL`) — ни строки, ни блока, страница не падает.
6. Миграция `0014` накатывается на чистую и на боевую БД (`npm run migrate` в `packages/db`), откат не ломает данные (колонка nullable).
7. Роут-конфликтов нет: `/avtor/1` рендерит AuthorPage, а не ArticlePage/TypePage; существующие URL (`/novost`, `/ideya/x` и пр.) не затронуты.
8. Пейволл: в списке статей автора и в `articleCount` не присутствуют тарифные материалы у анонима (проверить анонимом и владельцем тарифа).

---

## 7. Риски

1. **displayName не гарантированно уникален** (проверка только для новых регистраций; мигрированные WP-юзеры могут дублировать) → поэтому slug не строим; URL по id. Если позже захотим красивые slug — понадобится отдельная миграция дедупликации имён.
2. **Энумерация пользователей:** `GET /api/authors/:id` перебором id отдаёт 404/200 — уже само по себе минимально (200 только при наличии публикаций), email в ответе нет, так что ущерб ~нулевой. Не добавлять id автора в HTML карточек, где он не нужен.
3. **Роль reader и публичная страница:** решаем не ролью, а наличием опубликованных материалов (§4.3). Следствие: читатель без публикаций → 404; reader, которому апнули роль через `propose`, — станет видим после первой публикации админом.
4. **Удалённые аккаунты:** `onDelete: set null` (`schema.ts:185`) + транзакция в `DELETE /me` (`auth.ts:92-97`) — статьи остаются с `author_id = NULL`; все места рендера обязаны обрабатывать `author: null` (критерий №5).
5. **Двойной источник автора:** страница статьи может показать автора из встроенного ответа, но author box'у нужны `bio`/`createdAt`/`articleCount` — берём всё из одного ответа `GET /api/articles/:type/:slug` (author object полный), не делаем второй запрос. Иначе получим рассинхрон и лишний RTT.
6. **bio в списках:** не отдавать bio в `GET /api/articles` (карточки) — только в детальной статье и профиле; иначе раздуваем каждый список.
7. **Конфликт с ТЗ-01 (schema):** если там уже вводится JSON-LD на статьях — согласовать `Article.author`/`Person` там, здесь не плодить второй вариант разметки.
