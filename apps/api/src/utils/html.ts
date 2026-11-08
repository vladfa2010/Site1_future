/**
 * Экранирование и текстовые утилиты серверного bot-рендера (ТЗ-10).
 *
 * botRender индексируется поисковиками — ЛЮБАЯ строка из БД проходит через
 * escapeHtml/escapeAttr/escapeXml до попадания в HTML/XML. XSS здесь =
 * катастрофа (инъекция в страницу, которую гуглит весь рунет).
 */

/** Экранирование текстовых нод HTML: & < > " ' */
export function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

/** Экранирование значений атрибутов в двойных кавычках (полное покрытие escapeHtml) */
export const escapeAttr = escapeHtml;

/** Экранирование для XML (sitemap) — то же множество опасных символов */
export const escapeXml = escapeHtml;

/**
 * htmlToText: contentHtml → массив абзацев plain text, максимум maxWords слов
 * суммарно (абзацы сохранены — ТЗ-10 §6.2 «абзацы сохранены»).
 * Блоки режем по закрывающим тегам блочных элементов и <br>, внутри —
 * stripHtml (теги → пробелы, схлопывание \s+, HTML-сущности НЕ декодируются,
 * как в каноническом stripHtml из @newinvest/db/text-utils).
 */
export function htmlToText(html: string, maxWords: number): string[] {
  const blocks = html
    .split(/<\/(?:p|div|li|h[1-6]|blockquote|tr)>/i)
    .flatMap((b) => b.split(/<br\s*\/?>/i))
    .map((b) => b.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim())
    .filter(Boolean);

  const paragraphs: string[] = [];
  let used = 0;
  for (const block of blocks) {
    if (used >= maxWords) break;
    const words = block.split(/\s+/).filter(Boolean);
    const take = words.slice(0, maxWords - used);
    used += take.length;
    paragraphs.push(take.join(' '));
  }
  return paragraphs;
}

/** Первые n символов текста (для description-фолбэка ~160) */
export function truncateChars(s: string, n: number): string {
  return s.length <= n ? s : s.slice(0, n - 1).trimEnd() + '…';
}

/**
 * Приведение пути/URL к абсолютному: http(s) — как есть, путь с / — origin + path.
 * Прочие схемы (javascript:, data:) — НЕ допускаются никогда: возвращаем null
 * (bot-шаблон просто не рендерит такой og:image/href — принцип «пустые секции
 * не рендерятся», раздел 4.3).
 */
export function absoluteUrl(maybeUrl: string, origin: string): string | null {
  if (/^https?:\/\//i.test(maybeUrl)) return maybeUrl;
  if (maybeUrl.startsWith('/')) return origin.replace(/\/$/, '') + maybeUrl;
  return null;
}

/**
 * Сегмент пути для sitemap: латиница/цифры/дефис — как есть, остальные символы
 * (напр. кириллические «о» в slug мигрированных статей) — percent-encoding
 * (ревью v2.1 №4: юникодные slug — транслитерация ИЛИ исключение; выбран
 * percent-encoding — без потери соответствия реальному slug в БД).
 */
export function encodePathSegment(segment: string): string {
  return segment
    .split('')
    .map((ch) => (/^[a-zA-Z0-9-]$/.test(ch) ? ch : encodeURIComponent(ch)))
    .join('');
}

/** Формат даты для <lastmod> (W3C Datetime, без миллисекунд, с TZ).
 *  pg возвращает timestamp строкой — принимаем Date | string */
export function toW3CDate(d: Date | string): string {
  const dt = typeof d === 'string' ? new Date(d) : d;
  return dt.toISOString().replace(/\.\d{3}Z$/, 'Z');
}

/** Русская дата для <body> (8 ноября 2026) */
export function formatRuDate(d: Date): string {
  const months = ['января', 'февраля', 'марта', 'апреля', 'мая', 'июня',
    'июля', 'августа', 'сентября', 'октября', 'ноября', 'декабря'];
  return `${d.getUTCDate()} ${months[d.getUTCMonth()]} ${d.getUTCFullYear()}`;
}
