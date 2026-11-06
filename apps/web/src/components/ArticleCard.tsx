import { Link } from 'react-router';
import type { ArticleListItem } from '../api';
import { CoverThumb } from './CoverThumb';
import { FavoriteButton } from './FavoriteButton';

export const TYPE_LABELS: Record<string, string> = {
  novost: 'Новость',
  ideya: 'Идея',
  sobytie: 'Событие',
  analitika: 'Аналитика',
  interesnoe: 'Интересное',
};

/** Карточка статьи с вертикальной обложкой, как у донора */
export function ArticleCard({ article }: { article: ArticleListItem }) {
  return (
    <div className="group relative h-full">
      <Link to={`/${article.type}/${article.slug}`} className="block h-full">
        <CoverThumb title={article.title} coverUrl={article.coverUrl} subtitle={TYPE_LABELS[article.type] ?? article.type} />
        {article.excerpt && (
          <p className="mt-2 line-clamp-2 text-sm text-zinc-400 group-hover:text-zinc-300">{article.excerpt}</p>
        )}
      </Link>
      <FavoriteButton entityType="article" entityId={article.id} className="absolute top-2 right-2" />
    </div>
  );
}

/** Компактная карточка статьи (для гридов на страницах-архивах) */
export function ArticleRowCard({ article }: { article: ArticleListItem }) {
  return (
    <Link to={`/${article.type}/${article.slug}`} className="flex gap-4 rounded-lg border border-[#2a2a2a] bg-[#191919] p-3 transition-colors hover:border-[#beff00]/50">
      {article.coverUrl && (
        <img src={article.coverUrl} alt="" loading="lazy" className="h-20 w-20 shrink-0 rounded-md object-cover" />
      )}
      <div>
        <span className="text-xs uppercase tracking-wide text-zinc-500">{TYPE_LABELS[article.type] ?? article.type}</span>
        <h3 className="mt-0.5 font-semibold leading-snug">{article.title}</h3>
      </div>
    </Link>
  );
}
