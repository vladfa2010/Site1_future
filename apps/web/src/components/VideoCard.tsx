import { Link } from 'react-router';
import type { ArticleListItem } from '../api';
import { FavoriteButton } from './FavoriteButton';
import { videoThumbnail } from '../lib/video';

/**
 * Карточка видео (type=video): превью с play-кнопкой (как у донора).
 * Клик — на страницу материала, где видео встроено плеером.
 */
export function VideoCard({ article }: { article: ArticleListItem & { videoUrl?: string | null } }) {
  const thumb = article.videoUrl ? videoThumbnail(article.videoUrl) : null;
  return (
    <div className="group relative h-full">
      <Link to={`/${article.type}/${article.slug}`} className="block h-full">
        <div className="relative aspect-video w-full overflow-hidden rounded-lg bg-zinc-800">
          {thumb ? (
            <img
              src={thumb}
              alt={article.title}
              loading="lazy"
              className="absolute inset-0 h-full w-full object-cover transition-transform duration-300 group-hover:scale-105"
            />
          ) : article.coverUrl ? (
            <img
              src={article.coverUrl}
              alt={article.title}
              loading="lazy"
              className="absolute inset-0 h-full w-full object-cover transition-transform duration-300 group-hover:scale-105"
            />
          ) : null}
          <div className="absolute inset-0 bg-gradient-to-t from-zinc-950/70 via-transparent to-transparent" />
          {/* play-кнопка */}
          <span className="absolute inset-0 flex items-center justify-center">
            <span className="flex h-12 w-12 items-center justify-center rounded-full bg-[#beff00]/90 text-zinc-950 transition-transform group-hover:scale-110">
              <svg viewBox="0 0 24 24" fill="currentColor" className="ml-0.5 h-5 w-5"><path d="M8 5v14l11-7z" /></svg>
            </span>
          </span>
          <span className="absolute bottom-2 left-2 rounded bg-black/70 px-1.5 py-0.5 text-[10px] uppercase tracking-wide text-[#c9ff2a]">Видео</span>
        </div>
        <h3 className="mt-2 line-clamp-2 font-semibold leading-snug text-zinc-100 group-hover:text-[#d6ff5c]">{article.title}</h3>
        {article.excerpt && <p className="mt-1 line-clamp-2 text-sm text-zinc-400">{article.excerpt}</p>}
      </Link>
      <FavoriteButton entityType="article" entityId={article.id} className="absolute right-2 top-2" />
    </div>
  );
}
