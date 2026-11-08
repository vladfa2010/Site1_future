/** Общие форматтеры вывода (ТЗ-09). */

/** «5 мин чтения»; null для null — бейдж по null не рендерится. */
export function formatReadingTime(min: number | null): string | null {
  return min == null ? null : `${min} мин чтения`;
}
