import { useEffect, useState } from 'react';
import { Link } from 'react-router';
import { api } from '../api';
import { useAuth } from '../auth';
import SearchInput, { filterRows } from '../components/SearchInput';

interface UserRow { id: number; email: string; displayName: string | null; role: string; tariffId?: number | null; createdAt: string; views: number }
const ROLES = ['reader', 'author', 'admin', 'super_admin'] as const;
const ROLE_LABELS: Record<string, string> = { reader: 'читатель', author: 'автор', admin: 'админ', super_admin: 'супер-админ' };

export default function UsersPage() {
  const { user: me } = useAuth();
  const isSuper = me?.role === 'super_admin';
  const [rows, setRows] = useState<UserRow[]>([]);
  const [q, setQ] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const load = async () => setRows((await api<{ users: UserRow[] }>('/users')).users);
  useEffect(() => { void load().catch(() => setError('Ошибка загрузки')); }, []);

  const filtered = filterRows(rows, q, ['email', 'displayName', 'role']);

  const changeRole = async (id: number, role: string) => {
    setError(null); setNotice(null);
    try {
      await api(`/users/${id}`, { method: 'PATCH', body: JSON.stringify({ role }) });
      setNotice('Роль обновлена ✓');
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Ошибка (смена роли — только для super_admin)');
    }
  };

  const [exportBusy, setExportBusy] = useState(false);
  const exportCsv = async () => {
    setExportBusy(true);
    setError(null);
    try {
      const res = await fetch('/api/users/export.csv', {
        headers: { Authorization: `Bearer ${localStorage.getItem('token')}` },
      });
      if (!res.ok) throw new Error(`Ошибка выгрузки: ${res.status}`);
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `users-${new Date().toISOString().slice(0, 10)}.csv`;
      a.click();
      URL.revokeObjectURL(url);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Ошибка выгрузки');
    } finally {
      setExportBusy(false);
    }
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-3">
        <h1 className="text-xl font-bold">Пользователи</h1>
        <button
          type="button"
          onClick={exportCsv}
          disabled={exportBusy}
          className="btn-secondary"
          title="Выгрузить базу (CSV)"
        >
          {exportBusy ? 'Выгружаем…' : '⬇ Выгрузить CSV'}
        </button>
      </div>

      {/* Сводка над таблицей (как в PULSE): подписанные / с просмотрами / всего прочтений */}
      <div className="flex flex-wrap items-center gap-4 rounded-lg border border-zinc-800 bg-zinc-900 px-4 py-2.5 text-sm">
        <span className="text-zinc-400">{rows.length} юзеров</span>
        <span className="text-[#c9ff2a]">{rows.filter((r) => r.tariffId).length} с тарифом</span>
        <span className="text-zinc-400">{rows.filter((r) => Number(r.views) > 0).length} читают</span>
        <span className="text-zinc-500">{rows.reduce((s, r) => s + Number(r.views), 0).toLocaleString('ru-RU')} прочтений суммарно</span>
      </div>

      <div className="flex items-center justify-between gap-3">
        <SearchInput value={q} onChange={setQ} placeholder="Поиск по email / имени…" />
        <span className="text-sm text-zinc-500">{filtered.length} из {rows.length}</span>
      </div>
      {notice && <p className="rounded-lg bg-green-500/10 px-3 py-2 text-sm text-green-400">{notice}</p>}
      {error && <p className="rounded-lg bg-red-500/10 px-3 py-2 text-sm text-red-400">{error}</p>}

      <div className="card overflow-x-auto p-0">
        <table className="w-full">
          <thead className="border-b border-zinc-800">
            <tr><th className="th">Email</th><th className="th">Имя</th><th className="th">Роль</th><th className="th">Просмотры</th><th className="th">Регистрация</th>{isSuper && <th className="th" />}</tr>
          </thead>
          <tbody>
            {filtered.map((u) => (
              <tr key={u.id} className="border-b border-zinc-800 last:border-0">
                <td className="td font-medium">{u.email}</td>
                <td className="td text-zinc-400">{u.displayName ?? '—'}</td>
                <td className="td">
                  {isSuper ? (
                    <select className="input max-w-[150px] py-1" value={u.role} onChange={(e) => void changeRole(u.id, e.target.value)}>
                      {ROLES.map((r) => <option key={r} value={r}>{ROLE_LABELS[r]}</option>)}
                    </select>
                  ) : (
                    <span className="rounded-full bg-zinc-800 px-2 py-0.5 text-xs text-zinc-300">{ROLE_LABELS[u.role]}</span>
                  )}
                </td>
                <td className="td text-zinc-400">{u.views}</td>
                <td className="td text-zinc-500">{u.createdAt?.slice(0, 10)}</td>
                {isSuper && (
                  <td className="td">
                    <Link to={`/users/${u.id}/edit`} className="text-orange-400 hover:underline">ред.</Link>
                  </td>
                )}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {!isSuper && <p className="text-sm text-zinc-500">Смена ролей доступна только супер-админу.</p>}
    </div>
  );
}
