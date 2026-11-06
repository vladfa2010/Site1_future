import { useEffect, useState, type FormEvent } from 'react';
import { api } from '../api';

interface Redirect { oldPath: string; newPath: string; httpCode: number }

export default function RedirectsPage() {
  const [rows, setRows] = useState<Redirect[]>([]);
  const [form, setForm] = useState({ oldPath: '', newPath: '', httpCode: '301' });
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const load = async () => setRows((await api<{ redirects: Redirect[] }>('/redirects')).redirects);
  useEffect(() => { void load().catch(() => setError('Ошибка загрузки')); }, []);

  const create = async (e: FormEvent) => {
    e.preventDefault();
    setError(null); setNotice(null);
    try {
      await api('/redirects', {
        method: 'POST',
        body: JSON.stringify({ ...form, oldPath: form.oldPath.trim(), newPath: form.newPath.trim(), httpCode: Number(form.httpCode) }),
      });
      setForm({ oldPath: '', newPath: '', httpCode: '301' });
      setNotice('Редирект сохранён ✓');
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Ошибка');
    }
  };

  const remove = async (oldPath: string) => {
    await api(`/redirects/${encodeURIComponent(oldPath)}`, { method: 'DELETE' });
    await load();
  };

  return (
    <div className="space-y-4">
      <h1 className="text-xl font-bold">Редиректы (SEO-миграция)</h1>
      <p className="text-sm text-zinc-500">301-перенаправления со старых URL донора на новые. Пустая таблица — все URL сохранены 1:1.</p>
      {notice && <p className="rounded-lg bg-green-500/10 px-3 py-2 text-sm text-green-400">{notice}</p>}
      {error && <p className="rounded-lg bg-red-500/10 px-3 py-2 text-sm text-red-400">{error}</p>}

      <form onSubmit={create} className="card flex flex-wrap items-end gap-3">
        <div>
          <label className="label">Старый путь</label>
          <input className="input w-64 font-mono" required placeholder="/trends/kosmos/" value={form.oldPath} onChange={(e) => setForm({ ...form, oldPath: e.target.value })} />
        </div>
        <div>
          <label className="label">Новый путь</label>
          <input className="input w-64 font-mono" required placeholder="/trend/kosmos/" value={form.newPath} onChange={(e) => setForm({ ...form, newPath: e.target.value })} />
        </div>
        <div>
          <label className="label">Код</label>
          <select className="input w-24" value={form.httpCode} onChange={(e) => setForm({ ...form, httpCode: e.target.value })}>
            <option value="301">301</option>
            <option value="302">302</option>
          </select>
        </div>
        <button className="btn" type="submit">Сохранить</button>
      </form>

      <div className="card overflow-x-auto p-0">
        <table className="w-full">
          <thead className="border-b border-zinc-800">
            <tr><th className="th">Старый URL</th><th className="th">→ Новый</th><th className="th">Код</th><th className="th" /></tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.oldPath} className="border-b border-zinc-800 last:border-0">
                <td className="td font-mono text-xs">{r.oldPath}</td>
                <td className="td font-mono text-xs">{r.newPath}</td>
                <td className="td">{r.httpCode}</td>
                <td className="td"><button onClick={() => void remove(r.oldPath)} className="text-red-400 hover:text-red-300">удалить</button></td>
              </tr>
            ))}
          </tbody>
        </table>
        {rows.length === 0 && <p className="p-4 text-sm text-zinc-500">Редиректов нет — URL сохранены один в один.</p>}
      </div>
    </div>
  );
}
