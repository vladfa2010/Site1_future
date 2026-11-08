import { useEffect, useState } from 'react';
import { api } from '../api';
import { BarChart, RetentionTable } from '../components/MetricsCharts';

interface Overview {
  users: number; reads: number; favorites: number; subscriptions: number;
  dau: number; wau: number; mau: number; reads_30d: number; users_30d: number;
}
interface DayPoint { day: string; n: number; cumulative?: number }

const fmt = (n: number | string) => Number(n).toLocaleString('ru-RU');

export default function MetricsPage() {
  const [days, setDays] = useState(30);
  const [overview, setOverview] = useState<Overview | null>(null);
  const [registrations, setRegistrations] = useState<DayPoint[]>([]);
  const [engagement, setEngagement] = useState<{ favorites: DayPoint[]; subscriptions: DayPoint[]; reads: DayPoint[] } | null>(null);
  const [retention, setRetention] = useState<{ cohorts: { cohort: string; users: number; retention: number[] }[]; weeks: string[] } | null>(null);
  const [topTrends, setTopTrends] = useState<{ id: number; name: string; articles: number; views: number }[]>([]);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setError(null);
    const opts = { days: String(days) };
    void Promise.all([
      api<{ overview: Overview }>('/admin/metrics/overview'),
      api<{ series: DayPoint[] }>(`/admin/metrics/registrations?days=${days}`),
      api<{ favorites: DayPoint[]; subscriptions: DayPoint[]; reads: DayPoint[] }>(`/admin/metrics/engagement?days=${days}`),
      api<{ cohorts: { cohort: string; users: number; retention: number[] }[]; weeks: string[] }>('/admin/metrics/retention'),
      api<{ trends: { id: number; name: string; articles: number; views: number }[] }>(`/admin/metrics/top-trends?days=${days}`),
    ])
      .then(([ov, reg, eng, ret, tt]) => {
        setOverview(ov.overview);
        setRegistrations(reg.series);
        setEngagement(eng);
        setRetention(ret);
        setTopTrends(tt.trends);
      })
      .catch((e) => setError(e instanceof Error ? e.message : 'Ошибка загрузки'));
  }, [days]);

  const stickiness = overview && Number(overview.mau) > 0
    ? Math.round((Number(overview.dau) / Number(overview.mau)) * 100)
    : 0;

  const toSeries = (pts: DayPoint[]) =>
    pts.map((p) => ({ label: String(p.day).slice(5), value: Number(p.n) }));

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-bold">Метрики продукта</h1>
        <select className="input max-w-[140px]" value={days} onChange={(e) => setDays(Number(e.target.value))}>
          {[7, 14, 30, 60, 90].map((d) => <option key={d} value={d}>за {d} дней</option>)}
        </select>
      </div>
      {error && <p className="rounded-lg bg-red-500/10 px-3 py-2 text-sm text-red-400">{error}</p>}

      {/* KPI-карточки */}
      {overview && (
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4 lg:grid-cols-8">
          <Kpi label="Всего юзеров" value={fmt(overview.users)} />
          <Kpi label="Новых за 30д" value={fmt(overview.users_30d)} accent />
          <Kpi label="DAU" value={fmt(overview.dau)} />
          <Kpi label="WAU" value={fmt(overview.wau)} />
          <Kpi label="MAU" value={fmt(overview.mau)} />
          <Kpi label="Stickiness" value={`${stickiness}%`} hint="DAU/MAU" />
          <Kpi label="Прочтений" value={fmt(overview.reads)} />
          <Kpi label="Прочт. 30д" value={fmt(overview.reads_30d)} />
        </div>
      )}

      <div className="grid gap-4 lg:grid-cols-2">
        {/* Регистрации */}
        <section className="card space-y-2">
          <h2 className="font-semibold">Регистрации <span className="text-xs font-normal text-zinc-500">— столбцы: новые, линия: всего</span></h2>
          <BarChart series={toSeries(registrations)} line={registrations.map((r) => Number(r.cumulative ?? 0))} />
        </section>

        {/* Вовлечение */}
        <section className="card space-y-3">
          <h2 className="font-semibold">Вовлечение: прочтения / избранное / подписки</h2>
          {engagement && (
            <>
              <div>
                <span className="text-xs text-zinc-500">Прочтения</span>
                <BarChart series={toSeries(engagement.reads)} color="#8ab4ff" height={90} />
              </div>
              <div>
                <span className="text-xs text-zinc-500">Избранное</span>
                <BarChart series={toSeries(engagement.favorites)} color="#ffb74d" height={70} />
              </div>
              <div>
                <span className="text-xs text-zinc-500">Подписки</span>
                <BarChart series={toSeries(engagement.subscriptions)} color="#ce93d8" height={70} />
              </div>
            </>
          )}
        </section>
      </div>

      {/* Retention */}
      <section className="card space-y-2">
        <h2 className="font-semibold">Удержание: когортный retention <span className="text-xs font-normal text-zinc-500">(8 последних недель)</span></h2>
        {retention && <RetentionTable cohorts={retention.cohorts} weeks={retention.weeks} />}
      </section>

      {/* Рейтинг тем */}
      <section className="card space-y-2">
        <h2 className="font-semibold">Рейтинг тем <span className="text-xs font-normal text-zinc-500">— тренды по просмотрам за {days} дн.</span></h2>
        {topTrends.length === 0 ? (
          <p className="text-sm text-zinc-600">Нет данных.</p>
        ) : (
          <ol className="space-y-1.5">
            {topTrends.map((t, i) => {
              const maxViews = Math.max(1, Number(topTrends[0].views));
              return (
                <li key={t.id} className="flex items-center gap-3 text-sm">
                  <span className="w-6 text-right text-zinc-500">{i + 1}.</span>
                  <span className="w-52 truncate font-medium">{t.name}</span>
                  <span className="flex-1">
                    <span
                      className="block h-4 rounded-sm bg-[#beff00]/70"
                      style={{ width: `${Math.max(2, (Number(t.views) / maxViews) * 100)}%` }}
                    />
                  </span>
                  <span className="w-16 text-right tabular-nums text-zinc-300">{fmt(t.views)}</span>
                  <span className="w-20 text-right text-xs text-zinc-500">{t.articles} ст.</span>
                </li>
              );
            })}
          </ol>
        )}
      </section>
    </div>
  );
}

function Kpi({ label, value, hint, accent }: { label: string; value: string; hint?: string; accent?: boolean }) {
  return (
    <div className={`rounded-lg border p-3 ${accent ? 'border-[#beff00]/40 bg-[#beff00]/5' : 'border-zinc-800 bg-zinc-900'}`}>
      <p className="text-[11px] uppercase tracking-wide text-zinc-500">{label}</p>
      <p className={`mt-1 text-xl font-bold tabular-nums ${accent ? 'text-[#c9ff2a]' : 'text-zinc-100'}`}>{value}</p>
      {hint && <p className="text-[10px] text-zinc-600">{hint}</p>}
    </div>
  );
}
