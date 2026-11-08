/**
 * Список User-Agent паттернов ботов (ТЗ-10 §6.1 шаг 2).
 *
 * Единый источник истины: тот же набор паттернов дублируется в infra/Caddyfile
 * (header_regexp в @bots) — ВАЖНО править синхронно. Регистронезависимость — (?i).
 * Правка ревью v2.1 №6: добавлены RU-боты seznambot, Mail.RU_Bot, exabot.
 *
 * В API используется ТОЛЬКО для логирования/классификации (доступ решает
 * заголовок X-Bot-Render, а не UA — §6.1 «UA-детект внутри API»).
 */

/**
 * Строка альтернатив (без флага регистронезависимости) — единый источник.
 * JS-регексп ниже добавляет флаг 'i'; в Caddyfile паттерн вставляется с (?i).
 */
export const BOT_UA_ALTERNATIVES =
  '(googlebot|google-inspectiontool|bingbot|yandex(bot|accessibility|images|metrika|video)|duckduckbot|slurp|baiduspider|applebot|telegrambot|vkshare|facebookexternalhit|twitterbot|linkedinbot|whatsapp|discordbot|pinterestbot|redditbot|bytespider|seznambot|mail\\.ru_bot|exabot)';

/**
 * Строка регекспа в Caddy/PCRE-синтаксисе БЕЗ обрамляющих /.../ —
 * копируется в Caddyfile как есть. ВАЖНО править синхронно с botUa.ts.
 */
export const BOT_UA_PATTERN_SOURCE = `(?i)${BOT_UA_ALTERNATIVES}`;

const BOT_UA_REGEX = new RegExp(BOT_UA_ALTERNATIVES, 'i');

/**
 * Класс бота по UA (имя первого совпавшего паттерна в нижнем регистре)
 * или null для «обычного» браузера. Для лога [bot-render].
 */
export function botClass(userAgent: string | undefined): string | null {
  if (!userAgent) return null;
  const m = BOT_UA_REGEX.exec(userAgent);
  if (!m) return null;
  // верхнеуровневое имя группы (yandexbot, а не yandex)
  const alt = m[0].toLowerCase();
  if (alt.startsWith('yandex')) return 'yandex';
  return alt;
}
