import { useState } from 'react';
import { useParams } from 'react-router';
import { useQuery } from '@tanstack/react-query';
import { api, type ArticleListItem } from '../api';
import { ArticleCard, TYPE_LABELS } from '../components/ArticleCard';
import { Breadcrumbs } from '../components/Breadcrumbs';
import { Carousel, CAROUSEL_ITEM } from '../components/Carousel';

/**
 * Страница тренда — структура как у донора:
 * шапка → «про тренд» → «идеи тренда» → «новости тренда»
 * → «аналитика по тренду» → «интересное по тренду».
 * Пустые секции не рендерятся (принцип 4.3).
 */
const SECTIONS: { type: string; title: string }[] = [
  { type: 'ideya', title: 'Идеи тренда' },
  { type: 'novost', title: 'Новости тренда' },
  { type: 'analitika', title: 'Аналитика по тренду' },
  { type: 'interesnoe', title: 'Интересное по тренду' },
];

const stripHtml = (html: string) => html.replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim();

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

  return (
    <div className="space-y-10">
      <Breadcrumbs items={[{ label: 'Тренды' }, { label: trend.name }]} />

      {/* Шапка */}
      <header>
        <h1 className="text-3xl font-bold">{trend.name}</h1>
      </header>

      {/* «Про тренд» — лонгрид, сворачиваемый */}
      {intro && (
        <section>
          <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-zinc-500">Про тренд</h2>
          <div
            className={`max-w-3xl leading-relaxed text-zinc-300 ${expanded ? '' : 'line-clamp-6'}`}
            style={expanded ? undefined : { display: '-webkit-box', WebkitLineClamp: 6, WebkitBoxOrient: 'vertical', overflow: 'hidden' }}
          >
            {isLong && !expanded ? `${intro.slice(0, INTRO_LIMIT)}…` : intro}
          </div>
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
                  <ArticleCard article={a} />
                </div>
              ))}
            </Carousel>
          </section>
        );
      })}
    </div>
  );
}
