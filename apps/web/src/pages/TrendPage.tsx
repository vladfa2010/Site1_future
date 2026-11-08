import { useState } from 'react';
import { useParams } from 'react-router';
import { useQuery } from '@tanstack/react-query';
import { stripHtml } from '@newinvest/db/text-utils';
import { api, type ArticleListItem } from '../api';
import { ArticleCard, TYPE_LABELS } from '../components/ArticleCard';
import { VideoCard } from '../components/VideoCard';
import { Breadcrumbs, type Crumb } from '../components/Breadcrumbs';
import { JsonLdBreadcrumbs } from '../components/JsonLdBreadcrumbs';
import { Carousel, CAROUSEL_ITEM } from '../components/Carousel';
import { FavoriteButton } from '../components/FavoriteButton';
import { SubscribeButton } from '../components/SubscribeButton';
import { sanitizeArticleHtml } from '../lib/sanitize';

/**
 * Страница тренда — воронка погружения по концепту:
 * «Видео» (лёгкий вход) → «Аналитика» (глубина) → «Новости» (актуальный фон)
 * → «События» → «Идеи» → «Интересное» (всё вокруг темы).
 * Пустые секции не рендерятся (принцип 4.3).
 */
const SECTIONS: { type: string; title: string }[] = [
  { type: 'video', title: 'Видео по теме' },
  { type: 'analitika', title: 'Аналитика по тренду' },
  { type: 'novost', title: 'Новости тренда' },
  { type: 'sobytie', title: 'События тренда' },
  { type: 'ideya', title: 'Идеи тренда' },
  { type: 'interesnoe', title: 'Интересное по тренду' },
];

export default function TrendPage() {
  const { slug = '' } = useParams();
  const { data, isLoading, error } = useQuery({
    queryKey: ['trend', slug],
    queryFn: () => api.trend(slug),
  });
  const [expanded, setExpanded] = useState(false);

  if (isLoading) return <p className="text-zinc-400">Загрузка…</p>;
  if (error || !data) return <p className="text-red-400">Тренд не найден</p>;

  const { trend, articles } = data;
  const intro = trend.description ? stripHtml(trend.description) : '';
  const INTRO_LIMIT = 1200;
  const isLong = intro.length > INTRO_LIMIT;

  const byType = (type: string): ArticleListItem[] => articles.filter((a) => a.type === type);

  // ТЗ-01: один массив крошек — визуал + JSON-LD («Тренды» без to: индексной страницы нет, §4.4)
  const crumbs: Crumb[] = [{ label: 'Тренды' }, { label: trend.name }];

  return (
    <div className="space-y-10">
      <Breadcrumbs items={crumbs} />
      <JsonLdBreadcrumbs items={crumbs} />

      {/* Шапка */}
      <header className="flex items-start justify-between gap-4">
        <h1 className="text-3xl font-bold">{trend.name}</h1>
        <span className="flex shrink-0 gap-2 pt-1">
          <FavoriteButton entityType="trend" entityId={trend.id} className="static" />
          <SubscribeButton entityType="trend" entityId={trend.id} />
        </span>
      </header>

      {/* «Про тренд» — лонгрид, сворачиваемый */}
      {intro && (
        <section>
          <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-zinc-500">Про тренд</h2>
          <div
            className={`max-w-3xl space-y-4 leading-relaxed text-zinc-300 [&_h2]:mt-6 [&_h2]:text-lg [&_h2]:font-bold [&_h3]:mt-4 [&_h3]:font-bold [&_a]:text-[#c9ff2a] [&_ul]:list-disc [&_ul]:pl-6 [&_ol]:list-decimal [&_ol]:pl-6 [&_blockquote]:border-l-2 [&_blockquote]:border-zinc-700 [&_blockquote]:pl-3 [&_blockquote]:italic ${expanded ? '' : 'line-clamp-6'}`}
            style={expanded ? undefined : { display: '-webkit-box', WebkitLineClamp: 6, WebkitBoxOrient: 'vertical', overflow: 'hidden' }}
            dangerouslySetInnerHTML={{ __html: sanitizeArticleHtml(trend.description ?? '') }}
          />
          {isLong && (
            <button onClick={() => setExpanded(!expanded)} className="mt-2 text-sm font-semibold">
              {expanded ? 'Свернуть ↑' : 'Читать далее →'}
            </button>
          )}
        </section>
      )}

      {/* Секции по типам — как у донора */}
      {SECTIONS.map(({ type, title }) => {
        const items = byType(type);
        if (items.length === 0) return null;
        return (
          <section key={type}>
            <div className="mb-4 flex items-baseline justify-between">
              <h2 className="text-sm font-semibold uppercase tracking-wide text-zinc-500">{title}</h2>
              <a href={`/${type}`} className="text-sm">все {TYPE_LABELS[type]?.toLowerCase()} →</a>
            </div>
            <Carousel>
              {items.map((a) => (
                <div key={a.id} className={CAROUSEL_ITEM}>
                  {type === 'video' ? (
                    <VideoCard article={a as ArticleListItem & { videoUrl?: string | null }} />
                  ) : (
                    <ArticleCard article={a} />
                  )}
                </div>
              ))}
            </Carousel>
          </section>
        );
      })}
    </div>
  );
}
