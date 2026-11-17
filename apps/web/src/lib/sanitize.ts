/**
 * Санитизация HTML контента статей перед рендером (защита от stored XSS).
 * Аудит 2026-11-06: contentHtml пишется авторами/админами и миграцией —
 * рендерим только через sanitizeHtml с жёстким allowlist.
 */
import sanitizeHtml from 'sanitize-html';

const OPTIONS: sanitizeHtml.IOptions = {
  allowedTags: ['p', 'h2', 'h3', 'h4', 'ul', 'ol', 'li', 'strong', 'em', 'b', 'i', 'a', 'img', 'blockquote', 'br', 'figure', 'figcaption', 'hr',
    // таблицы (TipTap table в редакторе; без них sanitize съедал разметку, оставляя слипшийся текст)
    'table', 'thead', 'tbody', 'tfoot', 'tr', 'th', 'td', 'colgroup', 'col',
    // код/преформатированное — встречается в аналитике и LLM-HTML
    'code', 'pre'],
  allowedAttributes: {
    a: ['href', 'target'],
    img: ['src', 'alt'],
    th: ['colspan', 'rowspan'],
    td: ['colspan', 'rowspan'],
    col: ['span'],
  },
  allowedSchemes: ['http', 'https'],
  // внешние ссылки — только с noopener
  transformTags: {
    a: sanitizeHtml.simpleTransform('a', { rel: 'noopener noreferrer' }),
  },
};

export function sanitizeArticleHtml(html: string): string {
  return sanitizeHtml(html, OPTIONS);
}
