import { Link } from 'react-router';

export interface Crumb {
  label: string;
  to?: string;
  /**
   * Обрезка подписи для визуального вывода (только последний/безссылочный элемент):
   * label длиннее truncate символов → первые truncate символов + «…».
   * В JSON-LD уходит полный label (ТЗ-01 §4.2 — осознанное расхождение внутри
   * одной страницы), поэтому обрезка живёт здесь, а не на страницах.
   */
  truncate?: number;
}

/** Визуальная подпись: применяет truncate, если задан. */
function displayLabel(c: Crumb): string {
  if (c.truncate && c.label.length > c.truncate) return `${c.label.slice(0, c.truncate)}…`;
  return c.label;
}

/** Хлебные крошки: Главная → раздел → текущая страница */
export function Breadcrumbs({ items }: { items: Crumb[] }) {
  if (items.length === 0) return null;
  return (
    <nav aria-label="Хлебные крошки" className="mb-6 flex flex-wrap items-center gap-1.5 text-sm text-zinc-500">
      <Link to="/" className="text-zinc-500 hover:text-[#c9ff2a]">Главная</Link>
      {items.map((c, i) => (
        <span key={i} className="flex items-center gap-1.5">
          <span className="text-zinc-700">/</span>
          {c.to && i < items.length - 1 ? (
            <Link to={c.to} className="text-zinc-500 hover:text-[#c9ff2a]">{displayLabel(c)}</Link>
          ) : (
            <span className="text-zinc-300">{displayLabel(c)}</span>
          )}
        </span>
      ))}
    </nav>
  );
}
