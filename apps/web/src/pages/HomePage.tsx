import { Link } from 'react-router';
import { useQuery } from '@tanstack/react-query';
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

export default function HomePage() {
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
      <Section title="Тренды" itemsCount={(trends?.trends.length ?? 0) + 1}>
        <div className={CAROUSEL_ITEM}>
          <div className="flex aspect-[3/4] w-full flex-col rounded-lg border border-[#beff00]/30 bg-gradient-to-br from-zinc-900 to-zinc-950 p-5">
            <h3 className="text-xl font-bold uppercase tracking-wide text-[#c9ff2a]">Тренды</h3>
            <p className="mt-3 text-sm leading-relaxed text-zinc-300">
              То, что уже меняет мир. Великие идеи, инновации, новые сектора в экономике. То, о чем
              большинство узнают в будущем… а ты сейчас!
            </p>
            <Link
              to="/portfolio"
              className="mt-auto rounded-full bg-[#beff00] px-4 py-2 text-center text-sm font-bold text-zinc-950 hover:bg-[#c9ff2a]"
            >
              Посмотреть в будущее
            </Link>
          </div>
        </div>
        {trends?.trends.slice(0, 12).map((t) => (
          <Link key={t.slug} to={`/trend/${t.slug}`} className={`group ${CAROUSEL_ITEM}`}>
            <div className="relative flex aspect-[3/4] w-full flex-col justify-end overflow-hidden rounded-lg border border-[#2a2a2a] bg-gradient-to-br from-zinc-800 to-zinc-900 p-4 transition-colors group-hover:border-[#beff00]/50">
              {t.coverUrl && (
                <img
                  src={t.coverUrl}
                  alt={t.name}
                  loading="lazy"
                  className="absolute inset-0 h-full w-full object-cover"
                />
              )}
              <div className="absolute inset-0 bg-gradient-to-t from-zinc-950 via-zinc-950/40 to-transparent" />
              <div className="relative">
                <span className="text-xs uppercase tracking-wide text-[#c9ff2a]">Тренд</span>
                <h3 className="mt-1 text-xl font-bold">{t.name}</h3>
                {t.description && (
                  <p className="mt-2 line-clamp-3 text-sm text-zinc-400">{t.description.replace(/<[^>]*>/g, ' ')}</p>
                )}
              </div>
            </div>
          </Link>
        ))}
      </Section>

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
