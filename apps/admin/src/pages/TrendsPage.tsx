import { useEffect, useState, type FormEvent } from 'react';
import { Link } from 'react-router';
import { api } from '../api';
import SearchInput, { filterRows } from '../components/SearchInput';

interface Trend { id: number; slug: string; name: string; status: string }

export default function TrendsPage() {
  const [rows, setRows] = useState<Trend[]>([]);
  const [q, setQ] = useState('');
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState({ slug: '', name: '' });
  const [error, setError] = useState<string | null>(null);

  const load = async () => setRows((await api<{ trends: Trend[] }>('/trends')).trends);
  useEffect(() => { void load().catch(() => setError('Ошибка загрузки')); }, []);

  const filtered = filterRows(rows, q, ['name', 'slug']);

  const create = async (e: FormEvent) => {
    e.preventDefault();
    setError(null);
    try {
      await api('/trends', { method: 'POST', body: JSON.stringify(form) });
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
        <h1 className="text-xl font-bold">Тренды</h1>
        <button className="btn" onClick={() => setShowForm(!showForm)}>+ Новый тренд</button>
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
            <tr><th className="th">Название</th><th className="th">Slug</th><th className="th">Статус</th><th className="th">Лонгрид</th><th className="th" /></tr>
          </thead>
          <tbody>
            {filtered.map((t) => (
              <tr key={t.id} className="border-b border-zinc-800 last:border-0">
                <td className="td font-medium">{t.name}</td>
                <td className="td text-zinc-500">{t.slug}</td>
                <td className="td">{t.status === 'active' ? 'активен' : 'закрыт'}</td>
                <td className="td text-zinc-500">в редакторе</td>
                <td className="td"><Link to={`/trends/${t.id}/edit`} className="text-orange-600 hover:underline">ред.</Link></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
