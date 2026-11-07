import { useEffect, useState } from 'react';
import { useSearchParams } from 'react-router';
import { ArticleCard } from '../components/ArticleCard';
import type { ArticleListItem } from '../api';

export default function SearchPage() {
  const [params, setParams] = useSearchParams();
  const q = params.get('q') ?? '';
  const [draft, setDraft] = useState(q);
  const [results, setResults] = useState<ArticleListItem[]>([]);
  const [mode, setMode] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => { setDraft(q); }, [q]);

  useEffect(() => {
    if (q.trim().length < 2) { setResults([]); setMode(''); return; }
    const t = setTimeout(async () => {
      setLoading(true);
      setError(null);
      try {
        const res = await fetch(`/api/search?q=${encodeURIComponent(q)}&limit=20`);
        const data = await res.json().catch(() => ({}));
        if (!res.ok) throw new Error(data?.error ?? 'Ошибка поиска');
        setResults(data.results);
        setMode(data.mode);
      } catch (e) {
        setError(e instanceof Error ? e.message : 'Ошибка');
        setResults([]);
      } finally {
        setLoading(false);
      }
    }, 300);
    return () => clearTimeout(t);
  }, [q]);

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    setParams(draft.trim() ? { q: draft.trim() } : {});
  };

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold">Поиск по материалам</h1>

      <form onSubmit={submit} className="flex gap-2">
        <input
          autoFocus
          className="input flex-1"
          placeholder="Тренд, компания, технология… (минимум 2 символа)"
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
        />
        <button type="submit" className="rounded-full bg-[#beff00] px-6 py-2 font-semibold text-zinc-950 hover:bg-[#c9ff2a]">
          Найти
        </button>
      </form>

      {error && <p className="text-sm text-red-400">{error}</p>}
      {loading && <p className="text-sm text-zinc-500">Ищем…</p>}

      {!loading && q.trim().length >= 2 && results.length === 0 && !error && (
        <p className="text-zinc-500">Ничего не найдено по запросу «{q}». Попробуйте другие слова.</p>
      )}

      {results.length > 0 && (
        <>
          <p className="text-sm text-zinc-500">
            Найдено: {results.length}
            {mode === 'hybrid' && (
              <span className="ml-2 rounded-full bg-[#beff00]/10 px-2 py-0.5 text-xs text-[#beff00]">векторный + текстовый</span>
            )}
          </p>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {results.map((a) => <ArticleCard key={a.id} article={a} />)}
          </div>
        </>
      )}

      {q.trim().length > 0 && q.trim().length < 2 && (
        <p className="text-sm text-zinc-500">Введите минимум 2 символа.</p>
      )}
    </div>
  );
}
