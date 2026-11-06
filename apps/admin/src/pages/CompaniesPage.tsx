import { useEffect, useState, type FormEvent } from 'react';
import { Link } from 'react-router';
import { api } from '../api';
import SearchInput, { filterRows } from '../components/SearchInput';

interface Company { id: number; slug: string; name: string; oneLiner: string | null; country: string | null; isPublic: boolean }

export default function CompaniesPage() {
  const [rows, setRows] = useState<Company[]>([]);
  const [q, setQ] = useState('');
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState({ slug: '', name: '' });
  const [error, setError] = useState<string | null>(null);

  const load = async () => setRows((await api<{ companies: Company[] }>('/companies')).companies);
  useEffect(() => { void load().catch(() => setError('Ошибка загрузки')); }, []);

  const filtered = filterRows(rows, q, ['name', 'slug', 'country']);

  const create = async (e: FormEvent) => {
    e.preventDefault();
    setError(null);
    try {
      await api('/companies', { method: 'POST', body: JSON.stringify(form) });
      setForm({ slug: '', name: '' });
      setShowForm(false);
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Ошибка');
    }
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-bold">Компании</h1>
        <button className="btn" onClick={() => setShowForm(!showForm)}>+ Новая компания</button>
      </div>

      {showForm && (
        <form onSubmit={create} className="card flex flex-wrap items-end gap-3">
          <div>
            <label className="label">Slug</label>
            <input className="input w-48" required pattern="[a-z0-9-]+" value={form.slug} onChange={(e) => setForm({ ...form, slug: e.target.value })} />
          </div>
          <div>
            <label className="label">Название</label>
            <input className="input w-64" required value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
          </div>
          <button className="btn" type="submit">Создать</button>
        </form>
      )}
      {error && <p className="text-sm text-red-600">{error}</p>}

      <div className="flex items-center justify-between gap-3">
        <SearchInput value={q} onChange={setQ} placeholder="Поиск по названию / slug…" />
        <span className="text-sm text-zinc-500">{filtered.length} из {rows.length}</span>
      </div>

      <div className="card overflow-x-auto p-0">
        <table className="w-full">
          <thead className="border-b border-zinc-800">
            <tr><th className="th">Название</th><th className="th">Slug</th><th className="th">Страна</th><th className="th">Публичная</th><th className="th" /></tr>
          </thead>
          <tbody>
            {filtered.map((c) => (
              <tr key={c.id} className="border-b border-zinc-800 last:border-0">
                <td className="td font-medium">{c.name}</td>
                <td className="td text-zinc-500">{c.slug}</td>
                <td className="td text-zinc-500">{c.country ?? '—'}</td>
                <td className="td">{c.isPublic ? '✅' : '—'}</td>
                <td className="td"><Link to={`/companies/${c.slug}/edit`} className="text-orange-600 hover:underline">ред.</Link></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
