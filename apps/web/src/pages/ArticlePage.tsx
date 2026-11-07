import { useParams } from 'react-router';
import { useQuery } from '@tanstack/react-query';
import { api, type ArticleListItem } from '../api';
import { EntityChips } from '../components/EntityChips';
import { Breadcrumbs } from '../components/Breadcrumbs';
import { sanitizeArticleHtml } from '../lib/sanitize';
import { IdeaChart } from '../components/IdeaChart';
import { Paywall } from '../components/Paywall';
import { ArticleCard, TYPE_LABELS } from '../components/ArticleCard';
import { Carousel, CAROUSEL_ITEM } from '../components/Carousel';

/** Карусель «События по идее» — события с общими привязками (компании/тикеры/индустрии/тренды) */
function IdeaEvents({ articleId }: { articleId: number }) {
  const { data } = useQuery({
    queryKey: ['idea-events', articleId],
    queryFn: () => api.ideaEvents(articleId),
    staleTime: 60_000,
  });
  const events = data?.events ?? [];
  if (events.length === 0) return null; // принцип 4.3: показываем только внесённое
  return (
    <section className="mt-6">
      <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-zinc-500">События по идее</h2>
      <Carousel>
        {events.map((a) => (
          <div key={a.id} className={CAROUSEL_ITEM}>
            <ArticleCard article={a} />
          </div>
        ))}
      </Carousel>
    </section>
  );
}

export default function ArticlePage() {
  const { type = '', slug = '' } = useParams();
  const { data, isLoading, error } = useQuery({
    queryKey: ['article', type, slug],
    queryFn: () => api.article(type, slug),
  });

  if (isLoading) return <p className="text-zinc-400">Загрузка…</p>;
  // пейволл: 403 от API → экран «войдите / оформите тариф»
  const err = error as { status?: number; body?: { access?: 'auth' | 'tariff' } } | null;
  if (err?.status === 403 && err.body?.access) {
    return <Paywall access={err.body.access} title="Закрытый материал" />;
  }
  if (error || !data) return <p className="text-red-400">Статья не найдена</p>;

  const { article, relations, stages } = data;

  // «Торги на бирже» ⇒ у компании есть тикер → показываем график (источник решает бэкенд)
  const trading = (stages ?? []).includes('Торги на бирже');
  const chartSymbol = trading ? relations.tickers[0]?.symbol ?? null : null;

  return (
    <article className="mx-auto max-w-3xl">
      <Breadcrumbs
        items={[
          { label: TYPE_LABELS[article.type] ?? article.type, to: `/${article.type}` },
          { label: article.title.length > 60 ? `${article.title.slice(0, 60)}…` : article.title },
        ]}
      />
      <span className="text-xs uppercase tracking-wide text-zinc-500">
        {TYPE_LABELS[article.type] ?? article.type}
      </span>
      <h1 className="mt-2 text-3xl font-bold leading-tight">{article.title}</h1>

      {/* тезис идеи — только если внесён (4.3) */}
      {article.thesis && (
        <p className="mt-4 rounded-lg border-l-4 border-[#beff00] bg-[#191919] p-4 text-zinc-300 italic">
          {article.thesis}
        </p>
      )}

      <div className="mt-4">
        <EntityChips relations={relations} />
      </div>

      {/* События по этой идее — общие привязки (компании/тикеры/индустрии/тренды) */}
      {article.type === 'ideya' && <IdeaEvents articleId={article.id} />}

      <div
        className="prose-invert mt-6 space-y-4 leading-relaxed [&_h2]:mt-8 [&_h2]:text-xl [&_h2]:font-bold [&_a]:text-[#c9ff2a] [&_p]:text-zinc-300 [&_ul]:list-disc [&_ul]:pl-6"
        dangerouslySetInnerHTML={{ __html: sanitizeArticleHtml(article.contentHtml) }}
      />

      {/* График: идея в статусе «Торги на бирже» и есть MOEX-тикер */}
      {chartSymbol && (
        <div className="mt-8">
          <IdeaChart symbol={chartSymbol} />
        </div>
      )}

      {article.sourceUrl && (
        <p className="mt-8 text-sm text-zinc-500">
          Источник:{' '}
          <a href={article.sourceUrl} target="_blank" rel="noreferrer" className="break-all">
            {article.sourceUrl}
          </a>
        </p>
      )}
    </article>
  );
}
