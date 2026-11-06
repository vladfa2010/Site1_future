import { useEffect, useState, type FormEvent } from 'react';
import { api } from '../api';
import SearchInput, { filterRows } from '../components/SearchInput';

interface Industry { id: number; slug: string; name: string; description: string | null }

export default function IndustriesPage() {
  const [rows, setRows] = useState<Industry[]>([]);
  const [q, setQ] = useState('');
  const [form, setForm] = useState({ slug: '', name: '' });
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const load = async () => setRows((await api<{ industries: Industry[] }>('/industries')).industries);
  useEffect(() => { void load().catch(() => setError('Ошибка загрузки')); }, []);

  const filtered = filterRows(rows, q, ['name', 'slug', 'description']);

  const create = async (e: FormEvent) => {
    e.preventDefault();
    setError(null); setNotice(null);
    try {
      await api('/industries', { method: 'POST', body: JSON.stringify(form) });
      setForm({ slug: '', name: '' });
      setNotice('Индустрия создана ✓');
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Ошибка');
    }
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-3">
        <h1 className="text-xl font-bold">Индустрии</h1>
        <span className="text-sm text-zinc-500">{filtered.length} из {rows.length}</span>
      </div>
      <SearchInput value={q} onChange={setQ} placeholder="Поиск по названию / slug…" />
      {notice && <p className="rounded-lg bg-green-500/10 px-3 py-2 text-sm text-green-400">{notice}</p>}
      {error && <p className="rounded-lg bg-red-500/10 px-3 py-2 text-sm text-red-400">{error}</p>}

      <form onSubmit={create} className="card flex flex-wrap items-end gap-3">
        <div>
          <label className="label">Slug</label>
          <input className="input w-48" required pattern="[a-z0-9-]+" value={form.slug} onChange={(e) => setForm({ ...form, slug: e.target.value })} />
        </div>
        <div>
          <label className="label">Название</label>
          <input className="input w-56" required value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
        </div>
        <button className="btn" type="submit">Создать</button>
      </form>

      <div className="card overflow-x-auto p-0">
        <table className="w-full">
          <thead className="border-b border-zinc-800">
            <tr><th className="th">Название</th><th className="th">Slug</th><th className="th">URL на сайте</th></tr>
          </thead>
          <tbody>
            {filtered.map((i) => (
              <tr key={i.id} className="border-b border-zinc-800 last:border-0">
                <td className="td font-medium">{i.name}</td>
                <td className="td text-zinc-500">{i.slug}</td>
                <td className="td text-zinc-500">/industriya/{i.slug}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
