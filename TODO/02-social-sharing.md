# ТЗ-02. Кнопки шеринга на странице статьи

**Статус:** финальная версия v2, к реализации
**Приоритет:** высокий
**Связанные ТЗ:** ТЗ-04 (счётчики лайков/репостов — API и счётчик shares), ТЗ-10 (OG-теги / SSR / мета)

---

## 1. Цель

Трафик из соцсетей — основной канал донора (трендовый контент «инвестиционно.рф» распространяется через Telegram/VK/Dzen). Сейчас у пользователя нет способа поделиться конкретной статьёй в один клик — только ручным копированием URL из адресной строки. Задача: добавить блок шеринга внутрь страницы статьи, чтобы снизить трение при репосте и замерить, откуда приходит трафик (UTM).

ТЗ-02 поставляет **только фронтенд кнопок и клиентскую логику**. Бэкенд-учёт кликов (`POST /api/articles/:id/share`, счётчик `shares_count`) — ТЗ-04; это ТЗ вызывает его как готовый API.

## 2. Текущее состояние

- Страница статьи: `apps/web/src/pages/ArticlePage.tsx`. В разметке **нет** никаких кнопок шеринга.
  - Заголовок + кнопки избранного/подписки — строки 99–108 (`<div className="flex items-start justify-between…">`).
  - Тезис идеи — строки 111–115.
  - Чипы `<EntityChips>` — строки 117–119.
  - Тело статьи (`dangerouslySetInnerHTML`) — строки 138–141.
  - Видео-плеер (`type === 'video'`) — строки 125–136.
  - Блок «Источник» — строки 150–157. После него идут карусели (строки 159–167).
- Каналы проекта уже заданы в футере `apps/web/src/components/Layout.tsx:103–106`: Telegram `https://t.me/insidetraderu`, VK `https://vk.com/inside_trade`, YouTube `https://youtube.com/@insidetraderu`, Dzen `https://dzen.ru/id/5b5ee9d51a66a400a9961a66`.
- `<head>`: `apps/web/index.html:6` — статичный `<title>Инвестиционно.рф — Инвестиционно про будущее</title>`, единственный description (строка 7). **OG-тегов (`og:title`, `og:description`, `og:image`) нет вообще**, клиентского управления `document.title` тоже нет (проверено grep по `apps/web/src` — совпадений нет).
- SPA: react-router (`useParams` в `ArticlePage.tsx:1`), URL статьи имеет вид `/{type}/{slug}` (роуты `/trend/…`, `/kompaniya/…` — в футере Layout; страницы статей подтверждены в `ArticlePage.tsx:68–72`).
- API-клиент: `apps/web/src/api.ts`. `api.article()` (строки 78–79) возвращает `{ article: ArticleDetail, coverUrl, relations, stages }`; `ArticleDetail` (строки 23–29) содержит `id`, `type`, `slug`, `title` — **canonical URL бэкенд не отдаёт**. Хелпер `get()` (строки 1–9) не прикрепляет `Authorization` (паттерн с токеном — отдельный fetch в `favorites.tsx`).
- AuthModal: `apps/web/src/authModal.tsx` — `useAuthModal().open('login' | 'register', returnUrl?)`, провайдер уже смонтирован в `Layout.tsx:46` (`<AuthModal />`). **В ТЗ-02 не используется** — см. решение в 3.2.
- E2E в репо нет; Playwright добавляется в ТЗ-04 (п. 4.7) — спеки этого ТЗ кладутся туда же, в `apps/web/e2e/`.

## 3. Требования

### 3.1 Размещение

Блок шеринга показывается **на всех типах статей** (`analitika`, `novost`, `ideya`, `interesnoe`, `video` — см. `TYPE_LABELS` в `apps/web/src/components/ArticleCard.tsx`) в двух точках страницы:

1. **Под заголовком** — сразу после блока чипов `<EntityChips>` (`ArticlePage.tsx:117–119`), до событий по идее/видео/тела статьи. Отдельной строкой, выровненной по левому краю.
2. **В «футере» статьи** — после блока «Источник» (`ArticlePage.tsx:150–157`) и перед нижними каруселями (строка 159). Пользователь, дочитавший статью, — самый тёплый для репоста.

Обе точки — обязательны, рендерятся одним и тем же компонентом (`ShareButtons`, проп `variant`). Sticky-панель сбоку **не делается** — отложена отдельным ТЗ (решение ТЗ, см. 3.5).

### 3.2 Каналы и авторизация

Кнопки (порядок слева направо):

1. **Telegram** — `https://t.me/share/url?url={ENCODED_URL}&text={ENCODED_TEXT}`
2. **VK** — `https://vk.com/share.php?url={ENCODED_URL}&title={ENCODED_TEXT}`
3. **WhatsApp** — `https://wa.me/?text={ENCODED_TEXT}%20{ENCODED_URL}`
4. **«Копировать ссылку»** — Clipboard API (`navigator.clipboard.writeText`) с визуальным фидбеком («Ссылка скопирована», автоскрытие 2.5 с)
5. **«Поделиться…»** — `navigator.share` (Web Share API), primary-кнопка. Рендерится **только** при `'share' in navigator`; на десктопах без него (Firefox) вместо неё вторичная кнопка-копия «Копировать ссылку» с текстом (дубль иконки 4 допустим, чтобы primary-слот не пустовал).

**Решение ТЗ:** WhatsApp включён (целевая аудитория РФ, мессенджер активно используется; заказчик уведомлён, возврат к списку из 4 кнопок — тривиальная правка конфигура каналов).

**Решение ТЗ:** шеринг доступен **всем, включая анонимов** — AuthModal не открывается (соответствует ТЗ-04, требование S2: шеринг — воронка привлечения; лайки остаются за логином и это отдельный UI из ТЗ-04).

Одноклассники / Dzen-шеринг — **не делаем**, Dzen не имеет публичного endpoint шаринга.

### 3.3 Реализация (без сторонних SDK)

- Никаких JS-SDK соцсетей (VK Open API, Telegram widget js). Только готовые URL + `window.open(url, '_blank', 'popup,width=600,height=600')`.
- **Popup-безопасность:** после `const win = window.open(...)` выполнить `if (win) win.opener = null`. **Fallback при `win === null` (popup blocker):** программный клик по временной `<a href={url} target="_blank" rel="noopener noreferrer">` (добавленной и удалённой в DOM). `location.href` не используем — не уводим пользователя со страницы (решение ТЗ).
- Для `video`-статей (`ArticlePage.tsx:125–136`) текст шеринга — `article.title`, URL — страница статьи (не embed).
- Clipboard API доступен только в secure context; fallback — устаревший `document.execCommand('copy')` через временный `<textarea>`; если и он не сработал (HTTP-dev, очень старый браузер) — фидбек «Не удалось скопировать — скопируйте из адресной строки». Никаких `prompt()`/`alert()`. Обе ветки покрыты.

### 3.4 UTM-метки

В шаринг-URL (Telegram, VK, WhatsApp, нативный шер) добавляются метки:

```
utm_source={telegram|vk|whatsapp|native_share}
utm_medium=share
utm_campaign=article_share
utm_content={type}  # analitika | novost | ideya | interesnoe | video
```

- `utm_source` = канал, в который шарим.
- **Решение ТЗ:** URL для копирования в буфер — **без UTM** (чистая ссылка «для человека»; уходит в личную переписку).
- Итоговый URL собирать через `URLSearchParams`, не конкатенацией строк.

### 3.5 Sticky-панель

**Не входит** (решение ТЗ): отложена отдельным ТЗ после первых метрик использования инлайн-блоков. Основная поставка не блокируется.

### 3.6 Подсчёт шеров (интеграция с ТЗ-04)

- Бэкенд: эндпоинт `POST /api/articles/:id/share`, тело `{ channel }`, авторизация `optionalAuth` (аноним — ок, rate limit по IP), ответ `201 { ok, sharesCount }`, лимит превышен — `429`. Вся серверная часть — ТЗ-04 (миграция `0014`, таблица `article_share_events` с колонкой `channel`, инкремент `articles.shares_count`).
- Клиент: **каждый клик** по любой кнопке блока (включая «Копировать» и нативный шер) отправляет `api.share(article.id, channel)`. **Решение ТЗ:** вызов fire-and-forget — не блокирует открытие попапа/шита, ошибки (429, сеть, 404) глушатся с `console.debug`, UI не меняется. Подтверждение публикации во внешней сети не требуется и не ожидается (ТЗ-04, S1).
- **Whitelist каналов** (должен совпадать с zod-валидацией на бэкенде, ТЗ-04 4.4): `'telegram' | 'vk' | 'whatsapp' | 'copylink' | 'native_share'`. Канал определяется константой рядом с обработчиком кнопки, не выводится из URL.
- Отображение счётчика «Поделились: N» — ТЗ-04 (U4), не входит. Поле `sharesCount` в `ArticleDetail` (ТЗ-04) ShareButtons не читает — счётчик придёт следующей поставкой.
- Лайки (LikeButton) — целиком ТЗ-04, здесь не затрагиваются.

### 3.7 OG-теги (зависимость, не входит в объём)

Сейчас OG-тегов нет (`apps/web/index.html:3–8` — только `<title>` и `<meta name="description">`), а SPA отдаёт пустой `<div id="root">`. Скроллеры соцсетей при репосте возьмут `og:title`/`og:description` из `<title>`/description главной страницы — **одинаково для всех статей**, без картинки. Это фиксируется как внешняя зависимость:

> **Зависимость от ТЗ-10 «OG-теги / пререндер»:** без SSR/пререндера или сервиса (например, prerender.io / самописного edge-рендера) превью репоста будет некорректным. Кнопки из ТЗ-02 работают и без ТЗ-10, но эффективность шеринга ограничена. ТЗ-10 — отдельная задача, блокирует только качество превью, не блокирует поставку кнопок.

Дополнительно в ТЗ-10: полноценные OG. Клиентская установка `document.title` делается сразу в рамках ТЗ-02 (см. 4.5) — не решает OG (роботы не выполняют JS), но улучшает вкладку/закладки.

### 3.8 Дизайн

В фирменной палитре (чёрный `#000`, лайм `#beff00` / `#c9ff2a`, границы `#2a2a2a`, текст `zinc-500/400`, паттерны из `Layout.tsx` и `ArticlePage.tsx`):

- Иконки: inline SVG (как принято в проекте — см. иконку поиска `Layout.tsx:26–28`), набор Telegram/VK/WhatsApp/link, без эмодзи и внешних картинок.
- Кнопки-каналы: `rounded-full`, `border border-[#2a2a2a]`, иконка `text-zinc-400`, hover: `text-[#beff00]` + `border-[#beff00]/40` (паттерн hover-ссылок в футере `Layout.tsx:63` `hover:text-[#c9ff2a]`). Размер touch-friendly ≥ 40×40 px.
- Primary-кнопка «Поделиться» (нативный шер на мобильных): `bg-[#beff00] text-zinc-950`, как «Войти» (`Layout.tsx:39`) — визуальный акцент на главном действии.
- Фидбек копирования: подпись/тултип «Ссылка скопирована» лаймом, `transition-opacity`, автоскрытие ~2.5 с (таймер в `useEffect` с очисткой). Никаких `alert()`.

## 4. Реализация (шаги по файлам)

### 4.1 Новый файл `apps/web/src/lib/share.ts`

Чистые функции, без React:

```ts
export const SHARE_CHANNELS = ['telegram', 'vk', 'whatsapp', 'copylink', 'native_share'] as const;
export type ShareChannel = (typeof SHARE_CHANNELS)[number];

export function buildShareLink(channel: 'telegram' | 'vk' | 'whatsapp', title: string, pageUrl: string, type: string): string;
// Возвращает готовый URL шаринга с UTM: для telegram — t.me/share/url, vk — vk.com/share.php,
// whatsapp — wa.me. pageUrl — canonical (без UTM), метки добавляются внутри через URLSearchParams.
// Заголовок кодируется один раз (encodeURIComponent) и переиспользуется в text=/title=/wa.me text.

export function buildCanonicalUrl(): string;
// window.location.origin + window.location.pathname — без ?query и #hash (решение ТЗ:
// бэкенд canonical не отдаёт, UTM-засорённый URL текущей вкладки не берём).

export function withUtm(pageUrl: string, source: string, type: string): string;
// utm_source={source}&utm_medium=share&utm_campaign=article_share&utm_content={type} через URLSearchParams.
```

### 4.2 Новый файл `apps/web/src/components/ShareButtons.tsx`

Единый компонент блока шеринга:

```tsx
interface ShareButtonsProps {
  articleId: number;    // article.id → POST /api/articles/:id/share
  title: string;        // article.title
  type: string;         // article.type → utm_content
  variant: 'inline-top' | 'inline-bottom';
}
```

Внутри:

- `openSharePopup(url)` — `window.open(url, '_blank', 'popup,width=600,height=600')`, `win.opener = null`, fallback временной `<a target="_blank" rel="noopener noreferrer">` при `win === null` (3.3).
- `copyLink()` — Clipboard API → fallback `execCommand('copy')` → фидбек-флаг в `useState` + автоскрытие 2.5 с.
- `shareNative()` — `navigator.share({ title, url: withUtm(...) })`, канал `'native_share'`. Отклонение промиса (пользователь закрыл шит) — не ошибка, событие всё равно зафиксировано по факту клика (соответствует S1).
- `track(channel)` — `void api.share(articleId, channel).catch((e) => console.debug('share event failed', e))`; вызывается синхронно в каждом обработчике **до** открытия попапа (не ждём ответа).
- Кнопки Telegram/VK/WhatsApp — в цикле по конфигу `[{ channel, href, label, Icon }]`; нативный шер/копия — отдельно по правилам 3.2.
- Опционально подпись сверху «Поделиться:» (`text-xs uppercase tracking-wide text-zinc-500` — как подзаголовки каруселей в `ArticlePage.tsx:53`); для `variant="inline-bottom"` подпись обязательна, для `inline-top` — нет.

### 4.3 Правки `apps/web/src/api.ts`

- Добавить метод в объект `api` (рядом со строками 75–79):

```ts
share: (id: number, channel: string) =>
  fetch(`/api/articles/${id}/share`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ channel }),
  }),
```

- Отдельный хелпер `get()` не используем: запрос не должен бросать исключения в UI-поток (вызывающий код сам глушит ошибки, 3.6). Токен не прикрепляем (анонимный шеринг легален; при желании позже — тот же паттерн Authorization, что в `favorites.tsx`, ТЗ-04 это поддерживает через `optionalAuth`).

### 4.4 Правки `apps/web/src/pages/ArticlePage.tsx`

- Импорт: добавить `import { ShareButtons } from '../components/ShareButtons';` к блоку импортов (строки 4–14).
- Вставка №1: после закрывающего `</div>` чипов (после строки 119) — `<ShareButtons articleId={article.id} title={article.title} type={article.type} variant="inline-top" />`.
- Вставка №2: после блока «Источник» (после строки 157, до `{/* Нижний блок каруселей */}` на строке 159) — тот же компонент с `variant="inline-bottom"`.
- Обе вставки — безусловные, для всех `article.type` (3.1).
- См. 4.5 для `document.title`.

### 4.5 `document.title` (в этой же поставке)

В `ArticlePage.tsx` добавить `useEffect` (импорт из react): при наличии `data` ставить `document.title = \`${article.title} — Инвестиционно.рф\``, при размонтировании возвращать дефолт из `index.html:6`. Не решает OG (роботы не выполняют JS), но улучшает вкладку/закладки. Полноценный OG — ТЗ-10.

### 4.6 Иконки

Inline SVG внутри `ShareButtons.tsx` (Telegram paper-plane, «VK», WhatsApp, link / check для «скопировано»). Существующий стиль иконки поиска — `Layout.tsx:26–28`.

### 4.7 Чеклист файлов

- [ ] `apps/web/src/lib/share.ts` — новый: каналы, `buildShareLink`, `buildCanonicalUrl`, `withUtm`.
- [ ] `apps/web/src/components/ShareButtons.tsx` — новый: UI, попап+fallback, копирование+fallback, нативный шер, `track()` → `api.share`.
- [ ] `apps/web/src/api.ts` — метод `api.share(id, channel)` (4.3).
- [ ] `apps/web/src/pages/ArticlePage.tsx` — две вставки `<ShareButtons>` + `useEffect` на `document.title` (4.4, 4.5).
- [ ] `apps/web/e2e/share.spec.ts` — новый (раздел 5; Playwright ставится по ТЗ-04 4.7, конфиг `apps/web/playwright.config.ts` общий).
- [ ] `apps/web/index.html` — **без изменений** (OG — ТЗ-10).

## 5. Тестирование (e2e)

Инфраструктура Playwright — из ТЗ-04 (п. 4.7): `@playwright/test` как devDependency, конфиг `apps/web/playwright.config.ts`, спеки в `apps/web/e2e/`. Спека **`apps/web/e2e/share.spec.ts`**:

1. **Видимость на всех типах:** для фикстур каждого из 5 типов (`analitika`, `novost`, `ideya`, `interesnoe`, `video`) блок шеринга присутствует ровно в двух местах: после чипов и после «Источника» (проверка по data-testid `share-block` + порядковый соседний элемент).
2. **Telegram-URL:** стаб `window.open` → клик по `share-telegram` → вызван с `https://t.me/share/url?url=…`, в `url` присутствуют `utm_source=telegram&utm_medium=share&utm_campaign=article_share&utm_content={type}`; заголовок с кириллицей/пробелами корректно закодирован (декодируется обратно в исходный `article.title`).
3. **VK-URL:** аналогично — `https://vk.com/share.php?url=…&title=…` с `utm_source=vk`.
4. **WhatsApp-URL:** `https://wa.me/?text=…` с `utm_source=whatsapp` внутри URL-части.
5. **Popup blocker:** `window.open` возвращает `null` → клик по Telegram → создана временная `<a target="_blank" rel="noopener noreferrer">` с тем же href (проверить через перехват `page.click` на ссылку / DOM-наблюдение), текущая страница не ушла (`page.url()` не изменился).
6. **Копирование:** контекст с `permissions: ['clipboard-read', 'clipboard-write']` → клик `share-copylink` → буфер содержит canonical URL **без** `utm_` и без `?`/`#`; показан фидбек «Ссылка скопирована»; через ~3 с скрыт.
7. **Нативный шер:** эмулятор с реализованным `navigator.share` (страница-инициализация через `addInitScript`) → primary-кнопка видна, клик вызывает `navigator.share` с `{ title, url }`, url содержит `utm_source=native_share`. Десктоп-профиль без `navigator.share` → primary-кнопка не рендерится, вместо неё текстовая «Копировать ссылку».
8. **Событие в ТЗ-04 API:** `page.route('**/api/articles/*/share')` → клик по каждой из 5 кнопок → 5 POST с телом `{ channel }`, channel ∈ whitelist (`telegram|vk|whatsapp|copylink|native_share`), путь содержит `article.id`; 429 от эндпоинта не ломает UI (попап всё равно открылся, ошибка только в console).
9. **Video-статья:** в зашаренном URL — страница статьи (`/{type}/{slug}`), embed-URL (`youtube.com/embed` и т.п.) отсутствует.
10. **Адаптив:** вьюпорты 320px и 1440px — блок не выходит за контейнер `max-w-3xl`, кнопки не перекрываются, touch-цели ≥ 40 px.
11. **document.title:** на странице статьи заголовок вкладки — `{article.title} — Инвестиционно.рф`; после перехода на главную — дефолт из `index.html`.

Ручной проход (не автоматизируется): реальный попап Telegram/VK на десктопе, нативный шит на Android Chrome / iOS Safari, копирование по HTTP-dev (fallback-ветка).

## 6. Критерии приёмки

1. На странице любой статьи (`/analitika/…`, `/novost/…`, `/ideya/…`, `/interesnoe/…`, `/video/…` — URL вида `/{type}/{slug}`) блок шеринга виден в двух местах: после чипов и после «Источника».
2. Клик по **Telegram** открывает `https://t.me/share/url?url=…&text=…` в попапе 600×600 (или новой вкладке при заблокированном попапе); в переданном URL присутствуют `utm_source=telegram&utm_medium=share&utm_campaign=article_share&utm_content={type}`.
3. Клик по **VK** аналогично через `https://vk.com/share.php?url=…&title=…` с `utm_source=vk`; **WhatsApp** — `https://wa.me/?text=…` с `utm_source=whatsapp`.
4. **«Копировать ссылку»** кладёт canonical URL **без UTM** в буфер (Clipboard API; подтверждено в Chrome/HTTPS), показывает фидбек «Ссылка скопирована» с автоскрытием ~2.5 с; при недоступности API — fallback `execCommand` либо понятное сообщение об ошибке.
5. На мобильном (Android Chrome, iOS Safari) primary-кнопка «Поделиться…» вызывает нативный шит `navigator.share` с заголовком и URL с `utm_source=native_share`; на десктопе без `navigator.share` кнопка не рендерится, вместо неё — текстовая «Копировать ссылку»; поведение одинаково на всех статьях.
6. Popup blocker: при блокировке всплывающего окна шаринг не «проваливается молча» — открывается новая вкладка через временную `<a>`, текущая страница остаётся.
7. Все шаринг-URL корректно закодированы: проверить статью с заголовком, содержащим пробелы, кавычки и кириллицу (сценарий 2 спеки).
8. Видео-статья: шарится страница статьи, а не embed-URL.
9. Клик по каждой из 5 кнопок шеринга шлёт `POST /api/articles/{id}/share` с телом `{ channel }` (whitelist: `telegram | vk | whatsapp | copylink | native_share`), независимо от авторизации пользователя; сбой эндпоинта (в т.ч. 429) не прерывает UX шаринга.
10. Визуал соответствует 3.8: тёмная тема, лайм-ховеры, без внешних ассетов, адаптив от 320px до десктопа, статья на `max-w-3xl` (`ArticlePage.tsx:89`) не «плывёт».
11. `document.title` на странице статьи — `{article.title} — Инвестиционно.рф`, после ухода — дефолт.
12. `npm run build` в `apps/web` без ошибок; e2e-сценарии раздела 5 проходят локально/в CI; ручной проход по страницам всех 5 типов контента.

## 7. Риски

| Риск | Влияние | Митигация |
|---|---|---|
| Popup blockers режут `window.open` без прямого user gesture | Кнопка «не работает» с точки зрения пользователя | Fallback временная `<a target="_blank">`; проверить в Safari (strictest); сценарий 5 спеки |
| Clipboard API требует secure context и user gesture | «Скопировать» не работает на HTTP-dev или старых браузерах | Fallback `execCommand`; понятный фидбек при полном провале; ручной тест на HTTP-dev и HTTPS |
| `navigator.share` нет в десктопном Firefox, поведение отличается по платформам | Расхождение UX десктоп/мобайл | Feature-detect `'share' in navigator`; на десктопе без него — текстовая «Копировать ссылку» (решение ТЗ); сценарий 7 спеки |
| `POST /share` не успевает уйти до ухода со страницы (попап открылся, вкладка закрыта) | Потеря части событий в статистике | Приемлемо: событие шлётся синхронно до открытия попапа; `fetch` с keepalive не требуем (метрика ориентировочная) — при нехватке точности доработка в ТЗ-04 |
| Блокировщики рекламы режут `vk.com/share.php`/`t.me/share` (фанатские фильтры) | Редкий: попап не открывается | Тот же fallback, что и для popup blocker |
| Отсутствие OG-тегов (зависимость от ТЗ-10) | Превью репоста — общий заголовок сайта без картинки; шеринг менее кликабелен | Зафиксировано как внешняя зависимость; не блокирует поставку кнопок |
| SPA: роботы соцсетей при первом проходе не увидят контент статьи | То же, что выше | ТЗ-10 (SSR/prerender/edge) |
| Накрутка счётчика shares кликами | Число завышено | Rate limit и журнал — ТЗ-04 (S3); UI честно подписан «Поделились» (не «репосты») |

## 8. Открытые вопросы (закрыты решениями ТЗ)

1. **WhatsApp** — включён (3.2). Альтернатива (без него) — правка массива каналов, ~5 минут.
2. **UTM в буфере обмена** — буфер без UTM, чистая canonical-ссылка (3.4).
3. **Canonical URL** — `origin + pathname` на клиенте; бэкенд canonical не отдаёт, `?`/`#` отбрасываем (4.1).
4. **Sticky-панель** — отложена отдельным ТЗ, не блокирует поставку (3.5).
5. **Авторизация при шеринге** — не требуется, AuthModal не используется (3.2; соответствует ТЗ-04 S2).
6. **Fallback popup blocker** — временная `<a target="_blank">`, без ухода со страницы (3.3).
7. **Фиксация события при закрытом нативном шите** — событие считается по факту клика (S1), отклонение промиса не ошибка (3.6).
8. **Счётчик «Поделились: N» в UI** — не входит, поставляется ТЗ-04 (U4) поверх этого же блока.

---

## Правки ревью v2.1 (принято, обязательны к реализации)

1. **document.title делегируем ТЗ-06** (`lib/pageTitle.ts`, формат `«{title}» — инвестиционно.рф`). Свой useEffect на title (§4.5, критерий 11) — отменяется; в ArticlePage вызываем `setArticleTitle(article.title)`.
2. **E2E**: Playwright в репо НЕ добавляем (решение ТЗ-04). Сценарии §5 — ручной проход; API-часть (POST share, whitelist) — curl-smoke в scripts/e2e.sh при реализации ТЗ-04.
3. `navigator.share(...)` — промис глушим `.catch(() => {})` (закрытие шита — не ошибка).
4. `api.share(id, channel: ShareChannel)` — типизировано, `ShareChannel` импортируется из lib/share.ts (один union на обе границы). Тело ответа `{ ok, sharesCount }` — тип описать.
5. Формулировка про whitelist: «каналы вне whitelist бэкенд мапит в 'unknown'» (zod в ТЗ-04 строкой не валидирует).
6. Paywall-страница (403): блок шеринга НЕ рендерится (данных статьи нет) — зафиксировать в §3.1.
7. WhatsApp — включён (решение принято).
8. Sticky-панель — отдельным ТЗ, здесь не делаем.
