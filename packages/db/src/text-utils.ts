/**
 * Канонические текстовые утилиты (ТЗ-09).
 * stripHtml: теги → пробелы, схлопывание \s+, trim.
 * HTML-сущности НЕ декодируются (решение ТЗ R1): &nbsp; останется литеральным текстом.
 * Файл чистый (без pg/dotenv) — безопасен для браузерного бандла через
 * сабпас-экспорт '@newinvest/db/text-utils'.
 */

/** stripHtml: теги → пробелы, схлопывание \s+, trim. */
export function stripHtml(html: string): string {
  return html.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
}

/** Количество слов: split по \s+ с отбрасыванием пустых. */
export function countWords(text: string): number {
  return text.split(/\s+/).filter(Boolean).length;
}

/**
 * Время чтения в минутах: max(1, round(words / wpm)).
 * wpm по умолчанию 170 (правка ревью v2.1: инвест-аудитория, плотные термины).
 */
export function calcReadingTime(contentHtml: string, wpm = 170): number {
  return Math.max(1, Math.round(countWords(stripHtml(contentHtml)) / wpm));
}
