import { useEffect, useState, type FormEvent } from 'react';
import { Link } from 'react-router';
import { api } from '../api';

interface Story { id: number; slug: string; name: string; status: string }

export default function StoriesPage() {
  const [rows, setRows] = useState<Story[]>([]);
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState({ slug: '', name: '' });
  const [error, setError] = useState<string | null>(null);

  const load = async () => setRows((await api<{ stories: Story[] }>('/stories')).stories);
  useEffect(() => { void load().catch(() => setError('Ошибка загрузки')); }, []);

  const create = async (e: FormEvent) => {
    e.preventDefault();
    setError(null);
    try {
      const { story } = await api<{ story: Story }>('/stories', { method: 'POST', body: JSON.stringify(form) });
      setForm({ slug: '', name: '' });
      setShowForm(false);
      window.location.hash = `#/stories/${story.id}/edit`;
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Ошибка');
    }
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-bold">Сюжеты</h1>
        <button className="btn" onClick={() => setShowForm(!showForm)}>+ Новый сюжет</button>
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
          <button className="btn" type="submit">Создать и открыть</button>
        </form>
      )}
      {error && <p className="text-sm text-red-400">{error}</p>}

      <div className="card overflow-x-auto p-0">
        <table className="w-full">
          <thead className="border-b border-zinc-800">
            <tr><th className="th">Название</th><th className="th">Slug</th><th className="th">Статус</th><th className="th" /></tr>
          </thead>
          <tbody>
            {rows.map((s) => (
              <tr key={s.id} className="border-b border-zinc-800 last:border-0">
                <td className="td font-medium">{s.name}</td>
                <td className="td text-zinc-500">/syuzhet/{s.slug}</td>
                <td className="td">{s.status === 'active' ? 'активен' : 'закрыт'}</td>
                <td className="td"><Link to={`/stories/${s.id}/edit`} className="text-orange-400 hover:underline">ред.</Link></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
