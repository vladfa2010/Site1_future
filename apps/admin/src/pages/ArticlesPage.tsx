import { useEffect, useState } from 'react';
import { Link, useSearchParams } from 'react-router';
import { api } from '../api';
import SearchInput from '../components/SearchInput';

const TYPE_LABELS: Record<string, string> = {
  novost: 'Новость', ideya: 'Идея', sobytie: 'Событие', analitika: 'Аналитика', interesnoe: 'Интересное',
};
const STATUS_LABELS: Record<string, string> = { published: 'Опубликована', draft: 'Черновик', pending: 'На модерации' };

interface Row {
  id: number; type: string; slug: string; title: string;
  status: string; publishedAt: string | null;
}

export default function ArticlesPage() {
  const [params, setParams] = useSearchParams();
  const type = params.get('type') ?? '';
  const setType = (t: string) => setParams((p) => {
    const next = new URLSearchParams(p);
    if (t) next.set('type', t); else next.delete('type');
    return next;
  }, { replace: true });
  const [status, setStatus] = useState('');
  const [q, setQ] = useState('');
  const [rows, setRows] = useState<Row[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = async () => {
    setLoading(true);
    setError(null);
    try {
      const qs = new URLSearchParams({ limit: '100' });
      if (type) qs.set('type', type);
      if (status) qs.set('status', status);
      if (q) qs.set('q', q);
      const data = await api<{ articles: Row[] }>(`/articles?${qs}`);
      setRows(data.articles);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Ошибка');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { void load(); }, [type, status, q]);

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-bold">Статьи</h1>
        <Link to="/articles/new" className="btn">+ Новая статья</Link>
      </div>

      {/* Подзаголовки-типы: клик — предвыбранный список (как на сайте) */}
      <nav className="flex flex-wrap items-center gap-x-4 gap-y-1 border-b border-zinc-800 pb-2 text-sm">
        <button
          onClick={() => setType('')}
          className={type === '' ? 'font-semibold text-[#beff00]' : 'text-zinc-500 hover:text-zinc-300'}
        >
          Все
        </button>
        {Object.entries(TYPE_LABELS).map(([v, l]) => (
          <button
            key={v}
            onClick={() => setType(v)}
            className={type === v ? 'font-semibold text-[#beff00]' : 'text-zinc-500 hover:text-zinc-300'}
          >
            {l}
          </button>
        ))}
      </nav>

      <div className="flex flex-wrap items-center gap-3">
        <SearchInput value={q} onChange={setQ} placeholder="Поиск по заголовку / slug…" />
        <select className="input max-w-[180px]" value={status} onChange={(e) => setStatus(e.target.value)}>
          <option value="">Все статусы</option>
          {Object.entries(STATUS_LABELS).map(([v, l]) => <option key={v} value={v}>{l}</option>)}
        </select>
        <span className="text-sm text-zinc-500">{loading ? '…' : `${rows.length} шт.`}</span>
      </div>
      {type && (
        <button onClick={() => setType('')} className="text-xs text-zinc-500 hover:text-zinc-300">
          сбросить тип ✕
        </button>
      )}

      {error && <p className="text-sm text-red-400">{error}</p>}
      <div className="card overflow-x-auto p-0">
        <table className="w-full">
          <thead className="border-b border-zinc-800">
            <tr>
              <th className="th">Тип</th><th className="th">Заголовок</th><th className="th">Статус</th><th className="th">Дата</th><th className="th" />
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.id} className="border-b border-zinc-800 last:border-0">
                <td className="td whitespace-nowrap text-zinc-500">{TYPE_LABELS[r.type] ?? r.type}</td>
                <td className="td max-w-md truncate font-medium">{r.title}</td>
                <td className="td">
                  <span className={`rounded-full px-2 py-0.5 text-xs ${r.status === 'published' ? 'bg-green-500/10 text-green-400' : 'bg-zinc-800 text-zinc-400'}`}>
                    {STATUS_LABELS[r.status] ?? r.status}
                  </span>
                </td>
                <td className="td whitespace-nowrap text-zinc-500">{r.publishedAt?.slice(0, 10) ?? '—'}</td>
                <td className="td"><Link to={`/articles/${r.type}/${r.slug}/edit`} className="text-orange-400 hover:underline">ред.</Link></td>
              </tr>
            ))}
          </tbody>
        </table>
        {!loading && rows.length === 0 && <p className="p-4 text-sm text-zinc-500">Ничего не найдено.</p>}
      </div>
    </div>
  );
}
