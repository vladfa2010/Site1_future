import { useParams } from 'react-router';
import { useQuery } from '@tanstack/react-query';
import { api } from '../api';
import { ArticleCard } from '../components/ArticleCard';
import { RoundsTable } from '../components/RoundsTable';

export default function CompanyPage() {
  const { slug = '' } = useParams();
  const { data, isLoading, error } = useQuery({
    queryKey: ['company', slug],
    queryFn: () => api.company(slug),
  });

  if (isLoading) return <p className="text-zinc-400">Загрузка…</p>;
  if (error || !data) return <p className="text-red-400">Компания не найдена</p>;

  const { company, tickers, industries, articles, fundingRounds } = data;

  return (
    <div className="space-y-10">
      {/* Шапка профиля */}
      <header>
        <h1 className="text-3xl font-bold">{company.name}</h1>
        {company.oneLiner && <p className="mt-2 text-lg text-zinc-400">{company.oneLiner}</p>}
        <div className="mt-3 flex flex-wrap gap-3 text-sm text-zinc-500">
          {company.foundedYear && <span>осн. {company.foundedYear}</span>}
          {company.country && <span>{company.country}</span>}
          {company.website && (
            <a href={company.website} target="_blank" rel="noreferrer">
              сайт
            </a>
          )}
        </div>
        {(tickers.length > 0 || industries.length > 0) && (
          <div className="mt-3 flex flex-wrap gap-2 text-sm">
            {tickers.map((t) => (
              <span key={t.symbol} className="rounded-full bg-zinc-800 px-3 py-1 text-zinc-300">
                {t.symbol}
                {t.exchange ? ` · ${t.exchange}` : ''}
              </span>
            ))}
            {industries.map((i) => (
              <span key={i.slug} className="rounded-full bg-zinc-800 px-3 py-1 text-zinc-400">
                {i.name}
              </span>
            ))}
          </div>
        )}
      </header>

      {/* Раунды — только если внесены (принцип 4.3) */}
      {fundingRounds.length > 0 && <RoundsTable rounds={fundingRounds} />}

      {company.description && (
        <p className="leading-relaxed text-zinc-300">{company.description}</p>
      )}

      {articles.length > 0 && (
        <section>
          <h2 className="mb-4 text-xl font-bold">Материалы</h2>
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
