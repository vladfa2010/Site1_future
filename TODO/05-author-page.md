# ТЗ-05: Author box + публичная страница автора + «О себе» в ЛК

Статус: финальная версия v2, к реализации.
Дата: 2026-11-08 (v2 — приведены ссылки на код по факту, bio включён в общую миграцию 0014, добавлен раздел «Тестирование»).
Связи: ТЗ-03 (общая миграция 0014, счётчики), ТЗ-04 (общая миграция 0014), ТЗ-01 (schema.org — если появится JSON-LD).

Вводная владельца: «author box + страница автора. у нас есть аватарка. Можно добавить в ЛК "о себе"».

---

## 1. Цель

Дать материалам лицо автора (E-E-A-T) и читателю — способ «провалиться» в профиль автора:

1. **Author box** — блок в конце статьи: аватар, имя, короткое «о себе», ссылка на страницу автора, мета (дата регистрации / количество статей).
2. **Публичная страница автора** `/avtor/:id` — профиль + список его опубликованных материалов (с учётом пейволла).
3. **Поле «О себе» (bio)** в ЛК: колонка `users.bio`, редактирование через API, показ в author box и на странице автора.
4. Показ имени автора на странице статьи («Автор: Имя» со ссылкой) и в author box.

Донор показывает имя автора на карточках (`td-author-name`) — **мы не показываем**, на карточках автор не добавляется (см. §4.6, вне скоупа).

---

## 2. Текущее состояние (проверено по коду)

| Что | Где |
|---|---|
| `users`: `id, email, passwordHash, displayName, role, avatar, tariffId, tariffExpiresAt, oldWpId, createdAt` | `packages/db/src/schema.ts` (pgTable `users`) |
| Роли: `super_admin \| admin \| author \| reader` | `schema.ts`, default `'reader'` |
| Аватар — эмодзи-пресет `AVATAR_PRESET` (10 иконок), компонент `Avatar`, выбор в ЛК через `PUT /api/avatar` | `apps/web/src/components/Avatar.tsx`, `apps/web/src/pages/CabinetPage.tsx` (шапка + `AvatarPickerModal`), `apps/api/src/routes/cabinet.ts` (`PUT /avatar`, возвращает только `{ id, avatar }`) |
| У статей `authorId` (FK → users, `onDelete: 'set null'`); `DELETE /api/auth/me` удаляет черновики и профиль в транзакции → статьи остаются с `author_id = NULL` | `schema.ts` (`articles`), `apps/api/src/routes/auth.ts:85-99` |
| Публичный кабинет `/cabinet` — только сам себе, табы: избранное/лента/подписки/уведомления/тариф/опасная зона | `apps/web/src/pages/CabinetPage.tsx:12-20` (тип `Tab` и массив `TABS`), роут `apps/web/src/App.tsx:40` |
| `GET /api/auth/me` отдаёт свой профиль (email, displayName, role, avatar, тариф) — **без bio** | `apps/api/src/routes/auth.ts:70-80` |
| Детальная статья `GET /api/articles/:type/:slug` возвращает весь ряд `articles` (вкл. `authorId`) + связи + meta, **БЕЗ данных автора** | `apps/api/src/routes/articles.ts:112-170` |
| Пейволл-условие `accessCondition(user, admin?)` — фильтр по `accessLevel`; `isAdmin()` — хелпер роутера | `apps/api/src/routes/articles.ts:43,48-58` |
| Роутинг фронта: статические роуты + `/:type/:slug` (статья, строка 29) + `/:type` (архив, строка 56) | `apps/web/src/App.tsx` |
| Регистрация проверяет уникальность `displayName` (case-insensitive) → `USERNAME_EXISTS`; логин возвращает `{ id, email, role, displayName }` — без avatar/tariff | `apps/api/src/routes/auth.ts:52-58,111-114` |
| React Query (`@tanstack/react-query` v5) используется на публичных страницах (`ArticlePage`, `CompanyPage`, `TypePage` и др.) | `apps/web/package.json`, `apps/web/src/pages/*.tsx` |
| `AuthUser` в контексте авторизации — без bio | `apps/web/src/auth.tsx:4-12` |
| Миграции: `packages/db/migrations/0000…0013_*.sql` (Drizzle, последняя `0013_video_type.sql`), следующая — `0014_*` | `packages/db/migrations/` |
| Монтирование роутеров в API: `authRouter` → `bindingsRouter` → `articlesRouter` → … → `cabinetRouter` (последний, router-wide `authRequired`) | `apps/api/src/index.ts:56-69` |

Важно: имя автора сейчас **нигде не показывается** ни на странице статьи, ни на карточках. `ArticlePage.tsx` не рендерит автора вообще.

---

## 3. Модель данных

Новая колонка (изменение `schema.ts` + **общая миграция 0014**, см. ниже):

```ts
// packages/db/src/schema.ts — в pgTable('users', …), сразу после avatar
bio: text('bio'), // «О себе», до 500 симв.; null = не заполнено
```

- Только новая колонка, дефолт NULL, существующие данные не трогаем, backfill не нужен.
- Ограничение 500 символов — только на уровне zod-валидации в API (как `metaDescription: max 300` в `articles.ts:33`), в БД ограничение не добавляем (**решение ТЗ** — соответствует стилю проекта: лимиты в zod, БД хранит как есть).
- При удалении аккаунта колонка умирает вместе со строкой `users` — отдельной очистки не требуется (author_id у статей обнуляется FK-ом).

### 3.1. Общая миграция 0014 (важно, согласование с ТЗ-03/ТЗ-04)

ТЗ-03 и ТЗ-04 тоже заявляют миграцию `0014_*` (колонки `views_*` и таблицы `article_likes`/`article_share_events` + счётчики на `articles`).

**Решение ТЗ:** это **одна общая миграция** `0014_*.sql`, генерируется drizzle-kit **один раз** из итогового `schema.ts` со всеми изменениями трёх ТЗ. Порядок реализации ТЗ при этом не важен: каждый ТЗ вносит свои правки в `schema.ts`, а миграцию генерирует тот, кто накатывает первым (команда `pnpm --filter @newinvest/db drizzle-kit generate`, конфиг `packages/db/drizzle.config.ts`); остальные накатывают готовую. Руками SQL не пишем, meta-журнал drizzle не трогаем.

Итоговый состав `0014` (фиксируем здесь, чтобы ни одно ТЗ не «потеряло» колонку):

1. `ALTER TABLE users ADD COLUMN bio text;` (это ТЗ);
2. колонки `articles.views_base_offset`, `views_auto_bump_*`, `views_bump_*` (ТЗ-03);
3. таблицы `article_likes`, `article_share_events` + индексы + колонки `articles.likes_count`, `articles.shares_count` + backfill (ТЗ-04).

Откат (`drizzle-kit drop`/`migrate` в обратную сторону) безопасен: все новые колонки nullable либо имеют default, данные bio при откате теряются — приемлемо.

### 3.2. Счётчики/агрегаты

Считаем запросами, не денормализуем:
- `articleCount` = count статей автора со `status = 'published'` (с учётом пейволла — см. §4.3);
- `registeredAt` = `users.created_at`.

---

## 4. Требования

### 4.1. URL страницы автора — `/avtor/:id` (по id, не slug)

**Обоснование:**
- Сайт держится на русских транслит-путях: `/novost/:slug`, `/kompaniya/:slug`, `/trend/:slug`, `/syuzhet/:slug` → `/avtor/:id` вписывается в конвенцию (англ. `/author` — нет).
- **id, а не slug из displayName.** Уникальность `displayName` проверяется только при регистрации (`auth.ts:52-58`); мигрированные WP-пользователи (`oldWpId`) уникальности не гарантированы. Транслит кириллического имени — лишняя зависимость + разрешение коллизий (`ivan-1`, `ivan-2`) без пользы для SEO. id стабилен, не меняется, не коллизит.
- **Конфликты роутов (`App.tsx`):** занятые первые сегменты: `kompaniya, trend, syuzhet, portfolio, login, register, propose, privacy, terms, cabinet, pricing, search, feed, kak-tut-vsyo-ustroeno, portfel-kak-ispolzovat, paypleyn-kak-ispolzovat, arhiv-sdelok-kak-ispolzovat-razdel, trendy-chto-ehto-takoe, o-nas, zachem, smysl, missiya` + служебные. `avtor` свободен. React Router v7 ранжирует статический сегмент выше динамического, поэтому `/avtor/123` победит `/:type/:slug` при любом порядке объявления; для читаемости роут ставим **сразу после** `/:type/:slug` (строка 29).
- `'avtor'` не входит в `ARTICLE_TYPES` (`['novost','sobytie','analitika','interesnoe','ideya','video']`, `schema.ts`) — проверено, конфликта нет.

### 4.2. Author box (конец статьи)

Состав:
- аватар (`<Avatar size={48}>`), имя — ссылка на `/avtor/:id`;
- bio (обрезка до ~160 симв. с «…», если длинное; если bio пусто — блок bio не рендерим);
- мета-строка мелко: «На сайте с {created_at, ru-RU} · N материалов».

Состояния:
- `authorId IS NULL` (миграция, удалённый аккаунт) → author box **не рендерится** вообще;
- author box рендерится на всех типах статей, после контента и строки «Источник:», перед каруселями/связями.

**Решение ТЗ:** bio в author box берём из встроенного объекта `author` ответа детальной статьи, без отдельного запроса (один источник, один RTT — см. Риск 5).

### 4.3. Публичная страница автора

`GET /avtor/:id` → профиль + список материалов:

- шапка: аватар (size 64–80), displayName, bio, «На сайте с …», счётчик опубликованных материалов;
- список материалов: карточки `ArticleCard` (сетка `grid gap-4 sm:grid-cols-2 lg:grid-cols-4`, как в избранном, `CabinetPage.tsx:267`) — те же поля, что `ArticleListItem` (`apps/web/src/api.ts:12-21`);
- пусто (нет опубликованных) — таких страниц мы вообще не показываем (см. ниже), поэтому отдельная заглушка списка не нужна; заглушка «Автор не найден» — при 404 от API;
- несуществующий id → заглушка «Автор не найден» (и семантический 404: роут `*` в `App.tsx:57` остаётся для несовпавших путей).

**Доступность страницы по ролям (решение ТЗ):**
- Показываем страницу любому существующему пользователю, у кого **есть ≥1 опубликованный материал**, независимо от роли (reader после `propose` автоматически становится author — `articles.ts:267-269`, так что с материалами без роли author почти не бывает).
- Пользователь без опубликованных материалов → **404** (не 403 и не пустой профиль): не светим факт существования аккаунта (анти-энумерация), не показываем пустые профили. Это же отвечает на вопрос «reader не должен иметь публичную страницу?» — решает не роль, а наличие контента.

**Пейволл:** в списке материалов автора и в `articleCount` применяется `accessCondition(req.user, isAdmin(...))` — аноним не видит тарифные материалы, но видит автора (если у того есть хотя бы один `public`/`auth`-доступный опубликованный материал; если все материалы тарифные — анониму 404, что корректно: показать нечего).

### 4.4. «О себе» в ЛК

- Новый таб **«Профиль»** (`Tab = 'profile'`, первым в `TABS`, `CabinetPage.tsx:12-20`). В шапке остаются аватар/имя/выход, bio-редактирование — отдельным табом (принцип «мало полей на экране»).
- UI: textarea + счётчик `N/500`, кнопка «Сохранить» (disabled при >500 и при отсутствии изменений), после сохранения — `useAuth().refresh()` (как после смены аватара в `AvatarPickerModal`, `CabinetPage.tsx:127-134`), чтобы bio подтянулась в контекст.
- `AuthUser` в `apps/web/src/auth.tsx:4-12` — добавить `bio?: string | null`; `GET /api/auth/me` — добавить `bio: users.bio` в select (`auth.ts:71-74`).

**Решение ТЗ:** bio редактирует только сам пользователь через `PATCH /api/auth/me` в `authRouter` (не admin-роут, не cabinet): рядом с `GET/DELETE /me`, тот же префикс, тот же паттерн авторизации.

### 4.5. Показ имени автора на странице статьи

- Под заголовком, рядом с типом материала (`ArticlePage.tsx:96-98`): «Автор: {Имя}» — имя ссылкой на `/avtor/:id`, только если `author` не null.
- Тот же объект автора используется author box'ом — один запрос, один источник (см. §5).

### 4.6. Карточки

Имя автора на карточках (`ArticleCard`, `NewsCard`) **не добавляем** (**решение ТЗ** — донор показывает `td-author-name`, мы нет: карточка остаётся про контент, автор — на детальной). Опционально потом — мелкая строка под excerpt; в скоуп не входит.

---

## 5. Реализация (файлы-чеклист)

### 5.1. DB (`packages/db`)

- [ ] `src/schema.ts` — `bio: text('bio')` в `users` (после `avatar`).
- [ ] Миграция `0014_*.sql` — **общая** (состав §3.1), генерируется drizzle-kit из итоговой схемы; применить `npm run migrate` в `packages/db`.

### 5.2. API (`apps/api`)

- [ ] **Новый файл `src/routes/authors.ts`**:
  - `GET /:id` под `optionalAuth`:
    - `const [author] = await db.select({ id, displayName, avatar, bio, createdAt }).from(users).where(eq(users.id, id)).limit(1)` — **белый список, без email/passwordHash**;
    - если пользователя нет → 404;
    - список материалов: `status = 'published'` + `accessCondition(req.user, isAdmin(req.user?.role))` (импорт из `articles.ts:48`), select карточных полей как в `articles.ts:89-108` (`leftJoin(media…)` для `coverUrl`), сортировка `coalesce(publishedAt, createdAt) desc`, limit 50;
    - если список пуст → 404 (решение §4.3);
    - `articleCount` — count по тому же условию (тот же пейволл-фильтр; **решение ТЗ**: счётчик = «сколько материалов доступно именно этому запрашивающему», для анонима — без тарифных).
  - Ответ: `{ author: { id, displayName, avatar, bio, createdAt, articleCount }, articles: ArticleListItem[] }`.
- [ ] `src/routes/articles.ts`, `GET /:type/:slug` (112-170): после загрузки статьи добавить select автора по белому списку `{ id, displayName, avatar, bio, createdAt }` (запрос только при `article.authorId != null`); добавить `author` в `res.json`. Дополнительно `articleCount` для author box **не нужен** — в мета-строке блока счётчик заменяем на «На сайте с …» без числа материалов (**решение ТЗ**: не плодим count-запрос на каждую детальную страницу; число материалов — только на странице автора).
- [ ] `src/routes/auth.ts`:
  - `GET /me` (70-80): добавить `bio: users.bio` в select;
  - новый `PATCH /me` (между `GET /me` и `DELETE /me`): `authRequired`, body `{ bio?: string }`, zod `z.object({ bio: z.string().trim().max(500) }).partial()`, `db.update(users).set({ bio }).where(eq(users.id, req.user!.id)).returning({ id, email, displayName, role, avatar, bio, tariffId })` → `{ user }`. **Решение ТЗ:** `PATCH`, а не `PUT` — частичное обновление, рядом с PATCH статей; лимит 500 — только zod, в БД ограничения нет.
- [ ] `src/index.ts` (56-69): `app.use('/api/authors', authorsRouter)` — после `articlesRouter`, **до `cabinetRouter`** (у него router-wide `authRequired`).

### 5.3. Web (`apps/web`)

- [ ] `src/api.ts`:
  - тип `AuthorProfile { id: number; displayName: string | null; avatar: string | null; bio: string | null; createdAt: string; articleCount: number }`;
  - тип `ArticleAuthor { id, displayName, avatar, bio, createdAt }` (без `articleCount`) — для встроенного автора статьи;
  - `api.author(id)` → `GET /api/authors/:id`; расширить `ArticleDetail` полем `author: ArticleAuthor | null`.
- [ ] **Новый `src/components/AuthorBox.tsx`**: принимает `author: ArticleAuthor`; аватар 48, имя-ссылка `/avtor/:id`, bio (обрезка 160), мета «На сайте с {дата}». Рендерит null при `author == null`.
- [ ] **Новый `src/pages/AuthorPage.tsx`**: `useParams<{ id }>`, данные через `useQuery({ queryKey: ['author', id], queryFn: () => api.author(id) })` (react-query уже в проекте); 404/ошибка → заглушка «Автор не найден»; шапка профиля (аватар 64–80, имя, bio, мета со счётчиком) + сетка `ArticleCard` (`grid gap-4 sm:grid-cols-2 lg:grid-cols-4`); `Breadcrumbs` как на остальных страницах.
- [ ] `src/App.tsx`: импорт `AuthorPage`, роут `<Route path="/avtor/:id" element={<AuthorPage />} />` — сразу после `/:type/:slug` (строка 29).
- [ ] `src/pages/ArticlePage.tsx`:
  - в мета-строке (96-98): «Автор: {имя}» со ссылкой, если `data.author`;
  - после блока «Источник» (150-157), перед каруселями: `<AuthorBox author={data.author} />`.
- [ ] `src/pages/CabinetPage.tsx`:
  - тип `Tab` + первый элемент `TABS` — `{ id: 'profile', label: 'Профиль' }` (12-20);
  - новый компонент `ProfileTab` (в этом же файле, рядом с остальными табами): textarea bio из `user.bio`, счётчик `N/500`, «Сохранить» → `PATCH /api/auth/me` → `refresh()`; подтверждение «Сохранено ✓» (паттерн `NotificationsTab`);
  - `{tab === 'profile' && <ProfileTab />}` в рендере табов (110-116).
- [ ] `src/auth.tsx:4-12`: `bio?: string | null` в `AuthUser`.

### 5.4. Admin (`apps/admin`)

Не требуется. Опционально (вне критериев): колонка bio в списке пользователей админки — для модерации перед публикацией.

### 5.5. E-E-A-T / schema.org

- Ссылка «Автор: Имя» → `/avtor/:id` со страницы каждой статьи — базовый сигнал E-E-A-T, закрывается §4.5.
- **Решение ТЗ:** полноценный JSON-LD `Person` в этот скоуп **не входит** — забирает ТЗ-01 (schema/SEO): там же согласуются `Article.author` (@id → Person). Здесь не плодим второй вариант разметки. Эмодзи-аватар в schema `image` не кладём (не URL).

### 5.6. Порядок работ

1. `schema.ts` (bio) → общая миграция 0014 (состав §3.1) → `npm run migrate`.
2. API: `authors.ts` + монтирование; правки `articles.ts` (author в детали); правки `auth.ts` (`bio` в GET /me + PATCH /me).
3. Web: типы `api.ts` → `AuthorBox` → `AuthorPage` + роут → `ArticlePage` → таб «Профиль» в `CabinetPage` + `auth.tsx`.
4. Тестирование (§6) → приёмка (§7).

---

## 6. Тестирование

Автотест-раннера в репо нет (Playwright есть только у донора в `reference/`) — **решение ТЗ:** в объём входят ручные проверки по чеклисту ниже (curl + браузер); Playwright-покрытие — отдельной задачей вместе с ТЗ-04 (там уже заявлен e2e-контур).

**API (curl):**

1. `PATCH /api/auth/me` без токена → 401; с токеном `{ "bio": "текст" }` → 200, в ответе `user.bio` = текст; `GET /api/auth/me` → bio на месте.
2. `PATCH /api/auth/me` с bio 501 символ → 400; ровно 500 → 200. Пустая строка `""` → 200, сохраняется как `""` (фронт трактует пустое как «не заполнено»).
3. `GET /api/authors/<id автора с публикациями>` → 200: есть `displayName, avatar, bio, createdAt, articleCount`, **нет** `email`/`passwordHash` (проверить тело ответа глазами/jq).
4. `GET /api/authors/<несуществующий>` → 404; `GET /api/authors/<id юзера без публикаций>` → 404.
5. Аноним: `GET /api/authors/<id>` у автора с тарифными материалами → в `articles` нет тарифных; `articleCount` совпадает с длиной `articles`.
6. `GET /api/articles/:type/:slug` → в JSON есть `author` с `{ id, displayName, avatar, bio, createdAt }` и без email; у статьи с `author_id IS NULL` → `author: null`.
7. Регрессия роутов: `GET /api/articles/novost` и `GET /api/articles/novost/<slug>` работают как раньше (автор роутом не затронут).

**UI (браузер):**

8. `/cabinet` → таб «Профиль» первый; ввод bio → «Сохранить» → «Сохранено ✓» → перезаход в кабинет → значение на месте; >500 симв. — кнопка disabled.
9. Детальная статьи с автором → строка «Автор: …» со ссылкой; author box внизу: аватар, имя, bio/мета. Статья без автора (подобрать мигрированную с `author_id IS NULL`) → ни строки, ни блока, страница не падает.
10. Клик по автору → `/avtor/:id`: шапка профиля + сетка его материалов; пейволл-материалы не видны анонимом (проверить на тарифной статье автора).
11. `/avtor/<несуществующий>` и `/avtor/<юзер без публикаций>` → «Автор не найден».
12. Регрессия роутов фронта: `/novost`, `/ideya/<slug>`, `/trend/x`, `/cabinet`, `/search` — без изменений; `/avtor/1` рендерит AuthorPage, а не ArticlePage/TypePage.
13. Миграция: накатить `0014` на чистую БД (`npm run migrate` после пересоздания) и на боевую копию — без правок руками; повторный прогон — no-op.

---

## 7. Критерии приёмки

1. `GET /api/authors/:id` для автора с публикациями → 200: профиль (аватар, имя, bio, дата регистрации, счётчик) + список его опубликованных материалов; несуществующий id и пользователь без публикаций → 404.
2. **Email не утекает:** в ответах `GET /api/authors/:id` и `GET /api/articles/:type/:slug` (поле `author`) отсутствуют `email` и `passwordHash` (проверка JSON вручную, см. §6 пп. 3, 6).
3. `PATCH /api/auth/me` с `{ "bio": "…" }` → bio сохраняется; видно через `GET /api/auth/me`; >500 симв. → 400; без токена → 401; чужой профиль изменить нельзя (обновляется только `req.user.id`).
4. В ЛК (`/cabinet`, таб «Профиль») bio редактируется: сохранить → после перезахода значение на месте.
5. На странице опубликованной статьи с автором: строка «Автор: …» со ссылкой на `/avtor/:id` и author box внизу (аватар, имя, мета). У статьи без автора — ни строки, ни блока, страница не падает.
6. Миграция `0014` (общая, состав §3.1) накатывается на чистую и на боевую БД (`npm run migrate` в `packages/db`); откат не ломает данные (колонки nullable).
7. Роут-конфликтов нет: `/avtor/1` рендерит AuthorPage; существующие URL (`/novost`, `/ideya/x` и пр.) не затронуты.
8. Пейволл: в списке статей автора и в `articleCount` не присутствуют недоступные запрашивающему тарифные материалы (проверить анонимом и владельцем тарифа).

---

## 8. Риски

1. **displayName не гарантированно уникален** (проверка только для новых регистраций; мигрированные WP-юзеры могут дублировать) → поэтому slug не строим; URL по id. Если позже захотим красивые slug — отдельная миграция дедупликации имён.
2. **Энумерация пользователей:** `GET /api/authors/:id` перебором id отдаёт 404/200 — 200 только при наличии публикаций, email в ответе нет, ущерб ~нулевой. Не добавлять id автора в HTML карточек, где он не нужен.
3. **Роль reader и публичная страница:** решаем не ролью, а наличием опубликованных материалов (§4.3). Следствие: читатель без публикаций → 404; reader, которому апнули роль через `propose`, станет видим после первой публикации админом.
4. **Удалённые аккаунты:** `onDelete: 'set null'` + транзакция в `DELETE /me` (`auth.ts:92-97`) — статьи остаются с `author_id = NULL`; все места рендера обязаны обрабатывать `author: null` (критерий №5).
5. **Двойной источник автора:** author box берёт всё из одного ответа `GET /api/articles/:type/:slug` (author object), второй запрос не делаем — иначе рассинхрон и лишний RTT. Счётчик материалов на детальной не показываем (решение §5.2).
6. **bio в списках:** не отдавать bio в `GET /api/articles` (карточки) — только в детальной статье и профиле; иначе раздуваем каждый список.
7. **Конфликт с ТЗ-01 (schema):** JSON-LD `Person`/`Article.author` — там, здесь разметку не плодим (§5.5).
8. **Конфликт миграций 0014:** три ТЗ заявляют `0014_*`. Решение — одна общая миграция из итоговой схемы (§3.1); кто реализует первым — генерирует, остальные накатывают. Риск: два параллельных `0014_*.sql` в разных ветках → конфликт в git + двойной ALTER. Митигация: не писать миграцию руками, генерировать только из `main`-актуальной схемы.

---

## Правки ревью v2.1 (принято, обязательны к реализации)

1. **Превью до первой публикации**: в табе «Профиль» показывать блок-превью («Ваша публичная страница появится после первой публикации» + мини-шаблон как будет выглядеть). Иначе автор не видит свой профиль до 404-исчезновения.
2. **useState<Tab>('profile')** — дефолтный таб тоже меняем (в v2 правится только массив TABS — активным останется favorites).
3. `isAdmin` в articles.ts НЕ экспортирован — либо добавить export, либо локальная однострочная копия в authors.ts (решение ТЗ: export из articles.ts).
4. **Состав 0014 синхронизирован окончательно**: views_* (ТЗ-03) + likes_count/shares_count + article_likes + article_share_events (ТЗ-04) + reading_time (ТЗ-09) + **users.bio (это ТЗ)** + индекс article_views(viewed_at) (ТЗ-07). Если к моменту реализации 0014 уже сгенерирована — bio идёт отдельной 0015 (fallback-правило).
5. displayName null → fallback «Автор» в AuthorBox и на странице (одна строка).
6. Автор без тарифа не видит свои тарифные материалы в собственном профиле — принято осознанно (как у всех; иначе обход пейволла через авторство).
7. Счётчик bio: считать по trim()'нутому значению (zod trim → серверная длина), maxlength на textarea = 500, переполнение — красным.
8. Разнобой роутеров (аватар в cabinet, bio в auth) — принят осознанно; PATCH /me returning дополнить до полного профиля.
