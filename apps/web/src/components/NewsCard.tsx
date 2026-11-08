import { Link } from 'react-router';
import type { ArticleListItem } from '../api';
import { FavoriteButton } from './FavoriteButton';
import { LikeButton } from './LikeButton';
import { ReadingTimeBadge } from './ReadingTimeBadge';
import { ViewsBadge } from './ViewsBadge';

/**
 * Широкая новостная карточка как у донора: горизонтальная картинка сверху
 * (короткая, ~2:1), под ней заголовок, дата и лид. Книжная обложка 3:4
 * для новостей не подходит — их много и широкая картинка не приедается.
 * Fallback без обложки — градиентная плашка (принцип 4.3).
 */
export function NewsCard({ article }: { article: ArticleListItem }) {
  return (
    <div className="group relative flex h-full flex-col">
      <Link to={`/${article.type}/${article.slug}`} className="flex h-full flex-col">
        <div className="relative aspect-[2/1] w-full overflow-hidden rounded-lg bg-zinc-800">
          {article.coverUrl && (
            <img
              src={article.coverUrl}
              alt={article.title}
              loading="lazy"
              className="absolute inset-0 h-full w-full object-cover transition-transform duration-300 group-hover:scale-105"
            />
          )}
          <div className="absolute inset-0 bg-gradient-to-t from-zinc-950/70 to-transparent" />
          {/* ТЗ-04: лайк на обложке, угол противоположный Favorite */}
          <LikeButton articleId={article.id} liked={article.liked ?? false} likesCount={article.likesCount ?? 0} className="absolute bottom-2 left-2" />
        </div>
        <h3 className="mt-3 line-clamp-2 font-semibold leading-snug text-zinc-100 group-hover:text-[#d6ff5c]">
          {article.title}
        </h3>
        {(article.publishedAt || article.readingTime != null || article.viewsCount != null) && (
          <div className="mt-1.5 flex items-center gap-1.5 text-xs text-zinc-600">
            {article.publishedAt && <span>{article.publishedAt.slice(0, 10)}</span>}
            {article.publishedAt && (article.readingTime != null || article.viewsCount != null) && <span aria-hidden="true">·</span>}
            <ReadingTimeBadge minutes={article.readingTime ?? null} iconClassName="h-3 w-3" />
            {(article.publishedAt || article.readingTime != null) && article.viewsCount != null && <span aria-hidden="true">·</span>}
            {/* ТЗ-03: счётчик просмотров в одну строку с датой; цвет как у даты (ревью v2.1 №7) */}
            <ViewsBadge views={article.viewsCount} />
          </div>
        )}
        {article.excerpt && (
          <p className="mt-2 line-clamp-3 text-sm leading-relaxed text-zinc-400">{article.excerpt}</p>
        )}
      </Link>
      <FavoriteButton entityType="article" entityId={article.id} className="absolute right-2 top-2" />
    </div>
  );
}
