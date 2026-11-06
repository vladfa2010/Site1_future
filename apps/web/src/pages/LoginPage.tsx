import { useState, type FormEvent } from 'react';
import { useNavigate, useLocation, Link } from 'react-router';
import { useAuth } from '../auth';

export default function LoginPage() {
  const { login, user } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  if (user) {
    navigate('/', { replace: true });
    return null;
  }

  const onSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setError(null);
    setBusy(true);
    try {
      await login(email, password);
      navigate((location.state as { from?: string })?.from ?? '/', { replace: true });
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Ошибка входа');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="mx-auto max-w-sm py-10">
      <h1 className="text-2xl font-bold">Вход в аккаунт</h1>
      <form onSubmit={onSubmit} className="mt-6 space-y-4">
        <label className="block text-sm">
          <span className="text-zinc-400">Email</span>
          <input
            type="email"
            required
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            className="mt-1 w-full rounded-lg border border-zinc-700 bg-zinc-900 px-3 py-2 text-zinc-100 focus:border-orange-500 focus:outline-none"
            placeholder="test@test.ru"
          />
        </label>
        <label className="block text-sm">
          <span className="text-zinc-400">Пароль</span>
          <input
            type="password"
            required
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            className="mt-1 w-full rounded-lg border border-zinc-700 bg-zinc-900 px-3 py-2 text-zinc-100 focus:border-orange-500 focus:outline-none"
            placeholder="test"
          />
        </label>
        {error && <p className="text-sm text-red-400">{error}</p>}
        <button
          type="submit"
          disabled={busy}
          className="w-full rounded-full bg-orange-500 py-2.5 font-semibold text-zinc-950 hover:bg-orange-400 disabled:opacity-50"
        >
          {busy ? 'Входим…' : 'Войти'}
        </button>
      </form>
      <p className="mt-4 text-sm text-zinc-500">
        Нет аккаунта? <Link to="/register">Зарегистрироваться</Link>
      </p>
    </div>
  );
}
