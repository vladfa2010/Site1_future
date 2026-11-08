import { formatReadingTime } from '../lib/format';

/** Инлайн SVG-иконка часов (stroke текущего цвета). */
function ClockIcon({ className = 'h-3.5 w-3.5' }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
      aria-hidden="true"
    >
      <circle cx="12" cy="12" r="10" />
      <polyline points="12 6 12 12 16 14" />
    </svg>
  );
}

/**
 * Бейдж «N мин чтения» (ТЗ-09). minutes = null → не рендерится (аккуратная деградация).
 * Используется на странице материала и в карточках ArticleCard/NewsCard/IdeaCard.
 */
export function ReadingTimeBadge({
  minutes,
  className = 'text-xs text-zinc-600',
  iconClassName = 'h-3.5 w-3.5',
}: {
  minutes: number | null;
  className?: string;
  iconClassName?: string;
}) {
  if (minutes == null) return null;
  return (
    <span className={`inline-flex items-center gap-1 ${className}`}>
      <ClockIcon className={iconClassName} />
      {formatReadingTime(minutes)}
    </span>
  );
}
