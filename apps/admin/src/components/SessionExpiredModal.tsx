import { useState, type FormEvent } from 'react';

interface Props {
  defaultEmail: string;
  /** Тот же login() из AuthContext — прокидываем пропсом, чтобы не было
   *  циклического импорта auth ↔ SessionExpiredModal. */
  login: (email: string, password: string) => Promise<void>;
  onSuccess: () => void;
  onCancel: () => void;
}

/** Модалка повторного входа при протухшем токене (инцидент 2026-11-27).
 *  Вместо редиректа на /login с полной перезагрузкой: React-состояние форм
 *  остаётся живым, а провалившийся запрос api() повторяется автоматически
 *  сразу после успешного входа. */
export default function SessionExpiredModal({ defaultEmail, login, onSuccess, onCancel }: Props) {
  const [email, setEmail] = useState(defaultEmail);
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const onSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setError(null);
    setBusy(true);
    try {
      await login(email, password);
      onSuccess();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Ошибка входа');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-zinc-950/80 p-4 backdrop-blur-sm">
      <form onSubmit={onSubmit} className="card w-96 space-y-4">
        <div>
          <h2 className="text-lg font-bold">Сессия истекла</h2>
          <p className="mt-1 text-sm text-zinc-400">
            Токен админа живёт 12 часов. Войдите снова — несохранённые изменения в форме не пропадут,
            а прерванное действие продолжится автоматически.
          </p>
        </div>
        <div>
          <label className="label">Email</label>
          <input className="input" type="email" required value={email} onChange={(e) => setEmail(e.target.value)} autoFocus />
        </div>
        <div>
          <label className="label">Пароль</label>
          <input className="input" type="password" required value={password} onChange={(e) => setPassword(e.target.value)} />
        </div>
        {error && <p className="text-sm text-red-400">{error}</p>}
        <div className="flex gap-3">
          <button className="btn flex-1" disabled={busy}>{busy ? 'Входим…' : 'Войти снова'}</button>
          <button type="button" className="btn-secondary px-4" onClick={onCancel}>Выйти</button>
        </div>
      </form>
    </div>
  );
}
