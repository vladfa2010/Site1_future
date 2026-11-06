import { useEffect, useState, type FormEvent } from 'react';
import { api } from '../api';
import SearchInput, { filterRows } from '../components/SearchInput';

interface Ticker { id: number; slug: string; symbol: string; exchange: string | null; companyName: string | null }
interface CompanyOpt { id: number; name: string }

export default function TickersPage() {
  const [rows, setRows] = useState<Ticker[]>([]);
  const [q, setQ] = useState('');
  const [companies, setCompanies] = useState<CompanyOpt[]>([]);
  const [form, setForm] = useState({ slug: '', symbol: '', companyId: '' });
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const load = async () => {
    const [t, c] = await Promise.all([
      api<{ tickers: Ticker[] }>('/tickers'),
      api<{ companies: CompanyOpt[] }>('/companies'),
    ]);
    setRows(t.tickers);
    setCompanies(c.companies);
  };
  useEffect(() => { void load().catch(() => setError('Ошибка загрузки')); }, []);

  const filtered = filterRows(rows, q, ['symbol', 'slug', 'companyName', 'exchange']);

  const create = async (e: FormEvent) => {
    e.preventDefault();
    setError(null); setNotice(null);
    try {
      await api('/tickers', {
        method: 'POST',
        body: JSON.stringify({
          ...form,
          slug: form.slug || form.symbol.toLowerCase(),
          companyId: form.companyId ? Number(form.companyId) : undefined,
        }),
      });
      setForm({ slug: '', symbol: '', companyId: '' });
      setNotice('Тикер создан ✓');
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Ошибка');
    }
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-3">
        <h1 className="text-xl font-bold">Тикеры</h1>
        <span className="text-sm text-zinc-500">{filtered.length} из {rows.length}</span>
      </div>
      <SearchInput value={q} onChange={setQ} placeholder="Поиск по символу / компании…" />
      {notice && <p className="rounded-lg bg-green-500/10 px-3 py-2 text-sm text-green-400">{notice}</p>}
      {error && <p className="rounded-lg bg-red-500/10 px-3 py-2 text-sm text-red-400">{error}</p>}

      <form onSubmit={create} className="card flex flex-wrap items-end gap-3">
        <div>
          <label className="label">Символ</label>
          <input className="input w-28 font-mono" required value={form.symbol} onChange={(e) => setForm({ ...form, symbol: e.target.value.toUpperCase() })} />
        </div>
        <div>
          <label className="label">Компания</label>
          <select className="input w-56" value={form.companyId} onChange={(e) => setForm({ ...form, companyId: e.target.value })}>
            <option value="">— без компании</option>
            {companies.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
          </select>
        </div>
        <button className="btn" type="submit">Создать</button>
      </form>

      <div className="card overflow-x-auto p-0">
        <table className="w-full">
          <thead className="border-b border-zinc-800">
            <tr><th className="th">Символ</th><th className="th">Компания</th><th className="th">Биржа</th><th className="th">URL на сайте</th></tr>
          </thead>
          <tbody>
            {filtered.map((t) => (
              <tr key={t.id} className="border-b border-zinc-800 last:border-0">
                <td className="td font-mono font-semibold">{t.symbol}</td>
                <td className="td">{t.companyName ?? <span className="text-zinc-600">— не привязан</span>}</td>
                <td className="td text-zinc-500">{t.exchange ?? '—'}</td>
                <td className="td text-zinc-500">/tiker/{t.slug}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
