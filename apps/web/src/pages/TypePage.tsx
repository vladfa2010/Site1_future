import { useParams } from 'react-router';
import { useQuery } from '@tanstack/react-query';
import { api } from '../api';
import { ArticleCard, TYPE_LABELS } from '../components/ArticleCard';

const KNOWN_TYPES = ['novost', 'ideya', 'analitika', 'interesnoe', 'sobytie'];

export default function TypePage() {
  const { type = '' } = useParams();
  const known = (KNOWN_TYPES as string[]).includes(type);

  const { data, isLoading } = useQuery({
    queryKey: ['articles', type],
    queryFn: () => api.articles(type),
    enabled: known,
  });

  if (!known) return <p className="text-zinc-400">Раздел не найден</p>;

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold">{TYPE_LABELS[type] ?? type}</h1>
      {isLoading && <p className="text-zinc-400">Загрузка…</p>}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {data?.articles.map((a) => <ArticleCard key={a.id} article={a} />)}
      </div>
      {data && data.articles.length === 0 && <p className="text-zinc-500">Пока пусто.</p>}
    </div>
  );
}
