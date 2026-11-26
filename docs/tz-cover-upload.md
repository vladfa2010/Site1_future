# ТЗ-17: Обложка «С диска» в ContentMaster

Статус: принято 2026-11-26.
Контекст: в ContentMasterPage обложку можно сгенерировать (Kimi) или выбрать
из медиатеки (ТЗ «обложка из галереи»). Третий источник — файл с компьютера —
есть в ArticleEditPage (`uploadCover`, ArticleEditPage.tsx:506-538), но в
ContentMaster отсутствует: автор, у которого готовая картинка, вынужден
сначала загружать её в другом месте. Эта задача — зеркалирование существующего
решения, API не меняется.

## Задача

**Решение:**
1. В блок «Обложка» ContentMasterPage рядом с кнопкой «🖼 Из галереи» —
   кнопка **«📁 С диска»** и скрытый `<input type="file" accept="image/jpeg,image/png,image/webp">`.
2. Обработчик — копия `uploadCover` из ArticleEditPage: multipart POST
   `/api/media/upload` (Bearer из localStorage) → ответ `201 { media, url }` →
   `setCoverMediaId(body.media.id)` + `setCoverPreview(origin + body.url)` +
   `setCoverMock(false)` (загруженная картинка — не mock).
3. Состояния: busy (кнопка неактивна, текст «Загружаем…»), ошибка — через
   штатный `setError` ContentMaster, 401 — удалить токен и на `/login`
   (конвенция приложения).
4. После выбора file input сбрасывается (`value = ''`) — повторный выбор
   того же файла срабатывает.
5. `coverMediaId` уезжает в POST черновика существующим полем — изменений
   пайплайна сохранения нет.

**Не входит:** crop/resize на клиенте (sharp на сервере уже жмёт в webp ≤1600px),
drag-drop, загрузка по URL.

## Проверка

1. Файл jpg → «📁 С диска» → превью обновилось, `coverMediaId` не null.
2. Сохранение черновика → у статьи обложка = загруженный файл.
3. Повторный выбор того же файла срабатывает.
4. Ошибка (например, .svg) → понятное сообщение, превью не меняется.
5. 401 → редирект на /login.

## Касание файлов

- `apps/admin/src/pages/ContentMasterPage.tsx` — только (кнопка, input,
  `coverFileRef`, `uploadCover`).
