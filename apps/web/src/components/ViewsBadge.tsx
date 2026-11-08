import { formatViews } from '../lib/format';

/** Инлайн SVG-иконка глаза (stroke текущего цвета). */
function EyeIcon({ className = 'h-3.5 w-3.5' }: { className?: string }) {
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
      <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" />
      <circle cx="12" cy="12" r="3" />
    </svg>
  );
}

/**
 * Бейдж «N просмотров» (ТЗ-03). views undefined/null → не рендерится
 * (аккуратная деградация: эндпоинт без viewsCount не ломает карточку).
 */
export function ViewsBadge({
  views,
  className = 'text-xs text-zinc-600',
  iconClassName = 'h-3.5 w-3.5',
}: {
  views: number | undefined | null;
  className?: string;
  iconClassName?: string;
}) {
  if (views == null) return null;
  return (
    <span className={`inline-flex items-center gap-1 ${className}`}>
      <EyeIcon className={iconClassName} />
      {formatViews(views)}
    </span>
  );
}
