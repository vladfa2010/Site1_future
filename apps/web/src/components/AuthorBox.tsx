import { Link } from 'react-router';
import { Avatar } from './Avatar';
import type { ArticleAuthor } from '../api';

/** Имя автора: displayName null → «Автор» (ревью v2.1 №5) */
export function authorName(author: Pick<ArticleAuthor, 'displayName'>): string {
  return author.displayName ?? 'Автор';
}

/** Формат даты «на сайте с …» */
export function onSiteSince(createdAt: string): string {
  return new Date(createdAt).toLocaleDateString('ru-RU', { day: 'numeric', month: 'long', year: 'numeric' });
}

/**
 * ТЗ-05: author box в конце статьи (после «Источника», перед каруселями).
 * Всё берёт из встроенного объекта author ответа детальной статьи — один запрос (Риск 5).
 * author == null (author_id IS NULL) → не рендерится вообще.
 */
export function AuthorBox({ author }: { author: ArticleAuthor | null }) {
  if (!author) return null;
  const name = authorName(author);
  const bio = author.bio?.trim();
  const bioShort = bio && bio.length > 160 ? `${bio.slice(0, 160)}…` : bio;
  return (
    <aside className="mt-8 flex items-start gap-4 rounded-xl border border-[#2a2a2a] bg-[#191919] p-5">
      <Link to={`/avtor/${author.id}`} aria-label={`Страница автора: ${name}`}>
        <Avatar avatar={author.avatar} name={name} size={48} />
      </Link>
      <div className="min-w-0">
        <Link to={`/avtor/${author.id}`} className="font-semibold hover:text-[#c9ff2a]">
          {name}
        </Link>
        {/* bio пусто — блок не рендерим (принцип 4.3) */}
        {bioShort && <p className="mt-1 text-sm text-zinc-400">{bioShort}</p>}
        <p className="mt-2 text-xs text-zinc-600">На сайте с {onSiteSince(author.createdAt)}</p>
      </div>
    </aside>
  );
}
