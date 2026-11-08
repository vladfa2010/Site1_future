import { useCallback, useEffect, useState } from 'react';
import { api } from '../api';
import { BarChart, RetentionTable } from '../components/MetricsCharts';

interface Overview {
  users: number; reads: number; favorites: number; subscriptions: number;
  dau: number; wau: number; mau: number; reads_30d: number; users_30d: number;
}
interface DayPoint { day: string; n: number; cumulative?: number }
interface FunnelStep { step: string; count: number; pct_of_prev: number; pct_of_total: number }
interface DailyRetentionRow { cohort: string; users: number; d1: number | null; d7: number | null; d30: number | null }
interface AtRiskUser { id: number; email: string; displayName: string | null; lastView: string; views: number }

const fmt = (n: number | string) => Number(n).toLocaleString('ru-RU');

type SectionName = 'overview' | 'registrations' | 'engagement' | 'retention' | 'retentionDaily' | 'funnel' | 'topTrends' | 'atRiskCounts';
const SECTIONS: SectionName[] = ['overview', 'registrations', 'engagement', 'retention', 'retentionDaily', 'funnel', 'topTrends'];

export default function MetricsPage() {
  const [days, setDays] = useState(30);
  const [data, setData] = useState<Partial<Record<SectionName, unknown>>>({});
  const [loading, setLoading] = useState<Set<SectionName>>(new Set());
  const [errors, setErrors] = useState<string[]>([]);
  const [atRisk, setAtRisk] = useState<{ type: string; label: string; users: AtRiskUser[] } | null>(null);

  // Независимая загрузка секций (как в PULSE): упавшая метрика не роняет страницу
  const loadSection = useCallback(async (section: SectionName) => {
    setLoading((prev) => new Set(prev).add(section));
    try {
      switch (section) {
        case 'overview': {
          const r = await api<{ overview: Overview }>('/admin/metrics/overview');
          setData((p) => ({ ...p, overview: r.overview }));
          break;
        }
        case 'registrations': {
          const r = await api<{ series: DayPoint[] }>(`/admin/metrics/registrations?days=${days}`);
          setData((p) => ({ ...p, registrations: r.series }));
          break;
        }
        case 'engagement': {
          const r = await api<{ favorites: DayPoint[]; subscriptions: DayPoint[]; reads: DayPoint[] }>(`/admin/metrics/engagement?days=${days}`);
          setData((p) => ({ ...p, engagement: r }));
          break;
        }
        case 'retention': {
          const r = await api<{ cohorts: { cohort: string; users: number; retention: number[] }[]; weeks: string[] }>('/admin/metrics/retention');
          setData((p) => ({ ...p, retention: r }));
          break;
        }
        case 'retentionDaily': {
          const r = await api<{ cohorts: DailyRetentionRow[] }>('/admin/metrics/retention-daily');
          setData((p) => ({ ...p, retentionDaily: r.cohorts }));
          break;
        }
        case 'funnel': {
          const r = await api<{ funnel: FunnelStep[] }>(`/admin/metrics/funnel?days=${days}`);
          setData((p) => ({ ...p, funnel: r.funnel }));
          break;
        }
        case 'topTrends': {
          const r = await api<{ trends: { id: number; name: string; articles: number; views: number }[] }>(`/admin/metrics/top-trends?days=${days}`);
          setData((p) => ({ ...p, topTrends: r.trends }));
          break;
        }
      }
    } catch (e) {
      setErrors((prev) => [...prev, `${section}: ${e instanceof Error ? e.message : 'ошибка'}`]);
    } finally {
      setLoading((prev) => { const n = new Set(prev); n.delete(section); return n; });
    }
  }, [days]);

  useEffect(() => {
    setErrors([]);
    SECTIONS.forEach((s, i) => setTimeout(() => void loadSection(s), i * 80)); // staggered, как в PULSE
  }, [loadSection]);

  const openAtRisk = async (type: string, label: string) => {
    const r = await api<{ users: AtRiskUser[] }>(`/admin/metrics/at-risk?type=${type}`);
    setAtRisk({ type, label, users: r.users });
  };

  const overview = data.overview as Overview | undefined;
  const registrations = (data.registrations as DayPoint[] | undefined) ?? [];
  const engagement = data.engagement as { favorites: DayPoint[]; subscriptions: DayPoint[]; reads: DayPoint[] } | undefined;
  const retention = data.retention as { cohorts: { cohort: string; users: number; retention: number[] }[]; weeks: string[] } | undefined;
  const retentionDaily = (data.retentionDaily as DailyRetentionRow[] | undefined) ?? [];
  const funnel = (data.funnel as FunnelStep[] | undefined) ?? [];
  const topTrends = (data.topTrends as { id: number; name: string; articles: number; views: number }[] | undefined) ?? [];

  const stickiness = overview && Number(overview.mau) > 0
    ? Math.round((Number(overview.dau) / Number(overview.mau)) * 100)
    : 0;

  const toSeries = (pts: DayPoint[]) => pts.map((p) => ({ label: String(p.day).slice(5), value: Number(p.n) }));
  const isLoading = (s: SectionName) => loading.has(s);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-bold">Метрики продукта</h1>
        <select className="input max-w-[140px]" value={days} onChange={(e) => setDays(Number(e.target.value))}>
          {[7, 14, 30, 60, 90].map((d) => <option key={d} value={d}>за {d} дней</option>)}
        </select>
      </div>

      {errors.length > 0 && (
        <div className="rounded-lg border border-red-500/30 bg-red-500/10 px-4 py-3">
          <p className="text-sm font-semibold text-red-400">Ошибки загрузки секций</p>
          <ul className="mt-1 space-y-0.5">{errors.map((e, i) => <li key={i} className="text-xs text-red-300">{e}</li>)}</ul>
          <button onClick={() => setErrors([])} className="mt-2 text-xs text-red-400 underline">Скрыть</button>
        </div>
      )}

      {/* KPI */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4 lg:grid-cols-8">
        <Kpi label="Всего юзеров" value={overview ? fmt(overview.users) : '…'} loading={isLoading('overview')} />
        <Kpi label="Новых за 30д" value={overview ? fmt(overview.users_30d) : '…'} accent loading={isLoading('overview')} />
        <Kpi label="DAU" value={overview ? fmt(overview.dau) : '…'} loading={isLoading('overview')} />
        <Kpi label="WAU" value={overview ? fmt(overview.wau) : '…'} loading={isLoading('overview')} />
        <Kpi label="MAU" value={overview ? fmt(overview.mau) : '…'} loading={isLoading('overview')} />
        <Kpi label="Stickiness" value={overview ? `${stickiness}%` : '…'} hint="DAU/MAU" loading={isLoading('overview')} />
        <Kpi label="Прочтений" value={overview ? fmt(overview.reads) : '…'} loading={isLoading('overview')} />
        <Kpi label="Избранное / Подписки" value={overview ? `${fmt(overview.favorites)} / ${fmt(overview.subscriptions)}` : '…'} loading={isLoading('overview')} />
      </div>

      {/* Группы риска (клик → список, как в PULSE) */}
      <section className="card space-y-2">
        <h2 className="font-semibold">Группы риска <span className="text-xs font-normal text-zinc-500">— клик: список юзеров</span></h2>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
          <button onClick={() => void openAtRisk('dormant_7d', 'Не заходили 7+ дней')} className="rounded-lg border border-amber-500/30 bg-amber-500/5 p-4 text-left transition-colors hover:bg-amber-500/10">
            <p className="text-xl font-bold text-amber-400">?</p>
            <p className="text-xs text-zinc-400">Не заходили 7+ дней</p>
          </button>
          <button onClick={() => void openAtRisk('dormant_30d', 'Не заходили 30+ дней')} className="rounded-lg border border-red-500/30 bg-red-500/5 p-4 text-left transition-colors hover:bg-red-500/10">
            <p className="text-xl font-bold text-red-400">?</p>
            <p className="text-xs text-zinc-400">Не заходили 30+ дней</p>
          </button>
          <button onClick={() => void openAtRisk('read_no_sub', 'Читают, но не подписаны')} className="rounded-lg border border-zinc-700 bg-zinc-800/50 p-4 text-left transition-colors hover:bg-zinc-800">
            <p className="text-xl font-bold text-zinc-300">?</p>
            <p className="text-xs text-zinc-400">Читают, но ни на что не подписаны</p>
          </button>
        </div>
      </section>

      <div className="grid gap-4 lg:grid-cols-2">
        <section className="card space-y-2">
          <h2 className="font-semibold">Регистрации <span className="text-xs font-normal text-zinc-500">— столбцы: новые, линия: всего</span></h2>
          {isLoading('registrations') && !data.registrations ? <SectionLoading /> : (
            <BarChart series={toSeries(registrations)} line={registrations.map((r) => Number(r.cumulative ?? 0))} />
          )}
        </section>

        <section className="card space-y-3">
          <h2 className="font-semibold">Вовлечение</h2>
          {isLoading('engagement') && !engagement ? <SectionLoading /> : engagement && (
            <>
              <div><span className="text-xs text-zinc-500">Прочтения</span><BarChart series={toSeries(engagement.reads)} color="#8ab4ff" height={80} /></div>
              <div><span className="text-xs text-zinc-500">Избранное</span><BarChart series={toSeries(engagement.favorites)} color="#ffb74d" height={60} /></div>
              <div><span className="text-xs text-zinc-500">Подписки</span><BarChart series={toSeries(engagement.subscriptions)} color="#ce93d8" height={60} /></div>
            </>
          )}
        </section>
      </div>

      {/* Воронка */}
      <section className="card space-y-2">
        <h2 className="font-semibold">Воронка <span className="text-xs font-normal text-zinc-500">— последние {days} дней</span></h2>
        {isLoading('funnel') && !data.funnel ? <SectionLoading /> : funnel.length === 0 ? <p className="text-sm text-zinc-600">Нет данных.</p> : (
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-zinc-800 text-left text-xs text-zinc-500">
                <th className="th">Шаг</th><th className="th text-right">Количество</th>
                <th className="th text-right">% от предыдущего</th><th className="th text-right">% от регистраций</th>
              </tr>
            </thead>
            <tbody>
              {funnel.map((s, i) => (
                <tr key={s.step} className="border-b border-zinc-800/50">
                  <td className="td font-medium">{i + 1}. {s.step}</td>
                  <td className="td text-right tabular-nums">{s.count}</td>
                  <td className={`td text-right ${s.pct_of_prev > 50 ? 'text-[#c9ff2a]' : 'text-amber-400'}`}>{s.pct_of_prev}%</td>
                  <td className="td text-right text-zinc-500">{s.pct_of_total}%</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </section>

      <div className="grid gap-4 lg:grid-cols-2">
        {/* Retention W0-W4 */}
        <section className="card space-y-2">
          <h2 className="font-semibold">Retention по неделям</h2>
          {isLoading('retention') && !data.retention ? <SectionLoading /> : retention && (
            <RetentionTable cohorts={retention.cohorts} weeks={retention.weeks} />
          )}
        </section>

        {/* Retention D1/D7/D30 */}
        <section className="card space-y-2">
          <h2 className="font-semibold">Retention D1 / D7 / D30 <span className="text-xs font-normal text-zinc-500">— «—» = когорте ещё не исполнилось</span></h2>
          {isLoading('retentionDaily') && !data.retentionDaily ? <SectionLoading /> : retentionDaily.length === 0 ? <p className="text-sm text-zinc-600">Мало данных.</p> : (
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-zinc-800 text-left text-xs text-zinc-500">
                  <th className="th">Когорта</th><th className="th text-right">Юзеров</th>
                  <th className="th text-right">D1</th><th className="th text-right">D7</th><th className="th text-right">D30</th>
                </tr>
              </thead>
              <tbody>
                {retentionDaily.slice(-10).map((c) => (
                  <tr key={c.cohort} className="border-b border-zinc-800/50">
                    <td className="td text-zinc-400">{c.cohort}</td>
                    <td className="td text-right font-semibold">{c.users}</td>
                    {[c.d1, c.d7, c.d30].map((v, i) => (
                      <td key={i} className={`td text-right ${v === null ? 'text-zinc-700' : v > (i === 0 ? 30 : i === 1 ? 20 : 10) ? 'text-[#c9ff2a]' : 'text-amber-400'}`}>
                        {v === null ? '—' : `${v}%`}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </section>
      </div>

      {/* Рейтинг тем */}
      <section className="card space-y-2">
        <h2 className="font-semibold">Рейтинг тем <span className="text-xs font-normal text-zinc-500">— тренды по просмотрам за {days} дн.</span></h2>
        {isLoading('topTrends') && !data.topTrends ? <SectionLoading /> : topTrends.length === 0 ? <p className="text-sm text-zinc-600">Нет данных.</p> : (
          <ol className="space-y-1.5">
            {topTrends.map((t, i) => {
              const maxViews = Math.max(1, Number(topTrends[0].views));
              return (
                <li key={t.id} className="flex items-center gap-3 text-sm">
                  <span className="w-6 text-right text-zinc-500">{i + 1}.</span>
                  <span className="w-52 truncate font-medium">{t.name}</span>
                  <span className="flex-1">
                    <span className="block h-4 rounded-sm bg-[#beff00]/70" style={{ width: `${Math.max(2, (Number(t.views) / maxViews) * 100)}%` }} />
                  </span>
                  <span className="w-16 text-right tabular-nums text-zinc-300">{fmt(t.views)}</span>
                  <span className="w-20 text-right text-xs text-zinc-500">{t.articles} ст.</span>
                </li>
              );
            })}
          </ol>
        )}
      </section>

      {/* Модалка группы риска */}
      {atRisk && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-zinc-950/80 p-4 backdrop-blur-sm" onClick={() => setAtRisk(null)}>
          <div className="flex max-h-[80vh] w-full max-w-2xl flex-col rounded-xl border border-zinc-700 bg-zinc-900 shadow-2xl" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between border-b border-zinc-800 px-4 py-3">
              <h2 className="font-semibold">{atRisk.label} <span className="text-sm font-normal text-zinc-500">— {atRisk.users.length} чел.</span></h2>
              <button onClick={() => setAtRisk(null)} className="rounded-lg bg-zinc-800 px-3 py-1 text-sm text-zinc-300 hover:bg-zinc-700">✕</button>
            </div>
            <div className="flex-1 overflow-y-auto p-4">
              {atRisk.users.length === 0 ? <p className="text-sm text-zinc-500">Пусто — все в порядке.</p> : (
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-zinc-800 text-left text-xs text-zinc-500">
                      <th className="th">Email</th><th className="th">Имя</th><th className="th text-right">Последний визит</th><th className="th text-right">Прочтений</th>
                    </tr>
                  </thead>
                  <tbody>
                    {atRisk.users.map((u) => (
                      <tr key={u.id} className="border-b border-zinc-800/50">
                        <td className="td font-medium">{u.email}</td>
                        <td className="td text-zinc-400">{u.displayName ?? '—'}</td>
                        <td className="td text-right text-zinc-500">{u.lastView}</td>
                        <td className="td text-right tabular-nums">{u.views}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function Kpi({ label, value, hint, accent, loading }: { label: string; value: string; hint?: string; accent?: boolean; loading?: boolean }) {
  return (
    <div className={`rounded-lg border p-3 ${accent ? 'border-[#beff00]/40 bg-[#beff00]/5' : 'border-zinc-800 bg-zinc-900'}`}>
      <p className="text-[11px] uppercase tracking-wide text-zinc-500">{label}</p>
      <p className={`mt-1 text-lg font-bold tabular-nums ${loading ? 'animate-pulse text-zinc-600' : accent ? 'text-[#c9ff2a]' : 'text-zinc-100'}`}>{value}</p>
      {hint && <p className="text-[10px] text-zinc-600">{hint}</p>}
    </div>
  );
}

function SectionLoading() {
  return <p className="animate-pulse py-6 text-center text-sm text-zinc-500">Загрузка секции…</p>;
}
