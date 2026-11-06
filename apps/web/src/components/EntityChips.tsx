import { Link } from 'react-router';
import type { ArticleRelations } from '../api';

/**
 * Чипсы-сущности — точки «проваливания» из любой точки (раздел 4.2).
 * Рендерятся только если привязки есть (принцип 4.3).
 */
export function EntityChips({ relations }: { relations: ArticleRelations }) {
  const hasAny = relations.companies.length > 0 || relations.trends.length > 0;
  if (!hasAny) return null;
  return (
    <div className="flex flex-wrap gap-2">
      {relations.companies.map((c) => (
        <Link
          key={c.slug}
          to={`/kompaniya/${c.slug}`}
          className="rounded-full border border-zinc-700 px-3 py-1 text-sm text-zinc-300 hover:border-orange-500"
        >
          🏢 {c.name}
        </Link>
      ))}
      {relations.trends.map((t) => (
        <Link
          key={t.slug}
          to={`/trend/${t.slug}`}
          className="rounded-full border border-zinc-700 px-3 py-1 text-sm text-zinc-300 hover:border-orange-500"
        >
          📈 {t.name}
        </Link>
      ))}
    </div>
  );
}
