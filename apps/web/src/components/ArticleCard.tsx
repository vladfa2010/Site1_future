import { Link } from 'react-router';
import type { ArticleListItem } from '../api';

export const TYPE_LABELS: Record<string, string> = {
  novost: 'Новость',
  ideya: 'Идея',
  sobytie: 'Событие',
  analitika: 'Аналитика',
  interesnoe: 'Интересное',
};

export function ArticleCard({ article }: { article: ArticleListItem }) {
  return (
    <Link
      to={`/${article.type}/${article.slug}`}
      className="block rounded-lg border border-zinc-800 bg-zinc-900 p-4 transition-colors hover:border-orange-500/50"
    >
      <span className="text-xs uppercase tracking-wide text-zinc-500">
        {TYPE_LABELS[article.type] ?? article.type}
      </span>
      <h3 className="mt-1 font-semibold leading-snug">{article.title}</h3>
      {article.excerpt && <p className="mt-2 line-clamp-2 text-sm text-zinc-400">{article.excerpt}</p>}
    </Link>
  );
}
