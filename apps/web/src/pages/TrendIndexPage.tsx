import { Link } from 'react-router';
import { useQuery } from '@tanstack/react-query';
import { Breadcrumbs, type Crumb } from '../components/Breadcrumbs';
import { JsonLdBreadcrumbs } from '../components/JsonLdBreadcrumbs';

interface Trend {
  slug: string;
  name: string;
  description: string | null;
  coverUrl: string | null;
}

/** Подборка всех трендов — куда ведёт «Посмотреть в будущее» с главной. */
export default function TrendIndexPage() {
  const { data, isLoading } = useQuery({
    queryKey: ['trends'],
    queryFn: () => fetch('/api/trends').then((r) => r.json() as Promise<{ trends: Trend[] }>),
    staleTime: 60_000,
  });

  const crumbs: Crumb[] = [{ label: 'Тренды' }];

  return (
    <div className="space-y-6">
      <Breadcrumbs items={crumbs} />
      <JsonLdBreadcrumbs items={crumbs} />
      <h1 className="text-2xl font-bold">Тренды</h1>
      <p className="max-w-2xl text-zinc-400">
        То, что уже меняет мир. Великие идеи, инновации, новые сектора в экономике —
        то, о чём большинство узнает в будущем, а вы можете посмотреть сейчас.
      </p>

      {isLoading && <p className="text-zinc-400">Загрузка…</p>}
      {data && data.trends.length === 0 && <p className="text-zinc-500">Тренды скоро появятся.</p>}

      <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4">
        {data?.trends.map((t) => (
          <Link key={t.slug} to={`/trend/${t.slug}`} className="group">
            <div className="relative flex aspect-[3/4] w-full flex-col justify-end overflow-hidden rounded-lg border border-[#2a2a2a] bg-gradient-to-br from-zinc-800 to-zinc-900 p-4 transition-colors group-hover:border-[#beff00]/50">
              {t.coverUrl && (
                <img
                  src={t.coverUrl}
                  alt={t.name}
                  loading="lazy"
                  className="absolute inset-0 h-full w-full object-cover"
                />
              )}
              <div className="absolute inset-0 bg-gradient-to-t from-zinc-950/80 via-transparent to-transparent" />
              <h2 className="relative text-lg font-bold uppercase tracking-wide text-[#c9ff2a]">{t.name}</h2>
              {t.description && (
                <p className="relative mt-1 line-clamp-2 text-xs text-zinc-300">
                  {t.description.replace(/<[^>]+>/g, '').slice(0, 120)}
                </p>
              )}
            </div>
          </Link>
        ))}
      </div>
    </div>
  );
}
