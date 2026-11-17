import { useEffect, useRef, useState } from 'react';
import { useEditor, EditorContent } from '@tiptap/react';
import StarterKit from '@tiptap/starter-kit';
import Image from '@tiptap/extension-image';
import { Table, TableRow, TableCell, TableHeader } from '@tiptap/extension-table';
import type { Editor } from '@tiptap/react';

/**
 * TipTap-редактор контента статьи (решение раздела 6.2).
 * Работает с HTML (content_html): открывает мигрированный контент и LLM-HTML,
 * сохраняет обратно HTML. Санитизация — на рендере сайта (web/lib/sanitize).
 *
 * Двусторонняя связка: печатает пользователь → onChange(getHTML) в родителя;
 * меняет value родитель (новый результат AI, другая статья) → подставляем в редактор.
 * Без этого контент обновлялся только когда редактор был пуст (isEmpty) —
 * в ContentMaster после фактчека статья не подменяла в редакторе старый текст.
 */
export function RichTextEditor({ value, onChange }: { value: string; onChange: (html: string) => void }) {
  const lastApplied = useRef<string | null>(null);
  const editor = useEditor({
    extensions: [
      StarterKit.configure({ heading: { levels: [2, 3, 4] } }),
      Image,
      Table.configure({ resizable: false }),
      TableRow,
      TableHeader,
      TableCell,
    ],
    content: value,
    onUpdate: ({ editor }) => {
      lastApplied.current = editor.getHTML(); // печать пользователя — не затирать из effect
      onChange(editor.getHTML());
    },
    editorProps: {
      attributes: {
        class: 'prose-invert min-h-[320px] max-w-none px-4 py-3 text-sm leading-relaxed focus:outline-none [&_h2]:mt-4 [&_h2]:text-lg [&_h2]:font-bold [&_h3]:mt-3 [&_h3]:font-bold [&_ul]:list-disc [&_ul]:pl-5 [&_ol]:list-decimal [&_ol]:pl-5 [&_blockquote]:border-l-2 [&_blockquote]:border-zinc-600 [&_blockquote]:pl-3 [&_blockquote]:italic [&_a]:text-orange-400 [&_img]:max-w-full [&_img]:rounded-lg [&_td]:border [&_td]:border-zinc-700 [&_td]:px-2 [&_td]:py-1 [&_th]:border [&_th]:border-zinc-700 [&_th]:px-2 [&_th]:py-1',
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
      <Toolbar editor={editor} />
      <EditorContent editor={editor} />
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

function Toolbar({ editor }: { editor: Editor }) {
  const fileRef = useRef<HTMLInputElement>(null);
  const [pickerOpen, setPickerOpen] = useState(false);
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
        return;
      }
      const body = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(body.message ?? JSON.stringify(body));
      insertImage(body.url, body.media?.alt ?? '');
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
      <ToolbarButton title="Отменить" onClick={() => editor.chain().focus().undo().run()}>↩</ToolbarButton>
      <ToolbarButton title="Повторить" onClick={() => editor.chain().focus().redo().run()}>↪</ToolbarButton>
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
