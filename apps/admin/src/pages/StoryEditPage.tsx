import { useEffect, useState } from 'react';
import { useParams } from 'react-router';
import { api } from '../api';

interface StoryArticle { articleId: number; title: string; publishedAt: string | null; isPrimary: boolean }
interface Story { id: number; slug: string; name: string; description: string | null; status: string; primaryArticleId: number | null }
interface ArticleOpt { id: number; title: string; type: string }

export default function StoryEditPage() {
  const { id } = useParams();
  const [story, setStory] = useState<Story | null>(null);
  const [form, setForm] = useState({ name: '', slug: '', description: '', status: 'active' });
  const [articles, setArticles] = useState<StoryArticle[]>([]);
  const [allArticles, setAllArticles] = useState<ArticleOpt[]>([]);
  const [selected, setSelected] = useState<number[]>([]);
  const [primary, setPrimary] = useState<number | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    void (async () => {
      const { stories } = await api<{ stories: Story[] }>('/stories');
      const s = stories.find((x) => x.id === Number(id));
      if (!s) { setError('Сюжет не найден'); return; }
      setStory(s);
      setForm({ name: s.name, slug: s.slug, description: s.description ?? '', status: s.status });
      setPrimary(s.primaryArticleId);
      const arts = await api<{ articles: ArticleOpt[] }>('/articles?limit=100');
      setAllArticles(arts.articles);
      const sa = await api<{ articles: StoryArticle[] }>(`/stories/${id}/articles`).catch(() => ({ articles: [] as StoryArticle[] }));
      setArticles(sa.articles);
      setSelected(sa.articles.map((a) => a.articleId));
    })().catch(() => setError('Ошибка загрузки'));
  }, [id]);

  const saveMeta = async () => {
    setError(null); setNotice(null);
    try {
      await api(`/stories/${id}`, { method: 'PATCH', body: JSON.stringify(form) });
      setNotice('Сохранено ✓');
    } catch (e) { setError(e instanceof Error ? e.message : 'Ошибка'); }
  };

  const saveArticles = async () => {
    setError(null); setNotice(null);
    try {
      const res = await api<{ articles: StoryArticle[] }>(`/stories/${id}/articles`, {
        method: 'PUT',
        body: JSON.stringify({ articleIds: selected, primaryArticleId: primary ?? undefined }),
      });
      setArticles(res.articles);
      setNotice('Состав сюжета сохранён ✓');
    } catch (e) { setError(e instanceof Error ? e.message : 'Ошибка'); }
  };

  const toggle = (articleId: number) => {
    setSelected((s) => {
      const next = s.includes(articleId) ? s.filter((x) => x !== articleId) : [...s, articleId];
      if (primary === articleId && !next.includes(articleId)) setPrimary(null);
      return next;
    });
  };

  if (error && !story) return <p className="text-red-400">{error}</p>;
  if (!story) return <p className="text-zinc-400">Загрузка…</p>;

  return (
    <div className="space-y-4">
      <h1 className="text-xl font-bold">Сюжет: {story.name}</h1>
      {notice && <p className="rounded-lg bg-green-500/10 px-3 py-2 text-sm text-green-400">{notice}</p>}
      {error && <p className="rounded-lg bg-red-500/10 px-3 py-2 text-sm text-red-400">{error}</p>}

      <div className="card grid gap-4 sm:grid-cols-3">
        <div>
          <label className="label">Название</label>
          <input className="input" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
        </div>
        <div>
          <label className="label">Slug → /syuzhet/{form.slug}</label>
          <input className="input" value={form.slug} onChange={(e) => setForm({ ...form, slug: e.target.value })} />
        </div>
        <div>
          <label className="label">Статус</label>
          <select className="input" value={form.status} onChange={(e) => setForm({ ...form, status: e.target.value })}>
            <option value="active">Активен</option>
            <option value="closed">Закрыт</option>
          </select>
        </div>
      </div>

      <div className="card">
        <label className="label">Описание</label>
        <textarea className="input" rows={3} value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} />
        <button className="btn mt-3" onClick={() => void saveMeta()}>Сохранить</button>
      </div>

      <div className="card space-y-3">
        <h2 className="font-semibold">Состав сюжета ({selected.length})</h2>
        <div className="max-h-64 space-y-1 overflow-y-auto">
          {allArticles.map((a) => (
            <label key={a.id} className="flex cursor-pointer items-center gap-3 rounded-lg px-2 py-1.5 hover:bg-zinc-800/50">
              <input type="checkbox" checked={selected.includes(a.id)} onChange={() => toggle(a.id)} />
              <span className="flex-1 text-sm">{a.title}</span>
              <span className="text-xs text-zinc-500">{a.type}</span>
              {selected.includes(a.id) && (
                <button
                  type="button"
                  onClick={() => setPrimary(primary === a.id ? null : a.id)}
                  className={`rounded-full px-2 py-0.5 text-xs ${primary === a.id ? 'bg-orange-500 text-zinc-950' : 'bg-zinc-800 text-zinc-400'}`}
                >
                  {primary === a.id ? '★ главная' : 'сделать главной'}
                </button>
              )}
            </label>
          ))}
        </div>
        <button className="btn" onClick={() => void saveArticles()}>Сохранить состав</button>
      </div>

      {articles.length > 0 && (
        <div className="card">
          <h2 className="mb-3 font-semibold">Хронология сюжета</h2>
          <ol className="space-y-2 border-l border-zinc-800 pl-4">
            {articles.map((a) => (
              <li key={a.articleId} className="text-sm">
                {a.isPrimary ? '★ ' : ''}{a.title}
                <span className="ml-2 text-xs text-zinc-500">{a.publishedAt?.slice(0, 10)}</span>
              </li>
            ))}
          </ol>
        </div>
      )}
    </div>
  );
}
