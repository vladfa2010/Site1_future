import { useEffect, useState } from 'react';
import { Link } from 'react-router';
import { api } from '../api';
import { useAuth } from '../auth';

interface UserRow { id: number; email: string; displayName: string | null; role: string; createdAt: string; views: number }
const ROLES = ['reader', 'author', 'admin', 'super_admin'] as const;
const ROLE_LABELS: Record<string, string> = { reader: 'читатель', author: 'автор', admin: 'админ', super_admin: 'супер-админ' };

export default function UsersPage() {
  const { user: me } = useAuth();
  const isSuper = me?.role === 'super_admin';
  const [rows, setRows] = useState<UserRow[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const load = async () => setRows((await api<{ users: UserRow[] }>('/users')).users);
  useEffect(() => { void load().catch(() => setError('Ошибка загрузки')); }, []);

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

  return (
    <div className="space-y-4">
      <h1 className="text-xl font-bold">Пользователи</h1>
      {notice && <p className="rounded-lg bg-green-500/10 px-3 py-2 text-sm text-green-400">{notice}</p>}
      {error && <p className="rounded-lg bg-red-500/10 px-3 py-2 text-sm text-red-400">{error}</p>}

      <div className="card overflow-x-auto p-0">
        <table className="w-full">
          <thead className="border-b border-zinc-800">
            <tr><th className="th">Email</th><th className="th">Имя</th><th className="th">Роль</th><th className="th">Просмотры</th><th className="th">Регистрация</th>{isSuper && <th className="th" />}</tr>
          </thead>
          <tbody>
            {rows.map((u) => (
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
