/**
 * Шеринг материалов (ТЗ-02): whitelist каналов, построение шаринг-URL, UTM-метки.
 * Чистые функции без React. Каналы совпадают с бэкенд-маппингом ТЗ-04
 * (каналы вне whitelist бэкенд записывает как 'unknown' — клиент их не шлёт).
 */

export const SHARE_CHANNELS = ['telegram', 'vk', 'whatsapp', 'copylink', 'native_share'] as const;
export type ShareChannel = (typeof SHARE_CHANNELS)[number];

/** Каналы с готовым URL шаринга (для них строится внешний link). */
export type PopupShareChannel = Extract<ShareChannel, 'telegram' | 'vk' | 'whatsapp'>;

/**
 * Canonical URL текущей страницы: origin + pathname, без ?query и #hash
 * (решение ТЗ: бэкенд canonical не отдаёт, UTM-засорённый URL вкладки не берём).
 */
export function buildCanonicalUrl(): string {
  return window.location.origin + window.location.pathname;
}

/**
 * Добавляет UTM-метки к URL через URLSearchParams (не конкатенацией строк):
 * utm_source={source}&utm_medium=share&utm_campaign=article_share[&utm_content={type}].
 * type (тип статьи → utm_content) опционален.
 */
export function withUtm(url: string, source: string, type?: string): string {
  const u = new URL(url);
  u.searchParams.set('utm_source', source);
  u.searchParams.set('utm_medium', 'share');
  u.searchParams.set('utm_campaign', 'article_share');
  if (type) u.searchParams.set('utm_content', type);
  return u.toString();
}

/**
 * Готовый URL шаринга. url — уже с UTM (вызывающий код прогоняет canonical
 * через withUtm), title кодируется один раз через URLSearchParams.
 * telegram → https://t.me/share/url?url=&text=; vk → https://vk.com/share.php?url=&title=;
 * whatsapp → https://wa.me/?text={title} {url} (одним параметром).
 */
export function buildShareLink(channel: PopupShareChannel, url: string, title: string): string {
  if (channel === 'telegram') {
    const q = new URLSearchParams({ url, text: title });
    return `https://t.me/share/url?${q.toString()}`;
  }
  if (channel === 'vk') {
    const q = new URLSearchParams({ url, title });
    return `https://vk.com/share.php?${q.toString()}`;
  }
  const q = new URLSearchParams({ text: `${title} ${url}` });
  return `https://wa.me/?${q.toString()}`;
}
