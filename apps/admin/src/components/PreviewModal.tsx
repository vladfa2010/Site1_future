import { useMemo, useState } from 'react';
import sanitizeHtml from 'sanitize-html';

interface Props {
  title: string;
  type: string;
  thesis: string;
  excerpt: string;
  contentHtml: string;
  coverUrl: string | null;
  onClose: () => void;
}

type Device = 'desktop' | 'tablet' | 'mobile';

const DEVICES: { id: Device; label: string; icon: string; width: number }[] = [
  { id: 'desktop', label: 'Десктоп', icon: '🖥', width: 1200 },
  { id: 'tablet', label: 'Планшет', icon: '📱', width: 768 },
  { id: 'mobile', label: 'Мобайл', icon: '📲', width: 390 },
];

const TYPE_LABELS: Record<string, string> = {
  novost: 'Новость', ideya: 'Идея', sobytie: 'Событие', analitika: 'Аналитика', interesnoe: 'Интересное',
};

/** Экранирование текста, интерполируемого в srcDoc (защита от инъекции через title/excerpt — аудит 2026-11-08) */
const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

const sanitize = (html: string) =>
  sanitizeHtml(html, {
    allowedTags: ['p', 'h2', 'h3', 'h4', 'ul', 'ol', 'li', 'strong', 'em', 'b', 'i', 'a', 'img', 'blockquote', 'br', 'figure', 'figcaption', 'hr'],
    allowedAttributes: { a: ['href', 'target', 'rel'], img: ['src', 'alt'] },
    allowedSchemes: ['http', 'https'],
  });

/** Превью статьи в виде как на сайте — рендер в iframe с шириной устройства */
export default function PreviewModal({ title, type, thesis, excerpt, contentHtml, coverUrl, onClose }: Props) {
  const [device, setDevice] = useState<Device>('desktop');
  const [zoom, setZoom] = useState(1);
  const cfg = DEVICES.find((d) => d.id === device)!;

  // srcDoc — автономный HTML в стиле сайта (чёрный + лайм)
  const doc = useMemo(() => {
    const content = sanitize(contentHtml || '<p><em>(текст статьи пуст)</em></p>');
    return `<!doctype html><html lang="ru"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<style>
  * { margin: 0; box-sizing: border-box; }
  body { background: #000; color: #e4e4e7; font-family: system-ui, -apple-system, sans-serif; padding: 24px 20px 60px; }
  .wrap { max-width: 720px; margin: 0 auto; }
  .crumbs { font-size: 12px; color: #71717a; margin-bottom: 16px; }
  .crumbs b { color: #beff00; font-weight: 500; }
  .type { font-size: 11px; text-transform: uppercase; letter-spacing: .1em; color: #71717a; }
  h1 { margin-top: 8px; font-size: 28px; line-height: 1.25; font-weight: 700; }
  .excerpt { margin-top: 12px; color: #a1a1aa; font-size: 15px; line-height: 1.55; }
  .thesis { margin-top: 16px; border-left: 4px solid #beff00; background: #191919; padding: 14px 16px; font-style: italic; color: #d4d4d8; border-radius: 0 8px 8px 0; }
  .cover { margin-top: 20px; border-radius: 12px; overflow: hidden; }
  .cover img { width: 100%; display: block; }
  .content { margin-top: 24px; line-height: 1.7; color: #d4d4d8; }
  .content p { margin-bottom: 16px; }
  .content h2 { margin: 28px 0 12px; font-size: 20px; font-weight: 700; }
  .content ul { padding-left: 24px; margin-bottom: 16px; }
  .content li { margin-bottom: 6px; }
  .content a { color: #c9ff2a; }
  .content blockquote { border-left: 3px solid #3f3f46; padding-left: 14px; color: #a1a1aa; margin: 16px 0; }
  .content img { max-width: 100%; border-radius: 8px; }
</style></head><body><div class="wrap">
<nav class="crumbs">Лента › <b>${TYPE_LABELS[type] ?? type}</b> › ${esc(title.slice(0, 40))}</nav>
<div class="type">${TYPE_LABELS[type] ?? type}</div>
<h1>${esc(title) || '(без заголовка)'}</h1>
${excerpt ? `<p class="excerpt">${esc(excerpt)}</p>` : ''}
${thesis ? `<div class="thesis">${esc(thesis)}</div>` : ''}
${coverUrl && /^https?:\/\//i.test(coverUrl) ? `<div class="cover"><img src="${esc(coverUrl)}" alt=""></div>` : ''}
<div class="content">${content}</div>
</div></body></html>`;
  }, [title, type, thesis, excerpt, contentHtml, coverUrl]);

  return (
    <div className="fixed inset-0 z-50 flex flex-col bg-zinc-950/95 backdrop-blur-sm" onClick={onClose}>
      {/* Панель управления */}
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-zinc-800 bg-zinc-900 px-4 py-3" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center gap-2">
          <span className="text-sm font-semibold text-zinc-300">Превью:</span>
          {DEVICES.map((d) => (
            <button
              key={d.id}
              onClick={() => setDevice(d.id)}
              className={`rounded-lg px-3 py-1.5 text-sm transition-colors ${device === d.id ? 'bg-[#beff00] font-semibold text-zinc-950' : 'bg-zinc-800 text-zinc-400 hover:text-zinc-200'}`}
            >
              {d.icon} {d.label}
            </button>
          ))}
        </div>
        <div className="flex items-center gap-3">
          <label className="flex items-center gap-2 text-xs text-zinc-400">
            Масштаб
            <input type="range" min={40} max={100} value={zoom * 100} onChange={(e) => setZoom(Number(e.target.value) / 100)} className="w-24" />
            <span className="w-9 tabular-nums">{Math.round(zoom * 100)}%</span>
          </label>
          <span className="text-xs text-zinc-500">{cfg.width}px</span>
          <button onClick={onClose} className="rounded-lg bg-zinc-800 px-3 py-1.5 text-sm text-zinc-300 hover:bg-zinc-700">✕ Закрыть</button>
        </div>
      </div>

      {/* Viewport */}
      <div className="flex flex-1 items-start justify-center overflow-auto p-6" onClick={(e) => e.stopPropagation()}>
        <div
          className="overflow-hidden rounded-xl border border-zinc-700 bg-black shadow-2xl transition-all"
          style={{ width: cfg.width, transform: `scale(${zoom})`, transformOrigin: 'top center' }}
        >
          <div className="flex items-center gap-2 border-b border-zinc-800 bg-zinc-900 px-3 py-2">
            <span className="h-2.5 w-2.5 rounded-full bg-red-500/70" />
            <span className="h-2.5 w-2.5 rounded-full bg-yellow-500/70" />
            <span className="h-2.5 w-2.5 rounded-full bg-green-500/70" />
            <span className="ml-3 flex-1 truncate rounded-md bg-zinc-800 px-3 py-0.5 text-xs text-zinc-500">
              инвестиционно.рф/{type}/{title ? '…' : ''}
            </span>
          </div>
          <iframe
            title="preview"
            srcDoc={doc}
            sandbox=""
            style={{ width: cfg.width, height: '70vh', border: 0, display: 'block' }}
          />
        </div>
      </div>
    </div>
  );
}
