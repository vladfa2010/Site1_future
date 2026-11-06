import { useParams } from 'react-router';
import { useQuery } from '@tanstack/react-query';
import { api } from '../api';
import { Breadcrumbs } from '../components/Breadcrumbs';

export default function StoryPage() {
  const { slug = '' } = useParams();
  const { data, isLoading, error } = useQuery({
    queryKey: ['story', slug],
    queryFn: () => api.story(slug),
  });

  if (isLoading) return <p className="text-zinc-400">Загрузка…</p>;
  if (error || !data) return <p className="text-red-400">Сюжет не найден</p>;

  const { story, articles } = data;

  return (
    <div className="space-y-10">
      <Breadcrumbs items={[{ label: 'Сюжеты' }, { label: story.name }]} />
      <header>
        <span className="text-xs uppercase tracking-wide text-zinc-500">Сюжет</span>
        <h1 className="mt-1 text-3xl font-bold">{story.name}</h1>
        {story.description && <p className="mt-4 text-zinc-300">{story.description}</p>}
      </header>

      {/* Хронология сюжета */}
      <ol className="relative space-y-6 border-l border-[#2a2a2a] pl-6">
        {articles.map((a) => (
          <li key={a.id} className="relative">
            <span className="absolute -left-[29px] top-1.5 h-2.5 w-2.5 rounded-full bg-[#beff00]" />
            <a href={`/${a.type}/${a.slug}`} className="font-semibold text-zinc-100 hover:text-[#d6ff5c]">
              {a.isPrimary ? '★ ' : ''}
              {a.title}
            </a>
            <div className="mt-1 text-xs text-zinc-500">
              {a.publishedAt?.slice(0, 10)}
              {a.isPrimary && ' · главная статья'}
            </div>
            {a.excerpt && <p className="mt-1 text-sm text-zinc-400">{a.excerpt}</p>}
          </li>
        ))}
      </ol>
    </div>
  );
}
