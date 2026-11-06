import { Link } from 'react-router';

export interface Crumb {
  label: string;
  to?: string;
}

/** Хлебные крошки: Главная → раздел → текущая страница */
export function Breadcrumbs({ items }: { items: Crumb[] }) {
  if (items.length === 0) return null;
  return (
    <nav aria-label="Хлебные крошки" className="mb-6 flex flex-wrap items-center gap-1.5 text-sm text-zinc-500">
      <Link to="/" className="text-zinc-500 hover:text-orange-400">Главная</Link>
      {items.map((c, i) => (
        <span key={i} className="flex items-center gap-1.5">
          <span className="text-zinc-700">/</span>
          {c.to && i < items.length - 1 ? (
            <Link to={c.to} className="text-zinc-500 hover:text-orange-400">{c.label}</Link>
          ) : (
            <span className="text-zinc-300">{c.label}</span>
          )}
        </span>
      ))}
    </nav>
  );
}
