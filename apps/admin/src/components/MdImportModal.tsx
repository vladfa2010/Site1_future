import { useRef, useState } from 'react';
import { importMarkdown, previewMd, type MdImportPreview, type MdImportResult } from '../lib/mdImport';

/**
 * ТЗ-16: модал импорта Markdown → редактор.
 * Drop/paste файла → превью-статистика → импорт (картинки base64 уходят
 * в медиатеку, src заменяются на /uploads/…).
 */
export function MdImportModal({
  onClose,
  onApply,
  onMeta,
  docEmpty,
}: {
  onClose: () => void;
  /** HTML для вставки в редактор (setContent) */
  onApply: (html: string) => void;
  /** H1/тезис из MD — родитель решает, подставлять ли в поля формы */
  onMeta: (meta: { title: string | null; thesis: string | null; useTitle: boolean; useThesis: boolean }) => void;
  /** документ редактора пуст — подтверждение замены не нужно */
  docEmpty: boolean;
}) {
  const fileRef = useRef<HTMLInputElement>(null);
  const [text, setText] = useState('');
  const [preview, setPreview] = useState<MdImportPreview | null>(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [useTitle, setUseTitle] = useState(true);
  const [useThesis, setUseThesis] = useState(true);
  const [done, setDone] = useState<MdImportResult | null>(null);

  const runPreview = (content: string) => {
    setText(content);
    setDone(null);
    setErr(null);
    setPreview(previewMd(content));
  };

  const onFile = (f: File | undefined) => {
    if (!f) return;
    if (f.size > 2 * 1024 * 1024) {
      setPreview({ ok: false, error: `Файл больше 2 МБ (${Math.round(f.size / 1024)} КБ). Разбейте на части.`, textTooBig: true, title: null, sections: 0, images: 0, base64Images: 0, externalImages: 0, tables: 0, frontMatter: false });
      return;
    }
    const reader = new FileReader();
    reader.onload = () => runPreview(String(reader.result ?? ''));
    reader.onerror = () => setErr('Не удалось прочитать файл');
    reader.readAsText(f);
  };

  const runImport = async () => {
    if (!preview?.ok) return;
    if (!docEmpty && !window.confirm('Документ не пустой — импорт ЗАМЕНИТ текущее содержимое. Продолжить?')) return;
    setBusy(true);
    setErr(null);
    try {
      const res = await importMarkdown(text);
      onApply(res.html);
      onMeta({ title: res.title, thesis: res.thesis, useTitle: useTitle && !!res.title, useThesis: useThesis && !!res.thesis });
      setDone(res);
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'Ошибка импорта');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4" onClick={onClose}>
      <div
        className="max-h-[85vh] w-full max-w-2xl overflow-y-auto rounded-xl border border-zinc-700 bg-zinc-950 p-4"
        onClick={(e) => e.stopPropagation()}
        onDragOver={(e) => e.preventDefault()}
        onDrop={(e) => {
          e.preventDefault();
          onFile(e.dataTransfer.files?.[0]);
        }}
      >
        <div className="mb-3 flex items-center justify-between">
          <h3 className="font-semibold">Импорт Markdown</h3>
          <button type="button" className="btn-secondary" onClick={onClose}>Закрыть</button>
        </div>

        {!done && (
          <>
            <div
              className="mb-3 rounded-lg border border-dashed border-zinc-700 p-6 text-center text-sm text-zinc-500"
              onClick={() => fileRef.current?.click()}
            >
              Перетащите .md-файл сюда или нажмите для выбора
              <input ref={fileRef} type="file" accept=".md,.markdown,.txt" className="hidden" onChange={(e) => onFile(e.target.files?.[0])} />
            </div>
            <textarea
              value={text}
              onChange={(e) => runPreview(e.target.value)}
              placeholder="…или вставьте текст Markdown сюда"
              rows={8}
              className="input mb-3 w-full font-mono text-xs"
            />

            {preview && (
              <div className="mb-3 rounded-lg bg-zinc-900 p-3 text-sm">
                {preview.error && <p className="text-red-400">{preview.error}</p>}
                {!preview.error && (
                  <>
                    <p className="text-zinc-300">
                      {preview.title ? <>Заголовок: <b>{preview.title}</b></> : 'Без H1 — заголовок статьи не тронем'}
                    </p>
                    <p className="mt-1 text-zinc-500">
                      Разделов: {preview.sections} · Картинок: {preview.images}
                      {preview.base64Images > 0 && <> ({preview.base64Images} из base64 → в медиатеку)</>}
                      {preview.externalImages > 0 && <> · внешние: {preview.externalImages} (останутся ссылками)</>}
                      {' · '}Таблиц: {preview.tables}
                      {preview.footnoteDefs > 0 && <> · Сносок: {preview.footnoteDefs} → «Источники и примечания»</>}
                    </p>
                    {preview.frontMatter && <p className="mt-1 text-amber-400">⚠ Front matter (--- блок) не поддерживается — импортируется как текст.</p>}
                    {preview.title && (
                      <label className="mt-2 block text-zinc-400">
                        <input type="checkbox" checked={useTitle} onChange={(e) => setUseTitle(e.target.checked)} className="mr-1" />
                        Подставить заголовок и тезис в поля статьи
                      </label>
                    )}
                  </>
                )}
              </div>
            )}
            {err && <p className="mb-2 text-sm text-red-400">{err}</p>}
            <button type="button" disabled={!preview?.ok || busy} onClick={() => void runImport()} className="btn-primary">
              {busy ? 'Импортирую… (картинки грузятся в медиатеку)' : 'Импортировать'}
            </button>
          </>
        )}

        {done && (
          <div className="rounded-lg bg-zinc-900 p-3 text-sm text-zinc-300">
            <p>✅ Импортировано: разделов {done.sections}, таблиц {done.tables}{done.footnotes > 0 && <>, сносок {done.footnotes} → «Источники и примечания»</>}.</p>
            <p className="mt-1">
              Картинки: {done.uploadedImages} → медиатека
              {done.failedImages > 0 && <span className="text-amber-400">, {done.failedImages} не загрузились (остались base64)</span>}
              {done.externalImages > 0 && <span className="text-zinc-500">, {done.externalImages} внешние — ссылки</span>}.
            </p>
            {done.title && <p className="mt-1 text-zinc-500">Заголовок из MD: «{done.title}»{useTitle ? ' — подставлен' : ''}</p>}
            <button type="button" className="btn-secondary mt-3" onClick={onClose}>Готово</button>
          </div>
        )}
      </div>
    </div>
  );
}
