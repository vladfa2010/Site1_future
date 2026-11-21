import { useEffect, useState } from 'react';
import { Link } from 'react-router';
import { api } from '../api';
import SearchInput, { filterRows } from '../components/SearchInput';
import ConfirmDelete from '../components/ConfirmDelete';

interface Trend { id: number; slug: string; name: string; status: string }

export default function TrendsPage() {
  const [rows, setRows] = useState<Trend[]>([]);
  const [q, setQ] = useState('');
  const [error, setError] = useState<string | null>(null);

  const load = async () => setRows((await api<{ trends: Trend[] }>('/trends')).trends);
  useEffect(() => { void load().catch(() => setError('Ошибка загрузки')); }, []);

  const filtered = filterRows(rows, q, ['name', 'slug']);

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-bold">Тренды</h1>
        <Link to="/trends/new" className="btn">+ Новый тренд</Link>
      </div>

      {error && <p className="rounded-lg bg-red-500/10 px-3 py-2 text-sm text-red-400">{error}</p>}

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
                <td className="td">
                  <span className="flex gap-3">
                    <Link to={`/trends/${t.id}/edit`} className="text-orange-600 hover:underline">ред.</Link>
                    <ConfirmDelete
                      label={`тренд «${t.name}»`}
                      onDelete={() => api(`/trends/${t.id}`, { method: 'DELETE' })}
                      onDeleted={() => void load().catch(() => setError('Ошибка загрузки'))}
                    />
                  </span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
