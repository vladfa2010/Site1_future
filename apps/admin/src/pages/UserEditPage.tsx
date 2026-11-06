import { useEffect, useState, type FormEvent } from 'react';
import { useParams } from 'react-router';
import { api } from '../api';

const ROLES = ['reader', 'author', 'admin', 'super_admin'] as const;
const ROLE_LABELS: Record<string, string> = { reader: 'читатель', author: 'автор', admin: 'админ', super_admin: 'супер-админ' };

interface UserRow {
  id: number;
  email: string;
  displayName: string | null;
  role: string;
  tariffId: number | null;
  createdAt: string;
  views: number;
}

export default function UserEditPage() {
  const { id } = useParams();
  const [user, setUser] = useState<UserRow | null>(null);
  const [form, setForm] = useState({ email: '', displayName: '', role: 'reader', tariffId: '' });
  const [plans, setPlans] = useState<{ id: number; name: string }[]>([]);
  const [notice, setNotice] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    void api<{ plans: { id: number; name: string }[] }>('/tariff-plans').then((d) => setPlans(d.plans)).catch(() => {});
    void api<{ users: UserRow[] }>('/users').then(({ users }) => {
      const u = users.find((x) => x.id === Number(id));
      if (!u) {
        setError('Пользователь не найден');
        return;
      }
      setUser(u);
      setForm({ email: u.email, displayName: u.displayName ?? '', role: u.role, tariffId: u.tariffId ? String(u.tariffId) : '' });
    }).catch(() => setError('Ошибка загрузки'));
  }, [id]);

  const save = async (e: FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError(null);
    setNotice(null);
    try {
      const { user: updated } = await api<{ user: { id: number } }>(`/users/${id}`, {
        method: 'PATCH',
        body: JSON.stringify({ ...form, tariffId: form.tariffId ? Number(form.tariffId) : null }),
      });
      setNotice(`Сохранено ✓ (id=${updated.id})`);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Ошибка сохранения');
    } finally {
      setBusy(false);
    }
  };

  if (!user && !error) return <p className="text-zinc-400">Загрузка…</p>;

  return (
    <div className="space-y-4">
      <h1 className="text-xl font-bold">Пользователь: {user?.displayName ?? user?.email}</h1>
      {notice && <p className="rounded-lg bg-green-500/10 px-3 py-2 text-sm text-green-400">{notice}</p>}
      {error && <p className="rounded-lg bg-red-500/10 px-3 py-2 text-sm text-red-400">{error}</p>}

      <form onSubmit={save} className="card max-w-lg space-y-4">
        <div>
          <label className="label">Имя (username)</label>
          <input
            className="input"
            required
            minLength={2}
            maxLength={40}
            value={form.displayName}
            onChange={(e) => setForm({ ...form, displayName: e.target.value })}
          />
        </div>
        <div>
          <label className="label">Email</label>
          <input
            className="input"
            type="email"
            required
            value={form.email}
            onChange={(e) => setForm({ ...form, email: e.target.value })}
          />
        </div>
        <div>
          <label className="label">Роль</label>
          <select className="input" value={form.role} onChange={(e) => setForm({ ...form, role: e.target.value })}>
            {ROLES.map((r) => (
              <option key={r} value={r}>{ROLE_LABELS[r]}</option>
            ))}
          </select>
        </div>
        <div>
          <label className="label">Тариф (пейволл)</label>
          <select className="input" value={form.tariffId} onChange={(e) => setForm({ ...form, tariffId: e.target.value })}>
            <option value="">Бесплатный</option>
            {plans.map((p) => (
              <option key={p.id} value={p.id}>{p.name}</option>
            ))}
          </select>
        </div>
        <div className="flex items-center gap-4 text-xs text-zinc-500">
          <span>id: {user?.id}</span>
          <span>регистрация: {user?.createdAt?.slice(0, 10)}</span>
          <span>просмотров: {user?.views}</span>
        </div>
        <button className="btn" type="submit" disabled={busy}>
          {busy ? 'Сохраняем…' : 'Сохранить'}
        </button>
      </form>
    </div>
  );
}
