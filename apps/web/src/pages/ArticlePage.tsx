import { useParams } from 'react-router';
import { useQuery } from '@tanstack/react-query';
import { api } from '../api';
import { EntityChips } from '../components/EntityChips';
import { Breadcrumbs } from '../components/Breadcrumbs';
import { sanitizeArticleHtml } from '../lib/sanitize';
import { TYPE_LABELS } from '../components/ArticleCard';

export default function ArticlePage() {
  const { type = '', slug = '' } = useParams();
  const { data, isLoading, error } = useQuery({
    queryKey: ['article', type, slug],
    queryFn: () => api.article(type, slug),
  });

  if (isLoading) return <p className="text-zinc-400">Загрузка…</p>;
  if (error || !data) return <p className="text-red-400">Статья не найдена</p>;

  const { article, relations } = data;

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
        <p className="mt-4 rounded-lg border-l-4 border-orange-500 bg-zinc-900 p-4 text-zinc-300 italic">
          {article.thesis}
        </p>
      )}

      <div className="mt-4">
        <EntityChips relations={relations} />
      </div>

      <div
        className="prose-invert mt-6 space-y-4 leading-relaxed [&_h2]:mt-8 [&_h2]:text-xl [&_h2]:font-bold [&_a]:text-orange-400 [&_p]:text-zinc-300 [&_ul]:list-disc [&_ul]:pl-6"
        dangerouslySetInnerHTML={{ __html: sanitizeArticleHtml(article.contentHtml) }}
      />

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
