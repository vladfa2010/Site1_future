import { useParams } from 'react-router';
import { useQuery } from '@tanstack/react-query';
import { api } from '../api';
import { Avatar } from '../components/Avatar';
import { ArticleCard } from '../components/ArticleCard';
import { Breadcrumbs } from '../components/Breadcrumbs';
import { authorName, onSiteSince } from '../components/AuthorBox';

/**
 * ТЗ-05: публичная страница автора /avtor/:id.
 * 404 от API (нет юзера / нет опубликованных материалов) → заглушка «Автор не найден».
 * Пейволл применён сервером: список и счётчик — только доступные запрашивающему материалы.
 */
export default function AuthorPage() {
  const { id = '' } = useParams();
  const { data, isLoading, error } = useQuery({
    queryKey: ['author', id],
    queryFn: () => api.author(id),
    retry: false, // 404 — конечное состояние, повторять нечего
  });

  if (isLoading) return <p className="text-zinc-400">Загрузка…</p>;
  if (error || !data) {
    return (
      <div className="mx-auto max-w-lg py-16 text-center">
        <h1 className="text-2xl font-bold">Автор не найден</h1>
        <p className="mt-3 text-zinc-400">
          Такой страницы нет — возможно, у автора пока нет опубликованных материалов.
        </p>
      </div>
    );
  }

  const { author, articles } = data;
  const name = authorName(author);
  const bio = author.bio?.trim();

  return (
    <div>
      <Breadcrumbs items={[{ label: 'Авторы' }, { label: name, truncate: 60 }]} />

      {/* Шапка профиля */}
      <header className="flex items-start gap-4">
        <Avatar avatar={author.avatar} name={name} size={72} />
        <div className="min-w-0">
          <h1 className="text-2xl font-bold">{name}</h1>
          {bio && <p className="mt-2 max-w-2xl whitespace-pre-line text-sm text-zinc-400">{bio}</p>}
          <p className="mt-2 text-xs text-zinc-600">
            На сайте с {onSiteSince(author.createdAt)} · {author.articleCount}{' '}
            {plural(author.articleCount)}
          </p>
        </div>
      </header>

      {/* Материалы автора (пейволл уже применён сервером; сетка как в избранном) */}
      <section className="mt-10">
        <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-zinc-500">
          Материалы автора
        </h2>
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {articles.map((a) => (
            <ArticleCard key={a.id} article={a} />
          ))}
        </div>
      </section>
    </div>
  );
}

function plural(n: number): string {
  const mod100 = Math.abs(n) % 100;
  const mod10 = mod100 % 10;
  if (mod100 > 10 && mod100 < 20) return 'материалов';
  if (mod10 > 1 && mod10 < 5) return 'материала';
  if (mod10 === 1) return 'материал';
  return 'материалов';
}
