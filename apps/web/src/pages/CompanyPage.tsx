import { useParams } from 'react-router';
import { useQuery } from '@tanstack/react-query';
import { api } from '../api';
import { ArticleCard } from '../components/ArticleCard';
import { RoundsTable } from '../components/RoundsTable';
import { Breadcrumbs, type Crumb } from '../components/Breadcrumbs';
import { JsonLdBreadcrumbs } from '../components/JsonLdBreadcrumbs';
import { FavoriteButton } from '../components/FavoriteButton';
import { SubscribeButton } from '../components/SubscribeButton';
import { sanitizeArticleHtml } from '../lib/sanitize';

export default function CompanyPage() {
  const { slug = '' } = useParams();
  const { data, isLoading, error } = useQuery({
    queryKey: ['company', slug],
    queryFn: () => api.company(slug),
  });

  if (isLoading) return <p className="text-zinc-400">Загрузка…</p>;
  if (error || !data) return <p className="text-red-400">Компания не найдена</p>;

  const { company, tickers, industries, articles, fundingRounds } = data;

  // ТЗ-01: один массив крошек — визуал + JSON-LD (элемент 2 → /portfolio, §4.5)
  const crumbs: Crumb[] = [{ label: 'Скринер проектов', to: '/portfolio' }, { label: company.name }];

  return (
    <div className="space-y-10">
      <Breadcrumbs items={crumbs} />
      <JsonLdBreadcrumbs items={crumbs} />
      {/* Шапка профиля */}
      <header>
        <div className="flex items-start justify-between gap-4">
          <h1 className="text-3xl font-bold">{company.name}</h1>
          <span className="flex shrink-0 gap-2 pt-1">
            <FavoriteButton entityType="company" entityId={company.id} className="static" />
            <SubscribeButton entityType="company" entityId={company.id} />
          </span>
        </div>
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
        <div
          className="max-w-3xl space-y-4 leading-relaxed text-zinc-300 [&_h2]:mt-6 [&_h2]:text-lg [&_h2]:font-bold [&_h3]:mt-4 [&_h3]:font-bold [&_a]:text-[#c9ff2a] [&_ul]:list-disc [&_ul]:pl-6 [&_ol]:list-decimal [&_ol]:pl-6 [&_blockquote]:border-l-2 [&_blockquote]:border-zinc-700 [&_blockquote]:pl-3 [&_blockquote]:italic [&_img]:max-w-full [&_img]:rounded-lg"
          dangerouslySetInnerHTML={{ __html: sanitizeArticleHtml(company.description) }}
        />
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
