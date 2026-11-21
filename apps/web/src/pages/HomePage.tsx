import React, { Suspense, lazy, useEffect, useMemo, useRef, useState } from 'react';
import { Link, useNavigate } from 'react-router';
import { useQuery } from '@tanstack/react-query';

// Parallax-карусель трендов (reactbits pro, WebGL): three.js тяжёлый — грузим по требованию
const ParallaxCarousel = lazy(() => import('../components/react-bits/parallax-carousel'));
import { api } from '../api';
import { ArticleCard, TYPE_LABELS } from '../components/ArticleCard';
import { NewsCard } from '../components/NewsCard';
import { IdeaCard } from '../components/IdeaCard';
import { Carousel, CAROUSEL_ITEM } from '../components/Carousel';
import { CoverThumb } from '../components/CoverThumb';
import { ABOUT_PAGES } from '../data/about';
import { TelegramConnectBanner } from '../components/TelegramConnect';

/** Секция с заголовком, ссылкой «все →» и каруселью. Пустые секции не рендерятся (4.3). */
function Section({
  title,
  linkTo,
  children,
  itemsCount,
}: {
  title: string;
  linkTo?: string;
  children: React.ReactNode;
  itemsCount: number;
}) {
  if (itemsCount === 0) return null;
  return (
    <section>
      <div className="mb-4 flex items-baseline justify-between">
        <h2 className="text-lg font-semibold uppercase tracking-wide text-zinc-400">{title}</h2>
        {linkTo && <Link to={linkTo} className="text-sm">все →</Link>}
      </div>
      <Carousel>{children}</Carousel>
    </section>
  );
}

// ЗНАНИЯ — баннеры как у донора (большие карточки с фоном)
const KNOWLEDGE = [
  { title: 'Инвестиционный курс «Отправь свои деньги на работу»', desc: 'Система от первой сделки до портфеля', bg: 'from-[#9ed100]/40 to-zinc-900' },
  { title: 'Клуб «Инсайдер»', desc: 'Закрытое сообщество: идеи раньше, разборы глубже', bg: 'from-violet-600/40 to-zinc-900' },
  { title: 'Личная консультация', desc: 'Разбор вашего портфеля и стратегии', bg: 'from-cyan-600/40 to-zinc-900' },
];

/** Деградация без WebGL: вместо белого экрана — обычный список карточек трендов. */
class CarouselBoundary extends React.Component<{ children: React.ReactNode; fallback: React.ReactNode }, { err: boolean }> {
  state = { err: false };
  static getDerivedStateFromError() {
    return { err: true };
  }
  render() {
    return this.state.err ? this.props.fallback : this.props.children;
  }
}

function TrendsFallback({ trends }: { trends: { slug: string; name: string; coverUrl: string | null }[] }) {
  return (
    <div className="flex gap-4 overflow-x-auto pb-2">
      {trends.map((t) => (
        <Link key={t.slug} to={`/trend/${t.slug}`} className="group w-[240px] shrink-0">
          <div className="relative flex aspect-[3/4] w-full flex-col justify-end overflow-hidden rounded-lg border border-[#2a2a2a] bg-gradient-to-br from-zinc-800 to-zinc-900 p-4 group-hover:border-[#beff00]/50">
            {t.coverUrl && <img src={t.coverUrl} alt={t.name} loading="lazy" className="absolute inset-0 h-full w-full object-cover" />}
            <div className="absolute inset-0 bg-gradient-to-t from-zinc-950/80 to-transparent" />
            <h3 className="relative text-lg font-bold uppercase tracking-wide text-[#c9ff2a]">{t.name}</h3>
          </div>
        </Link>
      ))}
    </div>
  );
}

export default function HomePage() {
  const navigate = useNavigate();
  // prefers-reduced-motion: автоплей выключаем по системной настройке
  const reduceMotion = useMemo(
    () => (typeof window !== 'undefined' ? window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false : false),
    [],
  );
  // пауза рендера карусели вне вьюпорта (батарея/вентилятор)
  const carouselWrapRef = useRef<HTMLDivElement>(null);
  const [carouselInView, setCarouselInView] = useState(true);
  const [carouselReady, setCarouselReady] = useState(false); // скелетон пока текстуры не собрались
  useEffect(() => {
    const el = carouselWrapRef.current;
    if (!el || typeof IntersectionObserver === 'undefined') return;
    const io = new IntersectionObserver(([e]) => setCarouselInView(e.isIntersecting), { threshold: 0.05 });
    io.observe(el);
    return () => io.disconnect();
  }, []);

  const q = {
    trends: useQuery({ queryKey: ['trends'], queryFn: () => api.trends() }),
    feed: useQuery({ queryKey: ['feed'], queryFn: () => api.articles() }), // лента событий: все типы, свежие сверху
    news: useQuery({ queryKey: ['news'], queryFn: () => api.articles('novost') }),
    pipeline: useQuery({ queryKey: ['scr', 'pipeline'], queryFn: () => api.screener({ phase: 'pipeline' }) }),
    portfel: useQuery({ queryKey: ['scr', 'portfel'], queryFn: () => api.screener({ phase: 'portfel' }) }),
    arhiv: useQuery({ queryKey: ['scr', 'arhiv'], queryFn: () => api.screener({ phase: 'arhiv' }) }),
    ai: useQuery({ queryKey: ['scr', 'ai'], queryFn: () => api.screener({ industry: 'ai' }) }),
    interesnoe: useQuery({ queryKey: ['interesnoe'], queryFn: () => api.articles('interesnoe') }),
    analitika: useQuery({ queryKey: ['analitika'], queryFn: () => api.articles('analitika') }),
  };
  const { data: trends } = q.trends;

  // мемо: структурно те же данные → тот же массив (аудит: inline-items пересоздавали текстуры 22 плоскостей)
  const trendItems = useMemo(
    () =>
      (trends?.trends ?? []).map((t) => ({
        src: t.coverUrl ?? '',
        label: t.name,
        description: t.description
          ? t.description.replace(/<(script|style|noscript)[\s\S]*?<\/\1>/gi, ' ').replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 160)
          : undefined,
        href: `/trend/${t.slug}`,
      })),
    [trends],
  );
  const { data: feed } = q.feed;
  const { data: news } = q.news;
  const { data: pipeline } = q.pipeline;
  const { data: portfel } = q.portfel;
  const { data: arhiv } = q.arhiv;
  const { data: ai } = q.ai;
  const { data: interesnoe } = q.interesnoe;
  const { data: analitika } = q.analitika;
  // Ошибка загрузки видна пользователю, а не маскируется пустой страницей
  const loadError = Object.values(q).some((x) => x.isError);

  return (
    <div className="space-y-12">
      {/* Герой — как у донора */}
      <header className="py-8 text-center">
        <h1 className="text-3xl font-bold sm:text-4xl">Будущее, которое нельзя упустить</h1>
        <p className="mx-auto mt-3 max-w-2xl text-zinc-400">
          Тренды, инновации и сделки, которые меняют мир. Инвестиции в мировое будущее: роботы,
          искусственный интеллект, космос.
        </p>
      </header>

      {loadError && (
        <p className="rounded-lg border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm text-red-400">
          Не удалось загрузить данные с сервера. Проверьте, что API запущен (npm run dev в корне проекта).
        </p>
      )}

      {/* «Кто мы и зачем» — блок из 4 карточек, как у донора */}
      <section>
        <div className="mb-4 flex items-baseline justify-between">
          <h2 className="text-lg font-semibold uppercase tracking-wide text-zinc-400">Кто мы и зачем</h2>
        </div>
        <Carousel>
          {ABOUT_PAGES.map((p) => (
            <Link key={p.slug} to={`/${p.slug}`} className={CAROUSEL_ITEM}>
              <CoverThumb title={p.title} coverUrl={p.image} />
              <p className="mt-2 line-clamp-2 text-sm text-zinc-400">{p.paragraphs[0]}</p>
            </Link>
          ))}
        </Carousel>
      </section>

      {/* ТРЕНДЫ — спецкарточка «что такое тренд» + карточки трендов, как у донора */}
      {/* Тренды: WebGL Parallax-карусель (reactbits pro). Плоскость = обложка тренда,
          клик — на лендинг тренда; подпись центральной плоскости — снизу слева. */}
      {trends && trends.trends.length > 0 && (
        <section>
          <div className="mb-4 flex items-baseline justify-between">
            <h2 className="text-lg font-semibold uppercase tracking-wide text-zinc-400">Тренды</h2>
            <Link to="/trends" className="text-sm">все →</Link>
          </div>
          {/* мобильный интро — статичным блоком НАД каруселью (оверлей — только sm+) */}
          <div className="mb-3 sm:hidden">
            <h3 className="text-xl font-bold uppercase tracking-wide text-[#c9ff2a]">Тренды</h3>
            <p className="mt-2 text-sm leading-relaxed text-zinc-300">
              То, что уже меняет мир. Великие идеи, инновации, новые сектора в экономике. То, о чем
              большинство узнают в будущем… а ты сейчас!
            </p>
            <Link
              to="/trends"
              className="mt-3 block w-full rounded-full bg-[#beff00] px-4 py-2 text-center text-sm font-bold text-zinc-950 hover:bg-[#c9ff2a]"
            >
              Посмотреть в будущее
            </Link>
          </div>
          <div ref={carouselWrapRef} className="relative h-[340px] overflow-hidden rounded-2xl sm:h-[440px]">
            {/* интро-блок слева: не карточка, а полоса с затемнением — тренды визуально уходят В НЕЁ */}
            {/* доступность: canvas недостижим с клавиатуры — дублируем ссылки screen-reader'ом */}
            <ul className="sr-only">
              {trends.trends.map((t) => (
                <li key={t.slug}><Link to={`/trend/${t.slug}`}>{t.name}</Link></li>
              ))}
            </ul>
            {/* твёрдая зона — ровно ширине карточки (240px), дальше затухание к прозрачному */}
            <div className="pointer-events-none absolute inset-y-0 left-0 z-10 hidden w-[248px] flex-col justify-between bg-[linear-gradient(to_right,#09090b_0px,#09090b_192px,rgba(9,9,11,0)_248px)] p-5 pr-8 sm:flex">
              {/* колонка текста — ровно ширине карточки (240px), как у карточек трендов */}
              <div className="pointer-events-auto w-[192px]">
                <h3 className="text-xl font-bold uppercase tracking-wide text-[#c9ff2a]">Тренды</h3>
                <p className="mt-3 text-sm leading-relaxed text-zinc-300">
                  То, что уже меняет мир. Великие идеи, инновации, новые сектора в экономике. То, о чем
                  большинство узнают в будущем… а ты сейчас!
                </p>
              </div>
              <Link
                to="/trends"
                className="pointer-events-auto block w-[192px] rounded-full bg-[#beff00] px-4 py-2 text-center text-sm font-bold text-zinc-950 hover:bg-[#c9ff2a]"
              >
                Посмотреть в будущее
              </Link>
            </div>
            {/* скелетон: стильные карточки-заглушки с бегущим бликом, пока собираются текстуры */}
            {!carouselReady && (
              <div className="absolute inset-0 z-10 flex items-center gap-5 overflow-hidden rounded-2xl px-1" aria-hidden="true">
                {[0, 1, 2].map((i) => (
                  <div key={i} className="skeleton-card h-[320px] w-[240px] shrink-0 rounded-2xl" />
                ))}
              </div>
            )}
            <Suspense fallback={<div className="flex h-full items-center justify-center rounded-lg border border-[#2a2a2a] text-zinc-500">Загружаем карусель…</div>}>
              <CarouselBoundary fallback={<div className="relative z-20 h-full bg-zinc-950 p-2"><TrendsFallback trends={trends.trends} /></div>}>
              <ParallaxCarousel
                items={trendItems}
                imageWidth={240}
                imageHeight={320}
                gap={20}
                borderRadius={16}
                parallaxIntensity={0.1}
                uvScale={0.65}
                loop
                autoplaySpeed={reduceMotion ? 0 : 18}
                pauseOnHover
                paused={!carouselInView}
                onReady={() => setCarouselReady(true)}
                showProgress={false}
                onItemClick={(i) => {
                  const t = trends.trends[i];
                  if (t) navigate(`/trend/${t.slug}`);
                }}
              />
              </CarouselBoundary>
            </Suspense>
          </div>
        </section>
      )}

      {/* ЛЕНТА СОБЫТИЙ — компактная хронология всех типов, как у донора */}
      {(feed?.articles.length ?? 0) > 0 && (
        <section>
          <p className="mb-1 text-sm text-zinc-500">Наш фокус внимания на происходящем в мире. Самое свежее – первое в списке</p>
          <div className="mb-4 flex items-baseline justify-between">
            <h2 className="text-lg font-semibold uppercase tracking-wide text-zinc-400">Лента событий</h2>
          </div>
          <ol className="divide-y divide-[#2a2a2a]/60">
            {feed?.articles.slice(0, 20).map((a) => (
              <li key={a.id}>
                <Link to={`/${a.type}/${a.slug}`} className="group flex items-baseline gap-3 py-2.5">
                  <span className="shrink-0 rounded-full bg-zinc-800/80 px-2 py-0.5 text-xs text-zinc-400">
                    {TYPE_LABELS[a.type] ?? a.type}
                  </span>
                  <span className="flex-1 truncate text-zinc-200 group-hover:text-[#d6ff5c]">{a.title}</span>
                  <span className="shrink-0 text-xs text-zinc-600">{a.publishedAt?.slice(0, 10)}</span>
                </Link>
              </li>
            ))}
          </ol>
        </section>
      )}

      {/* Свежие новости — широкие карточки как у донора (картинка сверху, лид снизу) */}
      <Section title="Свежие новости" linkTo="/novost" itemsCount={news?.articles.length ?? 0}>        {news?.articles.slice(0, 12).map((a) => (
          <div key={a.id} className={CAROUSEL_ITEM}><NewsCard article={a} /></div>
        ))}
      </Section>

      {/* Пайплайн венчурного портфеля */}
      <Section title="Пайплайн" linkTo="/portfolio?phase=pipeline" itemsCount={(pipeline?.total ?? 0) + 1}>
        <div className={CAROUSEL_ITEM}>
          <div className="flex aspect-[3/4] w-full flex-col rounded-lg border border-[#beff00]/30 bg-gradient-to-br from-zinc-900 to-zinc-950 p-5">
            <h3 className="text-xl font-bold uppercase tracking-wide text-[#c9ff2a]">Пайплайн</h3>
            <p className="mt-3 text-sm leading-relaxed text-zinc-300">
              Идеи, которые мы уже отслеживаем и готовим к сделке. Путь каждой: от глобального тренда —
              через компанию и стадию — до публичного архива.
            </p>
            <Link
              to="/portfolio?phase=pipeline"
              className="mt-auto rounded-full bg-[#beff00] px-4 py-2 text-center text-sm font-bold text-zinc-950 hover:bg-[#c9ff2a]"
            >
              Смотреть пайплайн
            </Link>
          </div>
        </div>
        {pipeline?.ideas.slice(0, 12).map((i) => (
          <div key={i.id} className={CAROUSEL_ITEM}><IdeaCard idea={i} /></div>
        ))}
      </Section>

      <Section title="Наш портфель" linkTo="/portfolio?phase=portfel" itemsCount={(portfel?.total ?? 0) + 1}>
        <div className={CAROUSEL_ITEM}>
          <div className="flex aspect-[3/4] w-full flex-col rounded-lg border border-[#beff00]/30 bg-gradient-to-br from-zinc-900 to-zinc-950 p-5">
            <h3 className="text-xl font-bold uppercase tracking-wide text-[#c9ff2a]">Наш портфель</h3>
            <p className="mt-3 text-sm leading-relaxed text-zinc-300">
              Портфель сообщества: идеи, за которыми мы следим и которые вошли в фокус внимания
              участников. Вместе мы замечаем больше, чем каждый по отдельности.
            </p>
            <Link
              to="/portfolio?phase=portfel"
              className="mt-auto rounded-full bg-[#beff00] px-4 py-2 text-center text-sm font-bold text-zinc-950 hover:bg-[#c9ff2a]"
            >
              Смотреть портфель
            </Link>
          </div>
        </div>
        {portfel?.ideas.slice(0, 12).map((i) => (
          <div key={i.id} className={CAROUSEL_ITEM}><IdeaCard idea={i} /></div>
        ))}
      </Section>

      {/* CTA-баннер как у донора */}
      <div className="relative overflow-hidden rounded-xl border border-[#beff00]/30 bg-gradient-to-r from-[#9ed100]/20 via-zinc-900 to-zinc-900 p-8 text-center sm:p-12">
        <h2 className="text-2xl font-bold">Не упусти возможность</h2>
        <p className="mx-auto mt-2 max-w-xl text-zinc-400">
          Идеи и сделки из мира будущего — в одном портфеле. От глобального тренда до сделки.
        </p>
        <Link to="/portfolio" className="mt-5 inline-block rounded-full bg-[#beff00] px-6 py-2.5 font-semibold text-zinc-950 hover:bg-[#c9ff2a]">
          Смотреть портфель
        </Link>
      </div>

      <Section title="Архив идей" linkTo="/portfolio?phase=arhiv" itemsCount={(arhiv?.total ?? 0) + 1}>
        <div className={CAROUSEL_ITEM}>
          <div className="flex aspect-[3/4] w-full flex-col rounded-lg border border-[#beff00]/30 bg-gradient-to-br from-zinc-900 to-zinc-950 p-5">
            <h3 className="text-xl font-bold uppercase tracking-wide text-[#c9ff2a]">Архив идей</h3>
            <p className="mt-3 text-sm leading-relaxed text-zinc-300">
              Идея созрела и завершила путь: IPO, крупная сделка или, наоборот, закрытие.
              Итог каждой истории — опыт, на котором растёт портфель.
            </p>
            <Link
              to="/portfolio?phase=arhiv"
              className="mt-auto rounded-full bg-[#beff00] px-4 py-2 text-center text-sm font-bold text-zinc-950 hover:bg-[#c9ff2a]"
            >
              Смотреть архив
            </Link>
          </div>
        </div>
        {arhiv?.ideas.slice(0, 12).map((i) => (
          <div key={i.id} className={CAROUSEL_ITEM}><IdeaCard idea={i} /></div>
        ))}
      </Section>

      {/* ЗНАНИЯ — баннеры */}
      <Section title="Знания" itemsCount={KNOWLEDGE.length}>
        {KNOWLEDGE.map((k) => (
          <div key={k.title} className={`relative flex aspect-[3/4] w-full flex-col justify-end overflow-hidden rounded-lg bg-gradient-to-br p-5 ${k.bg} ${CAROUSEL_ITEM}`}>
            <h3 className="text-lg font-bold leading-snug">{k.title}</h3>
            <p className="mt-2 text-sm text-zinc-300">{k.desc}</p>
            <span className="mt-3 inline-block w-fit rounded-full bg-black/60 px-4 py-1.5 text-sm font-semibold text-[#c9ff2a]">
              Подробнее
            </span>
          </div>
        ))}
      </Section>

      <Section title="ИИ" linkTo="/portfolio?industry=ai" itemsCount={ai?.total ?? 0}>
        {ai?.ideas.slice(0, 12).map((i) => (
          <div key={i.id} className={CAROUSEL_ITEM}><IdeaCard idea={i} /></div>
        ))}
      </Section>

      <Section title="Интересное" linkTo="/interesnoe" itemsCount={interesnoe?.articles.length ?? 0}>
        {interesnoe?.articles.slice(0, 12).map((a) => (
          <div key={a.id} className={CAROUSEL_ITEM}><ArticleCard article={a} /></div>
        ))}
      </Section>

      <Section title="Аналитика" linkTo="/analitika" itemsCount={analitika?.articles.length ?? 0}>
        {analitika?.articles.slice(0, 12).map((a) => (
          <div key={a.id} className={CAROUSEL_ITEM}><ArticleCard article={a} /></div>
        ))}
      </Section>

      {/* Виджет подключения Telegram-бота (как в PULSE — на главной) */}
      <TelegramConnectBanner />
    </div>
  );
}
