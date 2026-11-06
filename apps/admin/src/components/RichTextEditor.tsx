import { useEffect } from 'react';
import { useEditor, EditorContent } from '@tiptap/react';
import StarterKit from '@tiptap/starter-kit';
import Image from '@tiptap/extension-image';
import { Table, TableRow, TableCell, TableHeader } from '@tiptap/extension-table';
import type { Editor } from '@tiptap/react';

/**
 * TipTap-редактор контента статьи (решение раздела 6.2).
 * Работает с HTML (content_html): открывает мигрированный контент и LLM-HTML,
 * сохраняет обратно HTML. Санитизация — на рендере сайта (web/lib/sanitize).
 */
export function RichTextEditor({ value, onChange }: { value: string; onChange: (html: string) => void }) {
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
    onUpdate: ({ editor }) => onChange(editor.getHTML()),
    editorProps: {
      attributes: {
        class: 'prose-invert min-h-[320px] max-w-none px-4 py-3 text-sm leading-relaxed focus:outline-none [&_h2]:mt-4 [&_h2]:text-lg [&_h2]:font-bold [&_h3]:mt-3 [&_h3]:font-bold [&_ul]:list-disc [&_ul]:pl-5 [&_ol]:list-decimal [&_ol]:pl-5 [&_blockquote]:border-l-2 [&_blockquote]:border-zinc-600 [&_blockquote]:pl-3 [&_blockquote]:italic [&_a]:text-orange-400 [&_img]:max-w-full [&_img]:rounded-lg [&_td]:border [&_td]:border-zinc-700 [&_td]:px-2 [&_td]:py-1 [&_th]:border [&_th]:border-zinc-700 [&_th]:px-2 [&_th]:py-1',
      },
    },
  });

  // при загрузке статьи подставляем контент
  useEffect(() => {
    if (editor && value && editor.isEmpty) {
      editor.commands.setContent(value);
    }
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
      <ToolbarButton title="Вставить картинку по URL" onClick={addImage}>🖼</ToolbarButton>
      <span className="mx-1 h-4 w-px bg-zinc-700" />
      <ToolbarButton title="Отменить" onClick={() => editor.chain().focus().undo().run()}>↩</ToolbarButton>
      <ToolbarButton title="Повторить" onClick={() => editor.chain().focus().redo().run()}>↪</ToolbarButton>
    </div>
  );
}
