import { useEffect, useState, type FormEvent } from 'react';
import { api } from '../api';

interface Industry { id: number; slug: string; name: string }
interface Ticker { id: number; slug: string; symbol: string; exchange: string | null; companyName: string | null }
interface CompanyOpt { id: number; name: string }

export default function DictionariesPage() {
  const [industries, setIndustries] = useState<Industry[]>([]);
  const [tickers, setTickers] = useState<Ticker[]>([]);
  const [companies, setCompanies] = useState<CompanyOpt[]>([]);
  const [indForm, setIndForm] = useState({ slug: '', name: '' });
  const [tickerForm, setTickerForm] = useState({ slug: '', symbol: '', companyId: '' });
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const load = async () => {
    const [i, t, c] = await Promise.all([
      api<{ industries: Industry[] }>('/industries'),
      api<{ tickers: Ticker[] }>('/tickers'),
      api<{ companies: CompanyOpt[] }>('/companies'),
    ]);
    setIndustries(i.industries);
    setTickers(t.tickers);
    setCompanies(c.companies);
  };
  useEffect(() => { void load().catch(() => setError('Ошибка загрузки')); }, []);

  const createIndustry = async (e: FormEvent) => {
    e.preventDefault();
    setError(null);
    try {
      await api('/industries', { method: 'POST', body: JSON.stringify(indForm) });
      setIndForm({ slug: '', name: '' });
      setNotice('Индустрия создана ✓');
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Ошибка');
    }
  };

  const createTicker = async (e: FormEvent) => {
    e.preventDefault();
    setError(null);
    try {
      await api('/tickers', {
        method: 'POST',
        body: JSON.stringify({ ...tickerForm, slug: tickerForm.slug || tickerForm.symbol.toLowerCase(), companyId: tickerForm.companyId ? Number(tickerForm.companyId) : undefined }),
      });
      setTickerForm({ slug: '', symbol: '', companyId: '' });
      setNotice('Тикер создан ✓');
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Ошибка');
    }
  };

  return (
    <div className="grid gap-6 lg:grid-cols-2">
      <div className="space-y-4">
        <h1 className="text-xl font-bold">Индустрии</h1>
        {notice && <p className="rounded-lg bg-green-50 px-3 py-2 text-sm text-green-700">{notice}</p>}
        {error && <p className="text-sm text-red-600">{error}</p>}
        <form onSubmit={createIndustry} className="card flex flex-wrap items-end gap-3">
          <div>
            <label className="label">Slug</label>
            <input className="input w-40" required pattern="[a-z0-9-]+" value={indForm.slug} onChange={(e) => setIndForm({ ...indForm, slug: e.target.value })} />
          </div>
          <div>
            <label className="label">Название</label>
            <input className="input w-48" required value={indForm.name} onChange={(e) => setIndForm({ ...indForm, name: e.target.value })} />
          </div>
          <button className="btn" type="submit">Создать</button>
        </form>
        <div className="card p-0">
          <table className="w-full">
            <tbody>
              {industries.map((i) => (
                <tr key={i.id} className="border-b border-zinc-800 last:border-0">
                  <td className="td font-medium">{i.name}</td>
                  <td className="td text-zinc-500">{i.slug}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      <div className="space-y-4">
        <h1 className="text-xl font-bold">Тикеры</h1>
        <form onSubmit={createTicker} className="card flex flex-wrap items-end gap-3">
          <div>
            <label className="label">Символ</label>
            <input className="input w-28" required value={tickerForm.symbol} onChange={(e) => setTickerForm({ ...tickerForm, symbol: e.target.value.toUpperCase() })} />
          </div>
          <div>
            <label className="label">Компания</label>
            <select className="input w-48" value={tickerForm.companyId} onChange={(e) => setTickerForm({ ...tickerForm, companyId: e.target.value })}>
              <option value="">—</option>
              {companies.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select>
          </div>
          <button className="btn" type="submit">Создать</button>
        </form>
        <div className="card p-0">
          <table className="w-full">
            <tbody>
              {tickers.map((t) => (
                <tr key={t.id} className="border-b border-zinc-800 last:border-0">
                  <td className="td font-mono font-semibold">{t.symbol}</td>
                  <td className="td text-zinc-500">{t.companyName ?? '—'}</td>
                  <td className="td text-zinc-400">{t.exchange ?? ''}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
