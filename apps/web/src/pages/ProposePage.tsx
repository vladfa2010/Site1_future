import { useState, type FormEvent } from 'react';
import { Link } from 'react-router';
import { useAuth } from '../auth';
import { Breadcrumbs } from '../components/Breadcrumbs';

export default function ProposePage() {
  const { user } = useAuth();
  const [form, setForm] = useState({ type: 'novost', title: '', text: '', sourceUrl: '' });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState<{ title: string } | null>(null);

  if (!user) {
    return (
      <div className="mx-auto max-w-md py-10 text-center">
        <h1 className="text-2xl font-bold">Предложить новость или идею</h1>
        <p className="mt-3 text-zinc-400">Войдите или зарегистрируйтесь — и отправьте материал редакции.</p>
        <Link to="/login" state={{ from: '/propose' }} className="mt-6 inline-block rounded-full bg-[#beff00] px-6 py-2.5 font-semibold text-zinc-950 hover:bg-[#c9ff2a]">
          Войти
        </Link>
        <p className="mt-4 text-sm text-zinc-500">
          Нет аккаунта? <Link to="/register">Зарегистрироваться</Link>
        </p>
      </div>
    );
  }

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const res = await fetch('/api/articles/propose', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${localStorage.getItem('token')}`,
        },
        body: JSON.stringify({ ...form, sourceUrl: form.sourceUrl || undefined }),
      });
      const body = await res.json();
      if (!res.ok) throw new Error(body.error === 'validation' ? 'Заполните поля: заголовок от 5 символов, текст от 20' : 'Ошибка отправки');
      setDone({ title: body.article.title });
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Ошибка отправки');
    } finally {
      setBusy(false);
    }
  };

  if (done) {
    return (
      <div className="mx-auto max-w-md py-10 text-center">
        <p className="text-4xl">🎉</p>
        <h1 className="mt-3 text-2xl font-bold">Спасибо!</h1>
        <p className="mt-2 text-zinc-400">
          «{done.title}» отправлено редакции. После проверки материал появится на сайте.
        </p>
        <Link to="/" className="mt-6 inline-block rounded-full bg-[#beff00] px-6 py-2.5 font-semibold text-zinc-950 hover:bg-[#c9ff2a]">
          На главную
        </Link>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-2xl">
      <Breadcrumbs items={[{ label: 'Предложить материал' }]} />
      <h1 className="text-2xl font-bold">Предложить новость или идею</h1>
      <p className="mt-2 text-sm text-zinc-400">
        Расскажите о тренде, сделке или компании. Редакция проверит материал и опубликует.
      </p>

      <form onSubmit={submit} className="mt-6 space-y-4">
        <div className="flex gap-3">
          {(['novost', 'ideya'] as const).map((t) => (
            <button
              key={t}
              type="button"
              onClick={() => setForm({ ...form, type: t })}
              className={`rounded-full px-4 py-2 text-sm font-semibold ${form.type === t ? 'bg-[#beff00] text-zinc-950' : 'bg-zinc-800 text-zinc-300'}`}
            >
              {t === 'novost' ? 'Новость' : 'Идея'}
            </button>
          ))}
        </div>
        <div>
          <label className="mb-1 block text-sm text-zinc-500">Заголовок</label>
          <input
            required
            minLength={5}
            className="w-full rounded-lg border border-zinc-700 bg-[#191919] px-3 py-2 focus:border-[#beff00] focus:outline-none"
            value={form.title}
            onChange={(e) => setForm({ ...form, title: e.target.value })}
          />
        </div>
        <div>
          <label className="mb-1 block text-sm text-zinc-500">Текст (факты, цифры, почему это важно)</label>
          <textarea
            required
            minLength={20}
            rows={8}
            className="w-full rounded-lg border border-zinc-700 bg-[#191919] px-3 py-2 focus:border-[#beff00] focus:outline-none"
            value={form.text}
            onChange={(e) => setForm({ ...form, text: e.target.value })}
          />
        </div>
        <div>
          <label className="mb-1 block text-sm text-zinc-500">Источник (необязательно)</label>
          <input
            type="url"
            placeholder="https://…"
            className="w-full rounded-lg border border-zinc-700 bg-[#191919] px-3 py-2 focus:border-[#beff00] focus:outline-none"
            value={form.sourceUrl}
            onChange={(e) => setForm({ ...form, sourceUrl: e.target.value })}
          />
        </div>
        {error && <p className="text-sm text-red-400">{error}</p>}
        <button type="submit" disabled={busy} className="rounded-full bg-[#beff00] px-6 py-2.5 font-semibold text-zinc-950 hover:bg-[#c9ff2a] disabled:opacity-50">
          {busy ? 'Отправляем…' : 'Отправить редакции'}
        </button>
      </form>
    </div>
  );
}
