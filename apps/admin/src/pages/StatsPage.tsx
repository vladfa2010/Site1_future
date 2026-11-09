import { useEffect, useState } from 'react';
import { api, adminViewsBump } from '../api';

// ТЗ-03 R4: реальные и виртуальные просмотры — раздельно
interface StatRow { articleId: number; title: string; type: string; slug: string; realViews: number; virtualViews: number; baseOffset: number; accumulatedBump: number; uniqueUsers: number }

export default function StatsPage() {
  const [days, setDays] = useState(30);
  const [data, setData] = useState<{ total: number; articles: StatRow[] } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [digestMsg, setDigestMsg] = useState<string | null>(null);
  const [digestBusy, setDigestBusy] = useState(false);
  const [bumpMsg, setBumpMsg] = useState<string | null>(null);
  const [bumpBusy, setBumpBusy] = useState(false);

  // ТЗ-03 R2.4: ручной бамп — немедленный проход автодокрутки по всем «созревшим» статьям
  const runBump = async () => {
    setBumpBusy(true);
    setBumpMsg(null);
    try {
      const r = await adminViewsBump();
      setBumpMsg(`Докручено: ${r.processed} статей`);
    } catch (e) {
      setBumpMsg(e instanceof Error ? e.message : 'Ошибка');
    } finally {
      setBumpBusy(false);
    }
  };

  const sendDigest = async (scope: 'daily' | 'weekly') => {
    setDigestBusy(true);
    setDigestMsg(null);
    try {
      const r = await api<{ sent?: number; skipped?: string | null }>('/notifications/send', {
        method: 'POST',
        body: JSON.stringify({ scope }),
      });
      setDigestMsg(
        r.skipped
          ? `Не отправлено: ${r.skipped}`
          : `Отправлено: ${r.sent ?? 0} сообщений`,
      );
    } catch (e) {
      setDigestMsg(e instanceof Error ? e.message : 'Ошибка');
    } finally {
      setDigestBusy(false);
    }
  };

  useEffect(() => {
    void api<{ total: number; articles: StatRow[] }>(`/stats/views?days=${days}`)
      .then(setData)
      .catch(() => setError('Ошибка загрузки'));
  }, [days]);

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-bold">Аналитика просмотров</h1>
        <select className="input max-w-[140px]" value={days} onChange={(e) => setDays(Number(e.target.value))}>
          {[7, 14, 30, 60, 90].map((d) => <option key={d} value={d}>за {d} дней</option>)}
        </select>
      </div>
      {error && <p className="rounded-lg bg-red-500/10 px-3 py-2 text-sm text-red-400">{error}</p>}

      {/* Ручной запуск дайджестов (автоматика: cron 20:00 daily, вс 20:00 weekly) */}
      <div className="card flex flex-wrap items-center gap-3">
        <span className="text-sm text-zinc-400">Дайджесты подписчикам (email + Telegram):</span>
        <button className="btn-secondary" disabled={digestBusy} onClick={() => void sendDigest('daily')}>Отправить дневной</button>
        <button className="btn-secondary" disabled={digestBusy} onClick={() => void sendDigest('weekly')}>Отправить недельный</button>
        {digestMsg && <span className="text-sm text-[#c9ff2a]">{digestMsg}</span>}
      </div>

      {/* ТЗ-03: ручной проход автодокрутки (автоматика: cron 7 * * * *) */}
      <div className="card flex flex-wrap items-center gap-3">
        <span className="text-sm text-zinc-400">Автодокрутка просмотров (статьям с включённой настройкой):</span>
        <button className="btn-secondary" disabled={bumpBusy} onClick={() => void runBump()}>{bumpBusy ? 'Начисляем…' : 'Начислить сейчас'}</button>
        {bumpMsg && <span className="text-sm text-[#c9ff2a]">{bumpMsg}</span>}
      </div>

      {data && (
        <>
          <p className="text-sm text-zinc-400">Всего просмотров (реальные): <span className="font-semibold text-zinc-100">{data.total}</span></p>
          <div className="card overflow-x-auto p-0">
            <table className="w-full">
              <thead className="border-b border-zinc-800">
                <tr><th className="th">#</th><th className="th">Статья</th><th className="th">Тип</th><th className="th">Реальные</th><th className="th">Виртуальные</th><th className="th">Seed</th><th className="th">Докручено</th><th className="th">Уникальные</th></tr>
              </thead>
              <tbody>
                {data.articles.map((r, i) => (
                  <tr key={r.articleId} className="border-b border-zinc-800 last:border-0">
                    <td className="td text-zinc-500">{i + 1}</td>
                    <td className="td max-w-md truncate font-medium">
                      <a href={`http://localhost:5273/${r.type}/${r.slug}`} target="_blank" rel="noreferrer" className="hover:underline">{r.title}</a>
                    </td>
                    <td className="td text-zinc-500">{r.type}</td>
                    <td className="td font-semibold">{r.realViews}</td>
                    <td className="td text-zinc-300">{r.virtualViews}</td>
                    <td className="td text-zinc-500">{r.baseOffset}</td>
                    <td className="td text-zinc-500">{r.accumulatedBump}</td>
                    <td className="td text-zinc-400">{r.uniqueUsers}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            {data.articles.length === 0 && <p className="p-4 text-sm text-zinc-500">За период просмотров нет. Просмотры фиксируются при открытии статей на сайте.</p>}
          </div>
        </>
      )}
    </div>
  );
}
