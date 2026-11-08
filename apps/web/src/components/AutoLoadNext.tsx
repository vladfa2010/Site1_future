import { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router';
import { useQueries } from '@tanstack/react-query';
import {
  api,
  type ArticleDetail,
  type ArticleListItem,
  type ArticleRelations,
} from '../api';
import { pickCandidates, type NextCandidate } from '../lib/nextCandidates';
import { setArticleTitle } from '../lib/pageTitle';
import { sanitizeArticleHtml } from '../lib/sanitize';
import { toEmbedUrl } from '../lib/video';
import { EntityChips } from './EntityChips';
import { Paywall } from './Paywall';
import { TYPE_LABELS } from './ArticleCard';

/**
 * ТЗ-06: автоподгрузка следующего материала в самом низу страницы статьи.
 * Стейт-машина цикла «одна подгрузка»: idle → loading → loaded(ok|paywall|error) → done.
 * Актуальные данные в колбэках (observer/таймеры) — только через refs (аддендум v2.1 №3),
 * loadingRef пересчитывается из items (№2) — иначе мёртвый замок sentinel'а.
 */

const MAX_LOADED = 3;
const OBSERVER_MARGIN = '600px';

interface LoadedItem {
  id: number;
  type: string;
  slug: string;
  title: string; // из ленты кандидатов — для h2-ссылки и document.title до фетча
  status: 'loading' | 'ok' | 'paywall' | 'error';
  access?: 'auth' | 'tariff'; // для status='paywall'
}

type ArticleQueryResult = Awaited<ReturnType<typeof api.article>>;

interface AutoLoadNextProps {
  current: ArticleDetail; // статья основной страницы (id, type, slug)
  relations: ArticleRelations; // для каскада кандидатов (relations.trends)
}

/** Скелет вместо строки «Загрузка…» (аддендум v2.1 №4): 2 блока проза-высоты, animate-pulse */
function AutoLoadSkeleton() {
  return (
    <div className="animate-pulse space-y-4" aria-hidden="true">
      <div className="space-y-3">
        <div className="h-6 w-2/3 rounded bg-[#2a2a2a]" />
        <div className="h-4 w-1/3 rounded bg-[#222]" />
      </div>
      <div className="space-y-2">
        <div className="h-4 w-full rounded bg-[#222]" />
        <div className="h-4 w-11/12 rounded bg-[#222]" />
        <div className="h-4 w-4/5 rounded bg-[#222]" />
      </div>
      <div className="h-32 w-full rounded bg-[#1a1a1a]" />
      <div className="space-y-2">
        <div className="h-4 w-full rounded bg-[#222]" />
        <div className="h-4 w-3/5 rounded bg-[#222]" />
      </div>
    </div>
  );
}

/** Разделитель «Следующий материал» над каждым блоком (стилистика заголовков каруселей) */
function NextMaterialSeparator() {
  return (
    <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-zinc-500">
      Следующий материал
    </h2>
  );
}

/** Контент успешно подгруженной статьи (минимальный набор ТЗ-06 §3.3) */
function LoadedArticle({ data }: { data: ArticleQueryResult }) {
  const { article, relations } = data;
  const embedUrl = article.type === 'video' && article.videoUrl ? toEmbedUrl(article.videoUrl) : null;
  return (
    <>
      <NextMaterialSeparator />
      <Link to={`/${article.type}/${article.slug}`} className="block hover:opacity-90">
        <h2 className="text-2xl font-bold leading-tight hover:underline">{article.title}</h2>
      </Link>
      <p className="mt-2 text-xs uppercase tracking-wide text-zinc-600">
        {TYPE_LABELS[article.type] ?? article.type}
      </p>
      <div className="mt-4">
        <EntityChips relations={relations} />
      </div>
      {embedUrl && (
        <div className="mt-6 overflow-hidden rounded-xl border border-[#2a2a2a]">
          <iframe
            src={embedUrl}
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
      {article.sourceUrl && (
        <p className="mt-8 text-sm text-zinc-500">
          Источник:{' '}
          <a href={article.sourceUrl} target="_blank" rel="noreferrer" className="break-all">
            {article.sourceUrl}
          </a>
        </p>
      )}
    </>
  );
}

export function AutoLoadNext({ current, relations }: AutoLoadNextProps) {
  const [items, setItems] = useState<LoadedItem[]>([]);
  const [candidates, setCandidates] = useState<NextCandidate[]>([]); // очередь
  const [candidatesLoaded, setCandidatesLoaded] = useState(false); // ленивый первый fetch лент

  const sentinelRef = useRef<HTMLDivElement>(null);
  const loadingRef = useRef(false); // защита от параллельных триггеров (ref, не state)
  const itemsRef = useRef<LoadedItem[]>(items);
  const candidatesRef = useRef<NextCandidate[]>(candidates);
  const intersectingRef = useRef(false); // sentinel сейчас во вьюпорте
  const cascadeStartedRef = useRef(false);
  const lastOkKeyRef = useRef<string | null>(null); // replaceState/title — один раз на статью

  // ---- Фетч detail подгруженных: useQueries (решение ТЗ), статусы/abort/кэш из коробки ----
  const results = useQueries({
    queries: items.map((it) => ({
      queryKey: ['article', it.type, it.slug],
      queryFn: ({ signal }: { signal: AbortSignal }) => api.article(it.type, it.slug, signal),
      retry: false, // битый кандидат не ждёт бэкенд-ретраев
      staleTime: Infinity,
    })),
  });

  /** Ленивый каскад кандидатов (ТЗ-06 §3.2, аддендум №5/№6: catch на каждом шаге,
   *  по одному запросу за раз). После — pump(), если sentinel уже во вьюпорте. */
  const startCascade = async () => {
    cascadeStartedRef.current = true;
    const excludeIds = new Set<number>([current.id, ...itemsRef.current.map((i) => i.id)]);
    let trendArticles: ArticleListItem[] | null = null;
    let byTypeArticles: ArticleListItem[] | null = null;
    let allArticles: ArticleListItem[] | null = null;
    const firstTrend = relations.trends[0];
    if (firstTrend) {
      try {
        trendArticles = (await api.trend(firstTrend.slug)).articles;
      } catch {
        trendArticles = null; // падение trend-фетча не встаёт — переходим к byType
      }
    }
    if (!trendArticles || trendArticles.length === 0) {
      try {
        byTypeArticles = (await api.byType(current.type, 20)).articles;
      } catch {
        byTypeArticles = null;
      }
    }
    if ((!byTypeArticles || byTypeArticles.length === 0) && (!trendArticles || trendArticles.length === 0)) {
      try {
        allArticles = (await api.articles()).articles;
      } catch {
        allArticles = null; // тихая ошибка: стоп подгрузки, страница не ломается
      }
    }
    const picked = pickCandidates(trendArticles, byTypeArticles, allArticles, excludeIds);
    candidatesRef.current = picked;
    setCandidates(picked);
    setCandidatesLoaded(true);
    if (intersectingRef.current) pumpRef.current();
  };

  /** Взять candidates[0] в items (status='loading') и сдвинуть очередь.
   *  Читает ТОЛЬКО refs — безопасно вызывать из observer и из async-каскада. */
  const pump = () => {
    if (loadingRef.current) return; // идёт фетч — sentinel «отключён»
    const its = itemsRef.current;
    const cands = candidatesRef.current;
    if (its.length >= MAX_LOADED || cands.length === 0) return;
    const next = cands[0];
    const newItems: LoadedItem[] = [
      ...its,
      { id: next.id, type: next.type, slug: next.slug, title: next.title, status: 'loading' },
    ];
    const newCandidates = cands.slice(1);
    itemsRef.current = newItems;
    candidatesRef.current = newCandidates;
    loadingRef.current = true; // до ре-рендера — защита от race на быстром скролле
    setItems(newItems);
    setCandidates(newCandidates);
  };
  const pumpRef = useRef(pump);
  pumpRef.current = pump;
  const startCascadeRef = useRef(startCascade);
  startCascadeRef.current = startCascade;

  // ---- Sentinel: observer создаётся ОДИН раз с пустыми deps и читает только refs (№3) ----
  useEffect(() => {
    const el = sentinelRef.current;
    if (!el) return;
    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          intersectingRef.current = entry.isIntersecting;
          if (!entry.isIntersecting) continue;
          if (!cascadeStartedRef.current) void startCascadeRef.current();
          pumpRef.current();
        }
      },
      { rootMargin: OBSERVER_MARGIN },
    );
    observer.observe(el);
    return () => {
      observer.disconnect(); // явный disconnect при размонтировании (№3)
      intersectingRef.current = false;
    };
  }, []);

  // ---- Синхронизация статусов из useQueries (idle→loading→loaded/paywall/error) ----
  useEffect(() => {
    let changed = false;
    const next = items.map((it, idx) => {
      if (it.status !== 'loading') return it;
      const r = results[idx];
      if (!r) return it;
      if (r.isSuccess && r.data) {
        changed = true;
        // id из detail-ответа (дедупликация исключений), контент в LoadedArticle — из results[idx]
        return { ...it, id: r.data.article.id, status: 'ok' as const };
      }
      if (r.isError) {
        changed = true;
        const err = r.error as { status?: number; body?: { access?: 'auth' | 'tariff' } } | null;
        if (err?.status === 403 && err.body?.access) {
          return { ...it, status: 'paywall' as const, access: err.body.access };
        }
        return { ...it, status: 'error' as const }; // считается в лимит 3 (иначе зациклимся на битых slug)
      }
      return it;
    });
    loadingRef.current = next.some((i) => i.status === 'loading'); // инвариант №2
    if (!changed) return;
    itemsRef.current = next;
    setItems(next);
    // sentinel всё ещё во вьюпорте, а loading освободился → грузим следующую
    // (нового события IntersectionObserver не будет — DOM под sentinel'ом не менялся)
    if (intersectingRef.current) pumpRef.current();
  }, [results, items]);

  // ---- URL/title: replaceState + setArticleTitle на последнюю успешно загруженную (ok) ----
  useEffect(() => {
    const okItems = items.filter((i) => i.status === 'ok');
    const last = okItems[okItems.length - 1];
    if (!last) return;
    const key = `${last.type}/${last.slug}`;
    if (lastOkKeyRef.current === key) return;
    lastOkKeyRef.current = key;
    window.history.replaceState(null, '', `/${last.type}/${last.slug}`);
    setArticleTitle(last.title); // полный заголовок, без обрезки
  }, [items]);

  const showSentinel = items.length < MAX_LOADED && (!candidatesLoaded || candidates.length > 0);
  const nextAfterLimit = items.length >= MAX_LOADED ? candidates[0] : undefined;

  return (
    <div className="mt-12">
      {items.map((it, idx) => {
        // error-вариант: секция не рендерится вовсе (скрытый блок, место не оставляем)
        if (it.status === 'error') return null;
        return (
          <section
            key={`${it.type}/${it.slug}`}
            data-autoload="true"
            className="mt-12 border-t border-[#2a2a2a] pt-8"
          >
            {it.status === 'loading' && (
              <>
                <NextMaterialSeparator />
                <AutoLoadSkeleton />
              </>
            )}
            {it.status === 'paywall' && (
              <>
                <NextMaterialSeparator />
                <Link to={`/${it.type}/${it.slug}`} className="block hover:opacity-90">
                  <h2 className="text-2xl font-bold leading-tight hover:underline">{it.title}</h2>
                </Link>
                {/* собственная центровка max-w-md внутри max-w-3xl статьи — корректно (ТЗ-06 §3.6) */}
                <Paywall access={it.access!} title="Закрытый материал" />
              </>
            )}
            {it.status === 'ok' && results[idx]?.data && <LoadedArticle data={results[idx].data} />}
          </section>
        );
      })}
      {showSentinel && <div ref={sentinelRef} className="h-px" aria-hidden="true" />}
      {nextAfterLimit && (
        <div className="mt-12 text-center">
          <Link
            to={`/${nextAfterLimit.type}/${nextAfterLimit.slug}`}
            className="inline-block rounded-full bg-[#beff00] px-6 py-2.5 font-semibold text-black hover:opacity-85"
          >
            Читать дальше →
          </Link>
        </div>
      )}
    </div>
  );
}
