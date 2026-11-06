import { useParams } from 'react-router';
import { useQuery } from '@tanstack/react-query';
import { api } from '../api';
import { ArticleCard } from '../components/ArticleCard';

export default function TrendPage() {
  const { slug = '' } = useParams();
  const { data, isLoading, error } = useQuery({
    queryKey: ['trend', slug],
    queryFn: () => api.trend(slug),
  });

  if (isLoading) return <p className="text-zinc-400">Загрузка…</p>;
  if (error || !data) return <p className="text-red-400">Тренд не найден</p>;

  const { trend, articles } = data;

  return (
    <div className="space-y-10">
      <header>
        <span className="text-xs uppercase tracking-wide text-zinc-500">Тренд</span>
        <h1 className="mt-1 text-3xl font-bold">{trend.name}</h1>
        {trend.description && (
          <p className="mt-4 max-w-3xl leading-relaxed text-zinc-300">{trend.description}</p>
        )}
      </header>
      {articles.length > 0 && (
        <section>
          <h2 className="mb-4 text-xl font-bold">В теме</h2>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {articles.map((a) => (
              <ArticleCard key={a.id} article={a} />
            ))}
          </div>
        </section>
      )}
    </div>
  );
}
