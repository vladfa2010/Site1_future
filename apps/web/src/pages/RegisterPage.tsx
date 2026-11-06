import { useState, type FormEvent } from 'react';
import { useNavigate, Link } from 'react-router';
import { useAuth } from '../auth';

export default function RegisterPage() {
  const navigate = useNavigate();
  const { login } = useAuth();
  const [displayName, setDisplayName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const onSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setError(null);
    setBusy(true);
    try {
      const res = await fetch('/api/auth/register', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password, displayName: displayName || undefined, role: 'reader' }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.error === 'email already registered' ? 'Этот email уже зарегистрирован' : 'Ошибка регистрации');
      }
      const data = await res.json();
      localStorage.setItem('token', data.token);
      localStorage.setItem('user', JSON.stringify(data.user));
      navigate('/', { replace: true });
      window.location.reload(); // перечитать AuthContext
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Ошибка регистрации');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="mx-auto max-w-sm py-10">
      <h1 className="text-2xl font-bold">Регистрация</h1>
      <form onSubmit={onSubmit} className="mt-6 space-y-4">
        <label className="block text-sm">
          <span className="text-zinc-400">Имя</span>
          <input
            value={displayName}
            onChange={(e) => setDisplayName(e.target.value)}
            className="mt-1 w-full rounded-lg border border-zinc-700 bg-zinc-900 px-3 py-2 text-zinc-100 focus:border-orange-500 focus:outline-none"
          />
        </label>
        <label className="block text-sm">
          <span className="text-zinc-400">Email</span>
          <input
            type="email"
            required
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            className="mt-1 w-full rounded-lg border border-zinc-700 bg-zinc-900 px-3 py-2 text-zinc-100 focus:border-orange-500 focus:outline-none"
          />
        </label>
        <label className="block text-sm">
          <span className="text-zinc-400">Пароль (мин. 6 символов)</span>
          <input
            type="password"
            required
            minLength={6}
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            className="mt-1 w-full rounded-lg border border-zinc-700 bg-zinc-900 px-3 py-2 text-zinc-100 focus:border-orange-500 focus:outline-none"
          />
        </label>
        {error && <p className="text-sm text-red-400">{error}</p>}
        <button
          type="submit"
          disabled={busy}
          className="w-full rounded-full bg-orange-500 py-2.5 font-semibold text-zinc-950 hover:bg-orange-400 disabled:opacity-50"
        >
          {busy ? 'Создаём…' : 'Зарегистрироваться'}
        </button>
      </form>
      <p className="mt-4 text-sm text-zinc-500">
        Уже есть аккаунт? <Link to="/login">Войти</Link>
      </p>
    </div>
  );
}
