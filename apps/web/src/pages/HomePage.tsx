import { Link } from 'react-router';
import { useQuery } from '@tanstack/react-query';
import { api } from '../api';
import { ArticleCard } from '../components/ArticleCard';
import { IdeaCard } from '../components/IdeaCard';

/** Секция с заголовком, ссылкой «все →» и сеткой. Пустые секции не рендерятся (4.3). */
function Section({
  title,
  linkTo,
  linkText = 'все →',
  children,
  itemsCount,
}: {
  title: string;
  linkTo?: string;
  linkText?: string;
  children: React.ReactNode;
  itemsCount: number;
}) {
  if (itemsCount === 0) return null;
  return (
    <section>
      <div className="mb-4 flex items-baseline justify-between">
        <h2 className="text-lg font-semibold uppercase tracking-wide text-zinc-400">{title}</h2>
        {linkTo && <Link to={linkTo} className="text-sm">{linkText}</Link>}
      </div>
      {children}
    </section>
  );
}

const GRID = 'grid gap-4 sm:grid-cols-2 lg:grid-cols-3';

// ЗНАНИЯ — статические продукты (как у донора)
const KNOWLEDGE = [
  { title: 'Клуб «Инсайдер»', desc: 'Закрытое сообщество: идеи раньше, разборы глубже' },
  { title: 'Личная консультация', desc: 'Разбор вашего портфеля и стратегии' },
  { title: 'Инвестиционный курс «Отправь свои деньги на работу»', desc: 'Система от первой сделки до портфеля' },
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

      {/* ТРЕНДЫ — карточки трендов + свежие новости */}
      <Section title="Тренды" itemsCount={trends?.trends.length ?? 0}>
        <div className={GRID}>
          {trends?.trends.slice(0, 8).map((t) => (
            <Link key={t.slug} to={`/trend/${t.slug}`} className="block rounded-lg border border-zinc-800 bg-zinc-900 p-4 transition-colors hover:border-orange-500/50">
              <span className="text-xs uppercase tracking-wide text-zinc-500">Тренд</span>
              <h3 className="mt-1 font-semibold">{t.name}</h3>
              {t.description && <p className="mt-2 line-clamp-2 text-sm text-zinc-400">{t.description.replace(/<[^>]*>/g, ' ')}</p>}
            </Link>
          ))}
        </div>
      </Section>

      <Section title="Свежие новости" linkTo="/novost" itemsCount={news?.articles.length ?? 0}>
        <div className={GRID}>
          {news?.articles.slice(0, 6).map((a) => <ArticleCard key={a.id} article={a} />)}
        </div>
      </Section>

      {/* Пайплайн венчурного портфеля (раздел 4.1) */}
      <Section title="Пайплайн" linkTo="/portfolio?phase=pipeline" itemsCount={pipeline?.total ?? 0}>
        <div className={GRID}>{pipeline?.ideas.slice(0, 6).map((i) => <IdeaCard key={i.id} idea={i} />)}</div>
      </Section>

      <Section title="Наш портфель" linkTo="/portfolio?phase=portfel" itemsCount={portfel?.total ?? 0}>
        <div className={GRID}>{portfel?.ideas.slice(0, 6).map((i) => <IdeaCard key={i.id} idea={i} />)}</div>
      </Section>

      {/* CTA как у донора */}
      <div className="rounded-lg border border-orange-500/30 bg-orange-500/5 p-6 text-center">
        <h2 className="text-xl font-bold">Не упусти возможность</h2>
        <p className="mt-2 text-zinc-400">Идеи и сделки из мира будущего — в одном портфеле</p>
      </div>

      <Section title="Архив идей" linkTo="/portfolio?phase=arhiv" itemsCount={arhiv?.total ?? 0}>
        <div className={GRID}>{arhiv?.ideas.slice(0, 6).map((i) => <IdeaCard key={i.id} idea={i} />)}</div>
      </Section>

      {/* ЗНАНИЯ — статика */}
      <Section title="Знания" itemsCount={KNOWLEDGE.length}>
        <div className={GRID}>
          {KNOWLEDGE.map((k) => (
            <div key={k.title} className="rounded-lg border border-zinc-800 bg-zinc-900 p-4">
              <h3 className="font-semibold leading-snug">{k.title}</h3>
              <p className="mt-2 text-sm text-zinc-400">{k.desc}</p>
            </div>
          ))}
        </div>
      </Section>

      <Section title="ИИ" linkTo="/portfolio?industry=ai" itemsCount={ai?.total ?? 0}>
        <div className={GRID}>{ai?.ideas.slice(0, 6).map((i) => <IdeaCard key={i.id} idea={i} />)}</div>
      </Section>

      <Section title="Интересное" linkTo="/interesnoe" itemsCount={interesnoe?.articles.length ?? 0}>
        <div className={GRID}>
          {interesnoe?.articles.slice(0, 6).map((a) => <ArticleCard key={a.id} article={a} />)}
        </div>
      </Section>

      <Section title="Аналитика" linkTo="/analitika" itemsCount={analitika?.articles.length ?? 0}>
        <div className={GRID}>
          {analitika?.articles.slice(0, 6).map((a) => <ArticleCard key={a.id} article={a} />)}
        </div>
      </Section>
    </div>
  );
}
