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
  video: 'Видео',
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
