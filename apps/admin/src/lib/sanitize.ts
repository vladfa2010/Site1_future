/**
 * Санитизация HTML перед вставкой в DOM админки (защита от stored XSS).
 *
 * Аудит 2026-11-14: предпросмотр ContentMaster чистил HTML регулярками и вставлял
 * через dangerouslySetInnerHTML — обходился (<svg onload=...>, onerror без кавычек,
 * java&#x73;cript:), а источником HTML является вывод LLM, отравляемый через
 * выкачиваемую страницу (prompt-injection). Регулярки для HTML запрещены:
 * только sanitize-html с жёстким allowlist, идентичным сайтовому
 * (apps/web/src/lib/sanitize.ts).
 */
import sanitizeHtml from 'sanitize-html';

const OPTIONS: sanitizeHtml.IOptions = {
  allowedTags: ['p', 'h2', 'h3', 'h4', 'ul', 'ol', 'li', 'strong', 'em', 'b', 'i', 'a', 'img', 'blockquote', 'br', 'figure', 'figcaption', 'hr'],
  allowedAttributes: {
    a: ['href', 'target'],
    img: ['src', 'alt'],
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
