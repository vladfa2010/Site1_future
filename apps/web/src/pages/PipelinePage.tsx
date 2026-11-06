import { useQuery } from '@tanstack/react-query';
import { api } from '../api';
import { ArticleCard } from '../components/ArticleCard';

/**
 * Портфель (пайплайн): pipeline → портфель → архив.
 * Скелет: показываем идеи; фазы через deal_phases — следующий шаг.
 */
export default function PipelinePage() {
  const { data, isLoading, error } = useQuery({ queryKey: ['ideas'], queryFn: () => api.articles('ideya') });

  if (isLoading) return <p className="text-zinc-400">Загрузка…</p>;
  if (error || !data) return <p className="text-red-400">Ошибка загрузки</p>;

  return (
    <div className="space-y-8">
      <h1 className="text-2xl font-bold">Портфель идей</h1>
      <p className="text-zinc-400">
        Пайплайн: pipeline → портфель → архив. Фазы появятся с фильтрацией по deal_phases.
      </p>
      {data.articles.length > 0 ? (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {data.articles.map((a) => (
            <ArticleCard key={a.id} article={a} />
          ))}
        </div>
      ) : (
        <p className="text-zinc-500">Идей пока нет.</p>
      )}
    </div>
  );
}
