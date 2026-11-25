import { useEffect, useRef, useState } from 'react';
import { useEditor, EditorContent } from '@tiptap/react';
import StarterKit from '@tiptap/starter-kit';
import Image from '@tiptap/extension-image';
import { NodeSelection } from '@tiptap/pm/state';
import { Table, TableRow, TableCell, TableHeader } from '@tiptap/extension-table';
import type { Editor } from '@tiptap/react';
import { MdImportModal } from './MdImportModal';

/**
 * Image с поддержкой width (в % от ширины колонки). Ширина хранится
 * инлайн-стилем width:N% — санитизер сайта (web/lib/sanitize) разрешает
 * style для img, но только width в процентах (allowedStyles, без произвольного CSS).
 */
const ResizableImage = Image.extend({
  addAttributes() {
    return {
      ...this.parent?.(),
      width: {
        default: null,
        parseHTML: (el: HTMLElement) => {
          const m = /^(\d{1,3})%$/.exec(el.style.width ?? '');
          return m ? m[1] : null;
        },
        renderHTML: (attrs: Record<string, string | null>) =>
          attrs.width ? { style: `width:${attrs.width}%` } : {},
      },
    };
  },
});

/** Загрузка файла в медиатекуру (автопережатие sharp на сервере) → url для вставки. */
async function uploadImageToMedia(file: File): Promise<string> {
  const fd = new FormData();
  fd.append('file', file);
  const token = localStorage.getItem('token');
  const res = await fetch('/api/media/upload', {
    method: 'POST',
    headers: token ? { Authorization: `Bearer ${token}` } : {},
    body: fd,
  });
  if (res.status === 401 && token) {
    localStorage.removeItem('token');
    window.location.href = '/login';
    throw new Error('Сессия истекла');
  }
  const body = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(body.message ?? `HTTP ${res.status}`);
  return body.url as string;
}

/**
 * TipTap-редактор контента статьи (решение раздела 6.2).
 * Работает с HTML (content_html): открывает мигрированный контент и LLM-HTML,
 * сохраняет обратно HTML. Санитизация — на рендере сайта (web/lib/sanitize).
 *
 * Двусторонняя связка: печатает пользователь → onChange(getHTML) в родителя;
 * меняет value родитель (новый результат AI, другая статья) → подставляем в редактор.
 * Без этого контент обновлялся только когда редактор был пуст (isEmpty) —
 * в ContentMaster после фактчека статья не подменяла в редакторе старый текст.
 *
 * ТЗ-16: кнопка «Импорт MD» живёт в тулбаре — доступна везде, где используется
 * редактор (статьи всех типов, сюжеты, тренды, компании, ContentMaster).
 * onImportedMeta — опциональный канал для полей формы (заголовок/тезис из H1).
 */
export function RichTextEditor({
  value,
  onChange,
  onImportedMeta,
  importFields,
}: {
  value: string;
  onChange: (html: string) => void;
  /** ТЗ-16: H1 и первый абзац из импортированного MD (по чекбоксу юзера) */
  onImportedMeta?: (meta: { title: string | null; thesis: string | null }) => void;
  /** ТЗ-16: текущие поля формы — модал импорта не затирает заполненные молча */
  importFields?: { title: string; thesis: string };
}) {
  const lastApplied = useRef<string | null>(null);
  const editorRef = useRef<Editor | null>(null); // для handlePaste (async-вставка после загрузки)
  const editor = useEditor({
    // v3: по умолчанию НЕ перерендеривается на транзакциях — без этого
    // isActive('image')/панель ImageMenu и подсветка тулбара мертвы (ревью agent-69)
    shouldRerenderOnTransaction: true,
    onDestroy: () => {
      editorRef.current = null; // async-вставка после ухода со страницы — не трогаем редактор
    },
    extensions: [
      StarterKit.configure({ heading: { levels: [2, 3, 4] } }),
      ResizableImage,
      Table.configure({ resizable: false }),
      TableRow,
      TableHeader,
      TableCell,
    ],
    content: value,
    onCreate: ({ editor: e }) => {
      editorRef.current = e;
    },
    onUpdate: ({ editor }) => {
      lastApplied.current = editor.getHTML(); // печать пользователя — не затирать из effect
      onChange(editor.getHTML());
    },
    editorProps: {
      // Ctrl+V картинкой: файлы из буфера → медиатека → вставка в позицию курсора.
      // Раньше срабатывало случайно (браузер вставлял data-URI, в HTML уходили
      // мегабайты base64) — теперь осознанно: тот же путь, что и кнопка 📤.
      handlePaste: (_view, event) => {
        const files = Array.from(event.clipboardData?.files ?? []).filter((f) =>
          f.type.startsWith('image/'),
        );
        if (files.length === 0) return false; // не картинка — стандартная вставка
        event.preventDefault();
        void (async () => {
          const ed = editorRef.current;
          for (const f of files) {
            try {
              const url = await uploadImageToMedia(f);
              ed?.chain().focus().setImage({ src: url }).run();
            } catch (e) {
              console.error('[paste-image]', e); // ошибка видна в консоли; тулбар 📤 даёт текст ошибки
            }
          }
        })();
        return true;
      },
      // клик по картинке → NodeSelection: в этом билде ProseMirror не выделяет
      // атомарный узел сам (баг «картинку нельзя выделить кликом»), поэтому
      // выставляем выделение явно. Backspace/Delete с активным NodeSelection
      // удаляют узел штатно (baseKeymap → deleteSelection).
      handleClick: (view, _pos, event) => {
        const target = event.target as HTMLElement | null;
        if (target?.tagName !== 'IMG') return false;
        const p = view.posAtDOM(target, 0);
        const node = view.state.doc.nodeAt(p);
        if (node?.type.name !== 'image') return false;
        view.dispatch(view.state.tr.setSelection(NodeSelection.create(view.state.doc, p)));
        return true;
      },
      attributes: {
        class: 'prose-invert min-h-[320px] max-w-none px-4 py-3 text-sm leading-relaxed focus:outline-none [&_h2]:mt-4 [&_h2]:text-lg [&_h2]:font-bold [&_h3]:mt-3 [&_h3]:font-bold [&_ul]:list-disc [&_ul]:pl-5 [&_ol]:list-decimal [&_ol]:pl-5 [&_blockquote]:border-l-2 [&_blockquote]:border-zinc-600 [&_blockquote]:pl-3 [&_blockquote]:italic [&_a]:text-orange-400 [&_img]:max-w-full [&_img]:rounded-lg [&_td]:border [&_td]:border-zinc-700 [&_td]:px-2 [&_td]:py-1 [&_th]:border [&_th]:border-zinc-700 [&_th]:px-2 [&_th]:py-1 [&_.ProseMirror-selectednode]:rounded-lg [&_.ProseMirror-selectednode]:ring-2 [&_.ProseMirror-selectednode]:ring-[#beff00]',
      },
    },
  });

  // внешнее изменение value (результат AI, загрузка другой статьи) → подставляем в редактор;
  // emitUpdate не включаем, чтобы не зациклить onChange → value → effect
  useEffect(() => {
    if (!editor) return;
    if (value === lastApplied.current) return; // уже в редакторе (печать/прошлая подстановка)
    if (value === editor.getHTML()) { lastApplied.current = value; return; }
    editor.commands.setContent(value, { emitUpdate: false });
    lastApplied.current = value;
  }, [editor, value]);

  if (!editor) return <div className="input min-h-[320px] animate-pulse" />;

  return (
    <div className="overflow-hidden rounded-lg border border-zinc-700 bg-zinc-950">
      <Toolbar editor={editor} onImportedMeta={onImportedMeta} importFields={importFields} />
      {/* меню выделенной картинки: название (alt), ширина, удаление, где используется */}
      {editor.isActive('image') && <ImageMenu editor={editor} />}
      <EditorContent editor={editor} />
    </div>
  );
}

interface UsageItem { entity: string; id: number; slug: string | null; title: string }
const USAGE_LABEL: Record<string, string> = {
  article: 'материал', trend: 'тренд', company: 'компания', industry: 'отрасль', story: 'сюжет',
};
const usageLabel = (e: string) => USAGE_LABEL[e.split(':')[0]] ?? e;

/** Меню картинки (показывается, когда картинка в редакторе выделена кликом). */
function ImageMenu({ editor }: { editor: Editor }) {
  const src = String(editor.getAttributes('image').src ?? '');
  const width = String(editor.getAttributes('image').width ?? '100');
  const [alt, setAlt] = useState(String(editor.getAttributes('image').alt ?? ''));
  const [lookup, setLookup] = useState<{ mediaId: number | null; usage: { covers: UsageItem[]; inline: UsageItem[] } | null }>({ mediaId: null, usage: null });
  const [loaded, setLoaded] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);

  // alt в поле — из выделенной картинки (при смене выделения)
  useEffect(() => {
    setAlt(String(editor.getAttributes('image').alt ?? ''));
    setNotice(null);
    setErr(null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [src]);

  // где используется: серверный lookup по пути (ревью agent-69 — не гонять список медиатеки)
  useEffect(() => {
    let cancelled = false;
    setLookup({ mediaId: null, usage: null });
    setLoaded(false);
    const token = localStorage.getItem('token');
    if (!src) return;
    void (async () => {
      try {
        const r = await fetch(`/api/media/usage-by-path?path=${encodeURIComponent(src)}`, {
          headers: token ? { Authorization: `Bearer ${token}` } : {},
        });
        if (!r.ok || cancelled) return;
        const d = (await r.json()) as { media: { id: number } | null; covers: UsageItem[]; inline: UsageItem[] };
        if (cancelled) return;
        setLookup({ mediaId: d.media?.id ?? null, usage: { covers: d.covers, inline: d.inline } });
      } catch {
        /* usage — подсказка, молчим */
      } finally {
        if (!cancelled) setLoaded(true);
      }
    })();
    return () => { cancelled = true; };
  }, [src]);

  const saveAlt = async () => {
    setErr(null); setNotice(null);
    editor.chain().focus().updateAttributes('image', { alt }).run();
    if (!lookup.mediaId) { setNotice('Подпись обновлена в тексте'); return; }
    try {
      const token = localStorage.getItem('token');
      const r = await fetch(`/api/media/${lookup.mediaId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
        body: JSON.stringify({ alt }),
      });
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
      setNotice('Подпись сохранена в медиатеке ✓');
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'Ошибка сохранения');
    }
  };

  // mousedown гасим у всех кнопок: иначе фокус уходит из contentEditable,
  // ProseMirror теряет NodeSelection и панель размонтируется до onClick (ревью agent-69)
  const keepSelection = (e: React.MouseEvent) => e.preventDefault();

  return (
    <div className="space-y-2 border-b border-zinc-800 bg-zinc-900/60 px-3 py-2 text-xs">
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-zinc-500">Картинка:</span>
        <input
          className="input min-w-0 flex-1 py-1 text-xs"
          value={alt}
          onChange={(e) => setAlt(e.target.value)}
          placeholder="подпись (alt) — видна в галерее и для скринридеров"
        />
        <button type="button" className="btn-secondary py-1 text-xs" onMouseDown={keepSelection} onClick={() => void saveAlt()}>💾 Сохранить</button>
        <span className="mx-1 h-4 w-px bg-zinc-700" />
        {([['100', 'Ширина 100%'], ['75', 'Ширина 75%'], ['50', 'Ширина 50%']] as const).map(([w, title]) => (
          <button
            key={w}
            type="button"
            title={title}
            onMouseDown={keepSelection}
            onClick={() => editor.chain().focus().updateAttributes('image', { width: w === '100' ? null : w }).run()}
            className={`rounded px-2 py-1 font-semibold ${width === w ? 'bg-orange-500 text-zinc-950' : 'bg-zinc-800 text-zinc-300 hover:bg-zinc-700'}`}
          >
            {w}%
          </button>
        ))}
        <button type="button" title="Удалить картинку" onMouseDown={keepSelection} onClick={() => editor.chain().focus().deleteSelection().run()} className="rounded bg-zinc-800 px-2 py-1 hover:bg-red-500/20">🗑</button>
      </div>
      {(notice || err) && <p className={err ? 'text-red-400' : 'text-green-400'}>{err ?? notice}</p>}
      {loaded && lookup.usage && (
        <div className="flex flex-wrap gap-x-4 gap-y-1 text-zinc-400">
          <span>
            🖼 Обложка у:{' '}
            {lookup.usage.covers.length === 0
              ? <span className="text-zinc-600">никого</span>
              : lookup.usage.covers.map((c) => <span key={`c${c.entity}${c.id}`} className="mr-2">{usageLabel(c.entity)} «{c.title}»</span>)}
          </span>
          <span>
            📄 Внутри текстов:{' '}
            {lookup.usage.inline.length === 0
              ? <span className="text-zinc-600">нигде</span>
              : lookup.usage.inline.map((c) => <span key={`i${c.entity}${c.id}`} className="mr-2">{usageLabel(c.entity)} «{c.title}»</span>)}
          </span>
        </div>
      )}
      {loaded && lookup.mediaId === null && (
        <p className="text-zinc-600">Файл не из медиатеки (внешняя картинка) — подпись сохранится только в тексте.</p>
      )}
    </div>
  );
}

function ToolbarButton({ active, onClick, children, title }: { active?: boolean; onClick: () => void; children: React.ReactNode; title: string }) {
  return (
    <button
      type="button"
      title={title}
      onMouseDown={(e) => e.preventDefault()}
      onClick={onClick}
      className={`rounded px-2.5 py-1.5 text-xs font-semibold ${active ? 'bg-orange-500 text-zinc-950' : 'text-zinc-400 hover:bg-zinc-800 hover:text-zinc-200'}`}
    >
      {children}
    </button>
  );
}

function Toolbar({
  editor,
  onImportedMeta,
  importFields,
}: {
  editor: Editor;
  onImportedMeta?: (meta: { title: string | null; thesis: string | null }) => void;
  importFields?: { title: string; thesis: string };
}) {
  const fileRef = useRef<HTMLInputElement>(null);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [mdImportOpen, setMdImportOpen] = useState(false);
  const [uploadBusy, setUploadBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const insertImage = (src: string, alt = '') => {
    editor.chain().focus().setImage({ src, alt }).run();
  };

  // загрузка с компьютера → медиатека (автопережатие sharp на сервере) → вставка в текст
  const uploadImage = async (file: File) => {
    setUploadBusy(true);
    setErr(null);
    try {
      const url = await uploadImageToMedia(file);
      insertImage(url);
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'Ошибка загрузки');
    } finally {
      setUploadBusy(false);
      if (fileRef.current) fileRef.current.value = '';
    }
  };

  const setLink = () => {
    const previous = editor.getAttributes('link').href as string | undefined;
    const url = window.prompt('URL ссылки:', previous ?? 'https://');
    if (url === null) return;
    if (url === '') {
      editor.chain().focus().unsetLink().run();
      return;
    }
    editor.chain().focus().setLink({ href: url }).run();
  };
  const addImage = () => {
    const url = window.prompt('URL картинки:', 'https://');
    if (url) editor.chain().focus().setImage({ src: url }).run();
  };

  return (
    <div className="flex flex-wrap items-center gap-1 border-b border-zinc-800 bg-zinc-900 px-2 py-1.5">
      <input
        ref={fileRef}
        type="file"
        accept="image/jpeg,image/png,image/webp"
        className="hidden"
        onChange={(e) => e.target.files?.[0] && void uploadImage(e.target.files[0])}
      />
      {err && <span className="mr-1 text-xs text-red-400">{err}</span>}
      <ToolbarButton title="Заголовок H2" active={editor.isActive('heading', { level: 2 })} onClick={() => editor.chain().focus().toggleHeading({ level: 2 }).run()}>H2</ToolbarButton>
      <ToolbarButton title="Заголовок H3" active={editor.isActive('heading', { level: 3 })} onClick={() => editor.chain().focus().toggleHeading({ level: 3 }).run()}>H3</ToolbarButton>
      <span className="mx-1 h-4 w-px bg-zinc-700" />
      <ToolbarButton title="Жирный" active={editor.isActive('bold')} onClick={() => editor.chain().focus().toggleBold().run()}><strong>B</strong></ToolbarButton>
      <ToolbarButton title="Курсив" active={editor.isActive('italic')} onClick={() => editor.chain().focus().toggleItalic().run()}><em>I</em></ToolbarButton>
      <span className="mx-1 h-4 w-px bg-zinc-700" />
      <ToolbarButton title="Маркированный список" active={editor.isActive('bulletList')} onClick={() => editor.chain().focus().toggleBulletList().run()}>• Список</ToolbarButton>
      <ToolbarButton title="Нумерованный список" active={editor.isActive('orderedList')} onClick={() => editor.chain().focus().toggleOrderedList().run()}>1. Список</ToolbarButton>
      <ToolbarButton title="Цитата" active={editor.isActive('blockquote')} onClick={() => editor.chain().focus().toggleBlockquote().run()}>❝ Цитата</ToolbarButton>
      <span className="mx-1 h-4 w-px bg-zinc-700" />
      <ToolbarButton title="Вставить ссылку" active={editor.isActive('link')} onClick={setLink}>🔗</ToolbarButton>
      <ToolbarButton title="Загрузить картинку с компьютера" onClick={() => fileRef.current?.click()}>{uploadBusy ? '…' : '📤'}</ToolbarButton>
      <ToolbarButton title="Выбрать картинку из медиатеки" onClick={() => setPickerOpen(true)}>🗂</ToolbarButton>
      <ToolbarButton title="Вставить картинку по URL" onClick={addImage}>🖼</ToolbarButton>
      <span className="mx-1 h-4 w-px bg-zinc-700" />
      <ToolbarButton title="Импорт Markdown (ТЗ-16): MD с картинками base64 → текст + медиатека" onClick={() => setMdImportOpen(true)}>⬇ MD</ToolbarButton>
      <span className="mx-1 h-4 w-px bg-zinc-700" />
      <ToolbarButton title="Отменить" onClick={() => editor.chain().focus().undo().run()}>↩</ToolbarButton>
      <ToolbarButton title="Повторить" onClick={() => editor.chain().focus().redo().run()}>↪</ToolbarButton>
      {mdImportOpen && (
        <MdImportModal
          docEmpty={editor.getText().trim() === ''}
          currentTitle={importFields?.title ?? ''}
          currentThesis={importFields?.thesis ?? ''}
          onClose={() => setMdImportOpen(false)}
          onApply={(html) => editor.commands.setContent(html, { emitUpdate: true })}
          onMeta={({ title, thesis, useTitle, useThesis }) => {
            if (onImportedMeta && useTitle) onImportedMeta({ title, thesis: useThesis ? thesis : null });
            else if (onImportedMeta && useThesis) onImportedMeta({ title: null, thesis });
          }}
        />
      )}
      {pickerOpen && (
        <MediaPickerModal
          onClose={() => setPickerOpen(false)}
          onPick={(m) => {
            const src = m.filePath.startsWith('/') ? `${window.location.origin}${m.filePath}` : m.filePath;
            insertImage(src, m.alt ?? '');
            setPickerOpen(false);
          }}
        />
      )}
    </div>
  );
}

interface MediaItem { id: number; filePath: string; alt: string | null }

/** Модалка выбора картинки из медиатеки (GET /media, admin). */
function MediaPickerModal({ onPick, onClose }: { onPick: (m: MediaItem) => void; onClose: () => void }) {
  const [items, setItems] = useState<MediaItem[]>([]);
  const [err, setErr] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const token = localStorage.getItem('token');
    fetch('/api/media', { headers: token ? { Authorization: `Bearer ${token}` } : {} })
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error(`API ${r.status}`))))
      .then((d: { media: MediaItem[] }) => setItems(d.media ?? []))
      .catch((e) => setErr(e instanceof Error ? e.message : 'Ошибка загрузки'))
      .finally(() => setLoading(false));
  }, []);

  const src = (m: MediaItem) => (m.filePath.startsWith('/') ? `${window.location.origin}${m.filePath}` : m.filePath);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4" onClick={onClose}>
      <div className="max-h-[80vh] w-full max-w-3xl overflow-y-auto rounded-xl border border-zinc-700 bg-zinc-950 p-4" onClick={(e) => e.stopPropagation()}>
        <div className="mb-3 flex items-center justify-between">
          <h3 className="font-semibold">Медиатека — нажмите, чтобы вставить</h3>
          <button type="button" className="btn-secondary" onClick={onClose}>Закрыть</button>
        </div>
        {loading && <p className="text-sm text-zinc-500">Загрузка…</p>}
        {err && <p className="text-sm text-red-400">{err}</p>}
        {!loading && !err && items.length === 0 && <p className="text-sm text-zinc-500">Пусто — загрузите картинку кнопкой 📤 или в разделе «Медиатека».</p>}
        <div className="grid grid-cols-4 gap-2 sm:grid-cols-6">
          {items.map((m) => (
            <button key={m.id} type="button" title={m.alt || m.filePath} onClick={() => onPick(m)} className="group relative overflow-hidden rounded-lg border border-zinc-800 hover:border-[#beff00]/60">
              <img src={src(m)} alt={m.alt ?? ''} loading="lazy" className="aspect-square w-full object-cover" />
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
