import { useQuery } from '@tanstack/react-query';
import { api } from '../api';
import { ArticleCard, TYPE_LABELS } from '../components/ArticleCard';

const SECTIONS = ['novost', 'ideya', 'analitika', 'interesnoe', 'sobytie'] as const;

export default function HomePage() {
  const { data, isLoading, error } = useQuery({ queryKey: ['articles'], queryFn: () => api.articles() });

  if (isLoading) return <p className="text-zinc-400">Загрузка…</p>;
  if (error || !data) return <p className="text-red-400">Ошибка загрузки</p>;

  return (
    <div className="space-y-10">
      <h1 className="text-2xl font-bold">Будущее, которое нельзя упустить</h1>
      {SECTIONS.map((type) => {
        const items = data.articles.filter((a) => a.type === type).slice(0, 6);
        if (items.length === 0) return null; // принцип 4.3: пустых секций нет
        return (
          <section key={type}>
            <h2 className="mb-4 text-lg font-semibold uppercase tracking-wide text-zinc-400">
              {TYPE_LABELS[type]}
            </h2>
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {items.map((a) => (
                <ArticleCard key={a.id} article={a} />
              ))}
            </div>
          </section>
        );
      })}
    </div>
  );
}
