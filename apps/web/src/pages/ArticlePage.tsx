import { useParams } from 'react-router';
import { useQuery } from '@tanstack/react-query';
import { api } from '../api';
import { EntityChips } from '../components/EntityChips';
import { Breadcrumbs } from '../components/Breadcrumbs';
import { sanitizeArticleHtml } from '../lib/sanitize';
import { toEmbedUrl } from '../lib/video';
import { IdeaChart } from '../components/IdeaChart';
import { Paywall } from '../components/Paywall';
import { ArticleCard, TYPE_LABELS } from '../components/ArticleCard';
import { NewsCard } from '../components/NewsCard';
import { Carousel, CAROUSEL_ITEM } from '../components/Carousel';
import { FavoriteButton } from '../components/FavoriteButton';
import { SubscribeButton } from '../components/SubscribeButton';

/** Карусель «материалы по этой идее» — общие привязки (компании/тикеры/индустрии/тренды) */
function IdeaEvents({ articleId, type, title }: { articleId: number; type: string; title: string }) {
  const { data } = useQuery({
    queryKey: ['idea-events', articleId, type],
    queryFn: () => api.ideaEvents(articleId, type),
    staleTime: 60_000,
  });
  const events = data?.events ?? [];
  if (events.length === 0) return null; // принцип 4.3: показываем только внесённое
  const Card = type === 'novost' ? NewsCard : ArticleCard;
  return (
    <section className="mt-10">
      <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-zinc-500">{title}</h2>
      <Carousel>
        {events.map((a) => (
          <div key={a.id} className={CAROUSEL_ITEM}>
            <Card article={a} />
          </div>
        ))}
      </Carousel>
    </section>
  );
}

/** Карусель «все материалы типа» — для каруселей «аналитика (все)», «интересное (все)», «все идеи» */
function TypeCarousel({ type, title, excludeId }: { type: string; title: string; excludeId?: number }) {
  const { data } = useQuery({
    queryKey: ['articles-by-type', type],
    queryFn: () => api.byType(type, 12),
    staleTime: 60_000,
  });
  const items = (data?.articles ?? []).filter((a) => a.id !== excludeId).slice(0, 10);
  if (items.length === 0) return null;
  const Card = type === 'novost' ? NewsCard : ArticleCard;
  return (
    <section className="mt-10">
      <div className="mb-3 flex items-baseline justify-between">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-zinc-500">{title}</h2>
        <a href={`/${type}`} className="text-sm">все →</a>
      </div>
      <Carousel>
        {items.map((a) => (
          <div key={a.id} className={CAROUSEL_ITEM}>
            <Card article={a} />
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
      <div className="flex items-start justify-between gap-4">
        <h1 className="mt-2 text-3xl font-bold leading-tight">{article.title}</h1>
        {/* избранное + подписка на идею */}
        {article.type === 'ideya' && (
          <span className="flex shrink-0 gap-2 pt-2">
            <FavoriteButton entityType="article" entityId={article.id} />
            <SubscribeButton entityType="article" entityId={article.id} label="Подписаться на идею" />
          </span>
        )}
      </div>

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
      {article.type === 'ideya' && <IdeaEvents articleId={article.id} type="sobytie" title="События по идее" />}

      {/* type=video: встроенный плеер (embed, как в WordPress) */}
      {article.type === 'video' && article.videoUrl && toEmbedUrl(article.videoUrl) && (
        <div className="mt-6 overflow-hidden rounded-xl border border-[#2a2a2a]">
          <iframe
            src={toEmbedUrl(article.videoUrl)!}
            title={article.title}
            className="aspect-video w-full"
            allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
            allowFullScreen
            loading="lazy"
          />
        </div>
      )}

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

      {/* Нижний блок каруселей — только на странице идеи (как у донора) */}
      {article.type === 'ideya' && (
        <>
          <IdeaEvents articleId={article.id} type="novost" title="Новости по идее" />
          <TypeCarousel type="analitika" title="Аналитика" />
          <TypeCarousel type="interesnoe" title="Интересное" />
          <TypeCarousel type="ideya" title="Все идеи" excludeId={article.id} />
        </>
      )}
    </article>
  );
}
