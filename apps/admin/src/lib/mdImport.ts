/**
 * ТЗ-16: импорт Markdown → HTML для TipTap-редактора.
 *
 * Конвертация markdown-it (таблицы, списки, код), извлечение H1 → заголовок
 * статьи и первого абзаца → тезис, нормализация картинок: data-URI
 * декодируются и загружаются в медиатеку (POST /api/media/upload — тот же
 * пайплайн, что у кнопки загрузки; sharp на сервере жмёт в webp), src
 * заменяется на /uploads/…. base64 — формат передачи, не хранения
 * (см. docs/tz-md-import.md).
 */
import MarkdownIt from 'markdown-it';

const MAX_TEXT_BYTES = 2 * 1024 * 1024;
const MAX_IMAGE_BYTES = 10 * 1024 * 1024;

export interface MdImportResult {
  html: string;
  /** первый H1 — кандидат в заголовок статьи */
  title: string | null;
  /** первый абзац после H1 (≤300 символов) — кандидат в тезис */
  thesis: string | null;
  /** data-URI картинки, ставшие файлами медиатеки */
  uploadedImages: number;
  /** сколько картинок остались data-URI (не загрузились) */
  failedImages: number;
  /** img с внешним http(s) — остаются ссылками (вне скоупа ТЗ-16) */
  externalImages: number;
  /** front matter в начале файла — v1 не поддерживаем, только предупреждаем */
  frontMatter: boolean;
  sections: number;
  tables: number;
  /** сноски [^id] → концевые «Источники и примечания» */
  footnotes: number;
}

export interface MdImportPreview {
  ok: boolean;
  error?: string;
  title: string | null;
  sections: number;
  images: number;
  base64Images: number;
  externalImages: number;
  tables: number;
  frontMatter: boolean;
  /** чекбоксы «заменить заголовок/тезис» доступны, только если поле пусто */
  textTooBig: boolean;
  footnoteDefs: number;
}

const md = new MarkdownIt({
  html: false, // HTML внутри MD экранируется — XSS-слой 1
  linkify: true,
  breaks: false,
  typographer: false,
});

/** размер строки в байтах (utf8) */
const byteLength = (s: string) => new TextEncoder().encode(s).length;

/** вытащить первый `# …` и первый абзац после него из сырого MD */
function extractTitleAndThesis(markdown: string): { title: string | null; thesis: string | null; body: string } {
  const lines = markdown.split('\n');
  let h1Idx = -1;
  for (let i = 0; i < lines.length; i++) {
    const m = lines[i].match(/^#\s+(.+?)\s*#*\s*$/);
    if (m) {
      h1Idx = i;
      break;
    }
    if (lines[i].trim() !== '' && !lines[i].startsWith('---')) break; // H1 не на первом месте — не трогаем
  }
  if (h1Idx === -1) return { title: null, thesis: null, body: markdown };
  const title = lines[h1Idx].replace(/^#\s+/, '').replace(/\s*#+\s*$/, '').trim();
  // первый непустой строка-параграф после H1
  let thesis: string | null = null;
  const rest = lines.slice(h1Idx + 1);
  const para: string[] = [];
  for (const line of rest) {
    if (line.trim() === '') {
      if (para.length > 0) break;
      continue;
    }
    if (/^#{1,6}\s/.test(line) || /^\s*([-*+]|\d+\.)\s/.test(line) || /^\s*(```|\|)/.test(line)) break;
    para.push(line.trim());
  }
  if (para.length > 0) {
    thesis = para.join(' ').slice(0, 300);
  }
  // тело — без строки H1 (H1 живёт в поле заголовка статьи, а не в content_html)
  const body = [...lines.slice(0, h1Idx), ...rest].join('\n');
  return { title, thesis, body };
}

function detectFrontMatter(markdown: string): boolean {
  return /^---\r?\n[\s\S]*?\r?\n---\r?\n/.test(markdown);
}

const FN_DEF_RE = /^\[\^([^\]]+)\]:\s*(.+?)\s*$/;

/**
 * Сноски CommonMark: определения `[^id]: текст` вырезаем из тела (не рендерятся
 * как абзацы), инлайн-ссылки `[^id]` после рендера заменяет renderFootnotes.
 * Многострочные определения не поддерживаем (поставщики шлют однострочные).
 */
export function extractFootnoteDefs(markdown: string): { body: string; defs: Map<string, string> } {
  const defs = new Map<string, string>();
  const kept: string[] = [];
  for (const line of markdown.split('\n')) {
    const m = line.match(FN_DEF_RE);
    if (m) {
      if (!defs.has(m[1])) defs.set(m[1], m[2]);
      continue;
    }
    kept.push(line);
  }
  // схлопываем хвостовые пустые строки, оставшиеся после вырезанного блока
  while (kept.length > 0 && kept[kept.length - 1].trim() === '') kept.pop();
  return { body: kept.join('\n'), defs };
}

/** заменить инлайн `[^id]` на текстовый номер [N] и дописать концевой список
 * «Источники и примечания». Теги sup/a/li[id] НЕ используем: TipTap (без
 * расширений) и sanitize при рендере сайта их всё равно съедают — честный
 * текстовый номер проходит пайплайн как есть (тимлид-ревью agent-68). */
export function renderFootnotes(html: string, defs: Map<string, string>): { html: string; used: number } {
  if (defs.size === 0) return { html, used: 0 };
  const numById = new Map<string, number>();
  const html2 = html.replace(/\[\^([^\]]+)\]/g, (whole, id: string) => {
    if (!defs.has(id)) return whole; // ссылка без определения — оставляем как есть
    if (!numById.has(id)) numById.set(id, numById.size + 1);
    return `[${numById.get(id)!}]`;
  });
  if (numById.size === 0) return { html: html2, used: 0 };
  const items = [...numById.entries()]
    .map(([id]) => `<li>${md.renderInline(defs.get(id)!)}</li>`)
    .join('');
  return {
    html: html2 + `<h2>Источники и примечания</h2><ol>${items}</ol>`,
    used: numById.size,
  };
}

/** превью для модала: статистика до подтверждения импорта */
export function previewMd(markdown: string): MdImportPreview {
  const textTooBig = byteLength(markdown) > MAX_TEXT_BYTES;
  const base = {
    ok: !textTooBig,
    textTooBig,
    title: null as string | null,
    sections: 0,
    images: 0,
    base64Images: 0,
    externalImages: 0,
    tables: 0,
    frontMatter: detectFrontMatter(markdown),
    footnoteDefs: 0,
  };
  if (textTooBig) {
    return { ...base, error: `Файл больше 2 МБ (${Math.round(byteLength(markdown) / 1024)} КБ). Разбейте на части.` };
  }
  const { title, body } = extractTitleAndThesis(markdown);
  base.title = title;
  const { body: bodyNoFns, defs } = extractFootnoteDefs(body);
  base.footnoteDefs = defs.size;
  base.sections = (bodyNoFns.match(/^#{2,6}\s/gm) || []).length;
  const imgRe = /!\[[^\]]*\]\([^)]+\)/g;
  const imgs = bodyNoFns.match(imgRe) || [];
  base.images = imgs.length;
  base.base64Images = imgs.filter((i) => i.includes('data:image')).length;
  base.externalImages = imgs.filter((i) => /!\[[^\]]*\]\(https?:\/\//.test(i)).length;
  // таблицы: строки с | подряд
  base.tables = (bodyNoFns.match(/^\|.+\|\s*$/gm) || []).length >= 2 ? (bodyNoFns.match(/^\|[\s:|-]+\|\s*$/gm) || []).length : 0;
  return base;
}

async function uploadImage(dataUri: string): Promise<string | null> {
  const m = dataUri.match(/^data:image\/([a-z0-9.+-]+);base64,(.+)$/i);
  if (!m) return null;
  const bytes = Uint8Array.from(atob(m[2]), (c) => c.charCodeAt(0));
  if (bytes.length > MAX_IMAGE_BYTES) return null;
  const ext = m[1].toLowerCase().replace('jpeg', 'jpg');
  const blob = new Blob([bytes], { type: `image/${m[1]}` });
  const fd = new FormData();
  fd.append('file', new File([blob], `import.${ext}`, { type: blob.type }));
  const token = localStorage.getItem('token');
  const res = await fetch('/api/media/upload', {
    method: 'POST',
    headers: token ? { Authorization: `Bearer ${token}` } : {},
    body: fd,
  });
  if (res.status === 401 && token) {
    localStorage.removeItem('token');
    window.location.href = '/login';
    return null;
  }
  if (!res.ok) return null;
  const data = (await res.json()) as { filePath?: string; url?: string };
  return data.filePath ?? data.url ?? null;
}

/**
 * Полный импорт: конвертация + выгрузка картинок + замена src.
 * Возвращает HTML готовый для editor.commands.setContent.
 */
export async function importMarkdown(markdown: string): Promise<MdImportResult> {
  const { title, thesis, body } = extractTitleAndThesis(markdown);
  const frontMatter = detectFrontMatter(markdown);
  // сноски: определения вырезаем ДО рендера, ссылки заменяем ПОСЛЕ
  const { body: bodyNoFns, defs } = extractFootnoteDefs(body);
  let html = md.render(bodyNoFns);

  const doc = new DOMParser().parseFromString(`<div>${html}</div>`, 'text/html');
  const root = doc.body.firstElementChild as HTMLElement;

  let uploadedImages = 0;
  let failedImages = 0;
  let externalImages = 0;

  const imgs = [...root.querySelectorAll('img')];
  for (const img of imgs) {
    const src = img.getAttribute('src') ?? '';
    if (src.startsWith('data:image')) {
      // последовательно: одна за раз, падение не роняет остальные (ТЗ-16 §3.2)
      try {
        const url = await uploadImage(src);
        if (url) {
          img.setAttribute('src', url);
          uploadedImages++;
        } else {
          failedImages++;
        }
      } catch {
        failedImages++;
      }
    } else if (/^https?:\/\//.test(src)) {
      externalImages++;
    }
  }

  html = root.innerHTML;
  const foot = renderFootnotes(html, defs);
  html = foot.html;
  return {
    html,
    title,
    thesis,
    uploadedImages,
    failedImages,
    externalImages,
    frontMatter,
    sections: (bodyNoFns.match(/^#{2,6}\s/gm) || []).length,
    tables: (bodyNoFns.match(/^\|[\s:|-]+\|\s*$/gm) || []).length,
    footnotes: foot.used,
  };
}
