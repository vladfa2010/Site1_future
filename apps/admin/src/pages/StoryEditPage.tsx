import { useEffect, useState } from 'react';
import { useParams } from 'react-router';
import { api } from '../api';
import { RichTextEditor } from '../components/RichTextEditor';
import { stripHtml } from '@newinvest/db/text-utils';

interface StoryArticle { articleId: number; title: string; publishedAt: string | null; isPrimary: boolean; sortOrder: number }
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
  const [aiBusy, setAiBusy] = useState<'name' | 'desc' | null>(null);
  const [nameVariants, setNameVariants] = useState<string[] | null>(null);

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

  // ТЗ-08 R8: ↑/↓ — переупорядочивание выбранных материалов (порядок массива selected = sort_order)
  const move = (articleId: number, dir: -1 | 1) => {
    setSelected((s) => {
      const i = s.indexOf(articleId);
      const j = i + dir;
      if (i < 0 || j < 0 || j >= s.length) return s;
      const next = [...s];
      [next[i], next[j]] = [next[j], next[i]];
      return next;
    });
  };

  // Ревью v2.1 №6: динамический индикатор — сюжет станет плейлистом, пока все выбранные — видео
  const selectedTypes = selected.map((id) => allArticles.find((a) => a.id === id)?.type);
  const isPlaylistPreview = selected.length > 0 && selectedTypes.every((t) => t === 'video');

  // ---- ИИ-заполнение (паритет с ContentMaster): название и описание сюжета ----
  const selectedTitles = selected
    .map((id) => allArticles.find((a) => a.id === id)?.title)
    .filter((t): t is string => Boolean(t));

  /** ✨ Название: 3 варианта из описания и материалов сюжета, клик применяет. */
  const genName = async () => {
    setError(null); setNotice(null); setNameVariants(null);
    const plainDesc = stripHtml(form.description);
    if (plainDesc.length < 30 && selectedTitles.length === 0) {
      setError('Нужен текст описания или выбранные материалы сюжета');
      return;
    }
    setAiBusy('name');
    try {
      const prompt = [
        'Предложи 3 варианта названия для сюжета (тематической подборки материалов) инвестиционного медиа.',
        form.name ? `ТЕКУЩЕЕ НАЗВАНИЕ (можно улучшить, не копировать): ${form.name}` : '',
        plainDesc ? `ОПИСАНИЕ СЮЖЕТА: ${plainDesc.slice(0, 2000)}` : '',
        selectedTitles.length ? `МАТЕРИАЛЫ СЮЖЕТА: ${selectedTitles.slice(0, 20).join('; ')}` : '',
        'ТРЕБОВАНИЯ: каждый вариант до 80 символов, ёмко и конкретно, без кликбейта; ответь ТОЛЬКО тремя строками — по одному варианту на строку, без нумерации и кавычек.',
      ].filter(Boolean).join('\n');
      const res = await api<{ text: string; mock: boolean }>('/media/generate-text', {
        method: 'POST',
        body: JSON.stringify({ prompt, maxChars: 300 }),
      });
      const variants = res.text
        .split(/\n/)
        .map((t) => t.replace(/^\s*[-–—\d.)]+\s*|^["«]+|["»]+\s*$/g, '').trim())
        .filter((t) => t.length > 3)
        .slice(0, 3);
      setNameVariants(variants.length > 0 ? variants : [res.text.trim()]);
      if (res.mock) setNotice('Название собрано из текста (mock — без ключа LLM)');
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Ошибка генерации');
    } finally {
      setAiBusy(null);
    }
  };

  /** ✨ Описание: 2–3 абзаца из названия и материалов сюжета (HTML для редактора). */
  const genDesc = async () => {
    setError(null); setNotice(null);
    const plainDesc = stripHtml(form.description);
    if (!form.name.trim() && selectedTitles.length === 0) {
      setError('Нужно название или выбранные материалы сюжета');
      return;
    }
    if (selectedTitles.length === 0 && plainDesc.length < 30) {
      setError('Нужны выбранные материалы сюжета или текст описания');
      return;
    }
    setAiBusy('desc');
    try {
      const prompt = [
        'Напиши описание (анонс) сюжета — тематической подборки материалов инвестиционного медиа. Оно стоит над списком материалов на странице сюжета.',
        form.name ? `НАЗВАНИЕ СЮЖЕТА: ${form.name}` : '',
        selectedTitles.length ? `МАТЕРИАЛЫ СЮЖЕТА: ${selectedTitles.slice(0, 20).join('; ')}` : '',
        plainDesc ? `ТЕКУЩЕЕ ОПИСАНИЕ (можно улучшить, не копировать): ${plainDesc.slice(0, 1000)}` : '',
        'ТРЕБОВАНИЯ: 2–3 коротких абзаца, информативно, без воды и без «в этом сюжете мы расскажем», на русском. Ответь ТОЛЬКО текстом абзацев (по одному на строку).',
      ].filter(Boolean).join('\n');
      const res = await api<{ text: string; mock: boolean }>('/media/generate-text', {
        method: 'POST',
        body: JSON.stringify({ prompt, maxChars: 900 }),
      });
      const paras = res.text.trim().split(/\n+/).map((p) => p.trim()).filter(Boolean);
      setForm((f) => ({ ...f, description: paras.map((p) => `<p>${p}</p>`).join('') }));
      if (res.mock) setNotice('Описание собрано из текста (mock — без ключа LLM)');
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Ошибка генерации');
    } finally {
      setAiBusy(null);
    }
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
          <input className="input" value={form.name} onChange={(e) => { setForm({ ...form, name: e.target.value }); setNameVariants(null); }} />
          <button type="button" className="btn-secondary mt-1 py-1 text-xs" disabled={aiBusy === 'name'} onClick={() => void genName()}>
            {aiBusy === 'name' ? 'Генерируем…' : '✨ Название (3 варианта)'}
          </button>
          {nameVariants && (
            <div className="mt-2 space-y-1">
              {nameVariants.map((v) => (
                <button
                  key={v}
                  type="button"
                  onClick={() => { setForm((f) => ({ ...f, name: v })); setNameVariants(null); setNotice('Название применено ✓'); }}
                  className="block w-full rounded-lg border border-zinc-700 px-3 py-2 text-left text-sm hover:border-[#beff00]/60 hover:bg-zinc-800"
                >
                  {v}
                </button>
              ))}
            </div>
          )}
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
        <label className="label">Описание (визуальный редактор)</label>
        <RichTextEditor value={form.description} onChange={(html) => setForm({ ...form, description: html })} />
        <div className="mt-3 flex gap-2">
          <button className="btn" onClick={() => void saveMeta()}>Сохранить</button>
          <button type="button" className="btn-secondary" disabled={aiBusy === 'desc'} onClick={() => void genDesc()}>
            {aiBusy === 'desc' ? 'Генерируем…' : '✨ Описание из материалов сюжета'}
          </button>
        </div>
      </div>

      <div className="card space-y-3">
        <h2 className="font-semibold">Состав сюжета ({selected.length})</h2>
        {/* ТЗ-08 R8: динамический индикатор плейлист-режима при изменении состава */}
        {isPlaylistPreview ? (
          <p className="rounded-lg bg-[#beff00]/10 px-3 py-2 text-sm text-[#beff00]">
            ▶ Все материалы сюжета — видео: страница станет плейлистом ({selected.length} серий)
          </p>
        ) : (
          <p className="rounded-lg bg-zinc-800/50 px-3 py-2 text-sm text-zinc-500">
            Если все материалы сюжета — видео, страница станет плейлистом (главный плеер + список серий)
          </p>
        )}
        {selected.length > 0 && (
          <div>
            <h3 className="label">Порядок серий (sort_order — сверху вниз)</h3>
            <ol className="max-h-48 space-y-1 overflow-y-auto">
              {selected.map((id, i) => {
                const a = allArticles.find((x) => x.id === id);
                return (
                  <li key={id} className="flex items-center gap-2 rounded-lg px-2 py-1.5 text-sm hover:bg-zinc-800/50">
                    <span className="w-6 text-center text-zinc-500">{i + 1}</span>
                    <span className="flex-1 truncate">{a?.title ?? `id ${id}`}</span>
                    <span className="text-xs text-zinc-500">{a?.type}</span>
                    <button type="button" disabled={i === 0} onClick={() => move(id, -1)} className="btn-xs" title="Выше">↑</button>
                    <button type="button" disabled={i === selected.length - 1} onClick={() => move(id, 1)} className="btn-xs" title="Ниже">↓</button>
                  </li>
                );
              })}
            </ol>
          </div>
        )}
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
