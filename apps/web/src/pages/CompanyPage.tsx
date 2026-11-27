import { useParams } from 'react-router';
import { useQuery } from '@tanstack/react-query';
import { api, type ArticleListItem } from '../api';
import { ArticleCard } from '../components/ArticleCard';
import { VideoCard } from '../components/VideoCard';
import { RoundsTable } from '../components/RoundsTable';
import { Breadcrumbs, type Crumb } from '../components/Breadcrumbs';
import { JsonLdBreadcrumbs } from '../components/JsonLdBreadcrumbs';
import { FavoriteButton } from '../components/FavoriteButton';
import { SubscribeButton } from '../components/SubscribeButton';
import { sanitizeArticleHtml } from '../lib/sanitize';
import { AdminEditLink } from '../components/AdminEditLink';
import { Carousel, CAROUSEL_ITEM } from '../components/Carousel';

/** Секция материалов одного типа — каруселью, как на главной и на странице тренда.
 *  itemsCount === 0 → не рендерим секцию вовсе (принцип 4.3).
 *  video — карточки-плееры вместо обычных (type=video, как у TrendPage). */
function Section({ title, items, video }: { title: string; items: ArticleListItem[]; video?: boolean }) {
  if (items.length === 0) return null;
  return (
    <section>
      <div className="mb-4 flex items-baseline justify-between">
        <h2 className="text-lg font-semibold uppercase tracking-wide text-zinc-400">{title}</h2>
        <span className="text-sm text-zinc-600">{items.length}</span>
      </div>
      <Carousel>
        {items.map((a) => (
          <div key={a.id} className={CAROUSEL_ITEM}>
            {video ? (
              <VideoCard article={a as ArticleListItem & { videoUrl?: string | null }} />
            ) : (
              <ArticleCard article={a} />
            )}
          </div>
        ))}
      </Carousel>
    </section>
  );
}

export default function CompanyPage() {
  const { slug = '' } = useParams();
  const { data, isLoading, error } = useQuery({
    queryKey: ['company', slug],
    queryFn: () => api.company(slug),
  });

  if (isLoading) return <p className="text-zinc-400">Загрузка…</p>;
  if (error || !data) return <p className="text-red-400">Компания не найдена</p>;

  const { company, tickers, industries, articles, fundingRounds } = data;
  const editLink = <AdminEditLink to={`/companies/${company.slug}/edit`} />;

  // ТЗ-01: один массив крошек — визуал + JSON-LD (элемент 2 → /portfolio, §4.5)
  const crumbs: Crumb[] = [{ label: 'Скринер проектов', to: '/portfolio' }, { label: company.name }];

  return (
    <div className="space-y-10">
      {editLink}
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
          className="max-w-3xl space-y-4 leading-relaxed text-zinc-300 [&_h2]:mt-6 [&_h2]:text-lg [&_h2]:font-bold [&_h3]:mt-4 [&_h3]:font-bold [&_a]:text-[#c9ff2a] [&_ul]:list-disc [&_ul]:pl-6 [&_table]:my-4 [&_table]:w-full [&_table]:text-sm [&_thead]:bg-zinc-800/50 [&_th]:border [&_th]:border-zinc-700 [&_th]:px-3 [&_th]:py-2 [&_th]:text-left [&_th]:font-semibold [&_td]:border [&_td]:border-zinc-700 [&_td]:px-3 [&_td]:py-2 [&_pre]:overflow-x-auto [&_pre]:rounded-lg [&_pre]:bg-zinc-900 [&_pre]:p-3 [&_code]:text-[#c9ff2a] [&_ol]:list-decimal [&_ol]:pl-6 [&_blockquote]:border-l-2 [&_blockquote]:border-zinc-700 [&_blockquote]:pl-3 [&_blockquote]:italic [&_img]:max-w-full [&_img]:rounded-lg"
          dangerouslySetInnerHTML={{ __html: sanitizeArticleHtml(company.description) }}
        />
      )}

      {/* Материалы по типам: события первыми (карусель), затем аналитика и
          интересное — тот же порядок, что на главной; далее идеи, новости и
          видео (карточки-плееры, как на TrendPage). API не менялся: type уже
          приходит у каждого материала (2026-11-27) */}
      {(() => {
        const byType = (t: string) => articles.filter((a) => a.type === t);
        const typed = ['sobytie', 'analitika', 'interesnoe', 'ideya', 'novost', 'video'];
        const rest = articles.filter((a) => !typed.includes(a.type));
        return (
          <>
            <Section title="События" items={byType('sobytie')} />
            <Section title="Аналитика" items={byType('analitika')} />
            <Section title="Интересное" items={byType('interesnoe')} />
            <Section title="Идеи" items={byType('ideya')} />
            <Section title="Новости" items={byType('novost')} />
            <Section title="Видео" items={byType('video')} video />
            <Section title="Материалы" items={rest} />
          </>
        );
      })()}
    </div>
  );
}
