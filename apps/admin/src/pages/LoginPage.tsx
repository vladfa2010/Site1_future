import { useState, type FormEvent } from 'react';
import { useNavigate } from 'react-router';
import { useAuth } from '../auth';
import { isAdminRole } from '../api';

export default function LoginPage() {
  const { login } = useAuth();
  const navigate = useNavigate();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const onSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setError(null);
    setBusy(true);
    try {
      await login(email, password);
      navigate('/articles', { replace: true });
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Ошибка входа');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="flex min-h-screen items-center justify-center">
      <form onSubmit={onSubmit} className="card w-80 space-y-4">
        <h1 className="text-lg font-bold">Вход в админку</h1>
        <div>
          <label className="label">Email</label>
          <input className="input" type="email" required value={email} onChange={(e) => setEmail(e.target.value)} placeholder="test@test.ru" />
        </div>
        <div>
          <label className="label">Пароль</label>
          <input className="input" type="password" required value={password} onChange={(e) => setPassword(e.target.value)} placeholder="test" />
        </div>
        {error && <p className="text-sm text-red-600">{error}</p>}
        <button className="btn w-full" disabled={busy}>{busy ? 'Входим…' : 'Войти'}</button>
      </form>
    </div>
  );
}

export { isAdminRole };
