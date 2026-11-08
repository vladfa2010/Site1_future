/** Общие форматтеры вывода (ТЗ-09, ТЗ-03). */

/** «5 мин чтения»; null для null — бейдж по null не рендерится. */
export function formatReadingTime(min: number | null): string | null {
  return min == null ? null : `${min} мин чтения`;
}

/**
 * Форматирование счётчика просмотров (ТЗ-03, R1.3):
 * < 1000 — как есть; ≥ 1000 — floor до 1 десятичной + суффикс k.
 * 999 → '999', 1000 → '1.0k', 1250 → '1.2k', 9999 → '9.9k', 580000 → '580k'.
 * (floor, не round — правка ревью v2.1 №8)
 */
export function formatViews(n: number): string {
  if (n < 1000) return String(n);
  return `${Math.floor(n / 100) / 10}k`;
}
