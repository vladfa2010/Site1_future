import { Link } from 'react-router';
import { useQuery } from '@tanstack/react-query';
import { api } from '../api';
import { ArticleCard } from '../components/ArticleCard';
import { IdeaCard } from '../components/IdeaCard';
import { Carousel, CAROUSEL_ITEM } from '../components/Carousel';

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
  { title: 'Инвестиционный курс «Отправь свои деньги на работу»', desc: 'Система от первой сделки до портфеля', bg: 'from-orange-600/40 to-zinc-900' },
  { title: 'Клуб «Инсайдер»', desc: 'Закрытое сообщество: идеи раньше, разборы глубже', bg: 'from-violet-600/40 to-zinc-900' },
  { title: 'Личная консультация', desc: 'Разбор вашего портфеля и стратегии', bg: 'from-cyan-600/40 to-zinc-900' },
];

export default function HomePage() {
  const { data: trends } = useQuery({ queryKey: ['trends'], queryFn: () => api.trends() });
  const { data: news } = useQuery({ queryKey: ['news'], queryFn: () => api.articles('novost') });
  const { data: pipeline } = useQuery({ queryKey: ['scr', 'pipeline'], queryFn: () => api.screener({ phase: 'pipeline' }) });
  const { data: portfel } = useQuery({ queryKey: ['scr', 'portfel'], queryFn: () => api.screener({ phase: 'portfel' }) });
  const { data: arhiv } = useQuery({ queryKey: ['scr', 'arhiv'], queryFn: () => api.screener({ phase: 'arhiv' }) });
  const { data: ai } = useQuery({ queryKey: ['scr', 'ai'], queryFn: () => api.screener({ industry: 'ai' }) });
  const { data: interesnoe } = useQuery({ queryKey: ['interesnoe'], queryFn: () => api.articles('interesnoe') });
  const { data: analitika } = useQuery({ queryKey: ['analitika'], queryFn: () => api.articles('analitika') });

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

      {/* ТРЕНДЫ — карточки трендов */}
      <Section title="Тренды" linkTo="/portfolio" itemsCount={trends?.trends.length ?? 0}>
        {trends?.trends.slice(0, 12).map((t) => (
          <Link key={t.slug} to={`/trend/${t.slug}`} className={`group ${CAROUSEL_ITEM}`}>
            <div className="relative flex aspect-[3/4] w-full flex-col justify-end overflow-hidden rounded-lg border border-zinc-800 bg-gradient-to-br from-zinc-800 to-zinc-900 p-4 transition-colors group-hover:border-orange-500/50">
              <span className="text-xs uppercase tracking-wide text-orange-400">Тренд</span>
              <h3 className="mt-1 text-xl font-bold">{t.name}</h3>
              {t.description && (
                <p className="mt-2 line-clamp-3 text-sm text-zinc-400">{t.description.replace(/<[^>]*>/g, ' ')}</p>
              )}
            </div>
          </Link>
        ))}
      </Section>

      {/* Свежие новости — карусель с обложками */}
      <Section title="Свежие новости" linkTo="/novost" itemsCount={news?.articles.length ?? 0}>
        {news?.articles.slice(0, 12).map((a) => (
          <div key={a.id} className={CAROUSEL_ITEM}><ArticleCard article={a} /></div>
        ))}
      </Section>

      {/* Пайплайн венчурного портфеля */}
      <Section title="Пайплайн" linkTo="/portfolio?phase=pipeline" itemsCount={pipeline?.total ?? 0}>
        {pipeline?.ideas.slice(0, 12).map((i) => (
          <div key={i.id} className={CAROUSEL_ITEM}><IdeaCard idea={i} /></div>
        ))}
      </Section>

      <Section title="Наш портфель" linkTo="/portfolio?phase=portfel" itemsCount={portfel?.total ?? 0}>
        {portfel?.ideas.slice(0, 12).map((i) => (
          <div key={i.id} className={CAROUSEL_ITEM}><IdeaCard idea={i} /></div>
        ))}
      </Section>

      {/* CTA-баннер как у донора */}
      <div className="relative overflow-hidden rounded-xl border border-orange-500/30 bg-gradient-to-r from-orange-600/20 via-zinc-900 to-zinc-900 p-8 text-center sm:p-12">
        <h2 className="text-2xl font-bold">Не упусти возможность</h2>
        <p className="mx-auto mt-2 max-w-xl text-zinc-400">
          Идеи и сделки из мира будущего — в одном портфеле. От глобального тренда до сделки.
        </p>
        <Link to="/portfolio" className="mt-5 inline-block rounded-full bg-orange-500 px-6 py-2.5 font-semibold text-zinc-950 hover:bg-orange-400">
          Смотреть портфель
        </Link>
      </div>

      <Section title="Архив идей" linkTo="/portfolio?phase=arhiv" itemsCount={arhiv?.total ?? 0}>
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
            <span className="mt-3 inline-block w-fit rounded-full bg-zinc-950/60 px-4 py-1.5 text-sm font-semibold text-orange-400">
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
    </div>
  );
}
