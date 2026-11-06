import { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router';
import { api } from '../api';

const TYPES = ['novost', 'ideya', 'sobytie', 'analitika', 'interesnoe'] as const;
const TYPE_LABELS: Record<string, string> = {
  novost: 'Новость', ideya: 'Идея', sobytie: 'Событие', analitika: 'Аналитика', interesnoe: 'Интересное',
};

interface Option { id: number; name: string; symbol?: string; companyName?: string }
interface Relations { companyIds: number[]; tickerIds: number[]; industryIds: number[]; trendIds: number[]; storyIds: number[] }

const EMPTY: Relations = { companyIds: [], tickerIds: [], industryIds: [], trendIds: [], storyIds: [] };

export default function ArticleEditPage() {
  const { type: urlType, slug } = useParams();
  const isNew = !slug;
  const navigate = useNavigate();

  const [form, setForm] = useState({
    type: 'novost', slug: '', title: '', excerpt: '', thesis: '', contentHtml: '', status: 'draft',
  });
  const [articleId, setArticleId] = useState<number | null>(null);
  const [rels, setRels] = useState<Relations>(EMPTY);
  const [dicts, setDicts] = useState<{ companies: Option[]; tickers: Option[]; industries: Option[]; trends: Option[] }>({ companies: [], tickers: [], industries: [], trends: [] });
  const [notice, setNotice] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    void (async () => {
      const [companies, tickers, industries, trends] = await Promise.all([
        api<{ companies: Option[] }>('/companies').catch(() => ({ companies: [] })),
        api<{ tickers: Option[] }>('/tickers').catch(() => ({ tickers: [] })),
        api<{ industries: Option[] }>('/industries').catch(() => ({ industries: [] })),
        api<{ trends: Option[] }>('/trends').catch(() => ({ trends: [] })),
      ]);
      setDicts({ companies: companies.companies, tickers: tickers.tickers, industries: industries.industries, trends: trends.trends });

      if (!isNew && urlType && slug) {
        const detail = await api<{ article: { id: number; type: string; slug: string; title: string; excerpt: string | null; thesis: string | null; contentHtml: string; status: string } }>(`/articles/${urlType}/${slug}`);
        const a = detail.article;
        setForm({ type: a.type, slug: a.slug, title: a.title, excerpt: a.excerpt ?? '', thesis: a.thesis ?? '', contentHtml: a.contentHtml, status: a.status });
        setArticleId(a.id);
        const r = await api<{ relations: Relations }>(`/articles/${a.id}/relations`);
        setRels(r.relations);
      }
    })();
  }, [urlType, slug]);

  const set = (k: keyof typeof form) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) =>
    setForm((f) => ({ ...f, [k]: e.target.value }));

  const toggle = (key: keyof Relations, id: number) =>
    setRels((r) => ({ ...r, [key]: r[key].includes(id) ? r[key].filter((x) => x !== id) : [...r[key], id] }));

  const save = async () => {
    setBusy(true);
    setError(null);
    setNotice(null);
    try {
      let id = articleId;
      if (isNew) {
        const created = await api<{ article: { id: number } }>('/articles', { method: 'POST', body: JSON.stringify(form) });
        id = created.article.id;
        setArticleId(id);
      } else if (id) {
        await api(`/articles/${id}`, { method: 'PATCH', body: JSON.stringify(form) });
      }
      if (id) {
        await api(`/articles/${id}/relations`, {
          method: 'PUT',
          body: JSON.stringify({ companyIds: rels.companyIds, tickerIds: rels.tickerIds, industryIds: rels.industryIds, trendIds: rels.trendIds }),
        });
      }
      setNotice('Сохранено ✓');
      if (isNew && id) navigate(`/articles/${form.type}/${form.slug}/edit`, { replace: true });
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Ошибка сохранения');
    } finally {
      setBusy(false);
    }
  };

  const publish = async () => {
    if (!articleId) return;
    await api(`/articles/${articleId}/publish`, { method: 'POST' });
    setForm((f) => ({ ...f, status: 'published' }));
    setNotice('Опубликовано ✓');
  };

  // Автоподстановка цепочки тикер→компания→индустрия (раздел 6.2)
  const suggest = async () => {
    if (!articleId) return;
    const { suggestions } = await api<{
      suggestions: { companies: { id: number; reason: string }[]; industries: { id: number; name: string; reason: string }[] };
    }>(`/articles/${articleId}/bindings-suggest`);
    const add: string[] = [];
    setRels((r) => {
      const companyIds = [...r.companyIds];
      const industryIds = [...r.industryIds];
      for (const c of suggestions.companies) if (!companyIds.includes(c.id)) { companyIds.push(c.id); add.push(`компания (${c.reason})`); }
      for (const i of suggestions.industries) if (!industryIds.includes(i.id)) { industryIds.push(i.id); add.push(`индустрия ${i.name} (${i.reason})`); }
      return { ...r, companyIds, industryIds };
    });
    setNotice(add.length ? `Подставлено: ${add.join(', ')}` : 'Новых подсказок нет');
  };

  const CheckGroup = ({ label, options, relKey, render }: { label: string; options: Option[]; relKey: keyof Relations; render?: (o: Option) => string }) => (
    <div>
      <span className="label">{label}</span>
      <div className="flex max-h-36 flex-wrap gap-2 overflow-y-auto rounded-lg border border-zinc-200 p-2">
        {options.map((o) => (
          <label key={o.id} className={`cursor-pointer rounded-full px-2.5 py-1 text-xs ${rels[relKey].includes(o.id) ? 'bg-orange-100 text-orange-700' : 'bg-zinc-100 text-zinc-600'}`}>
            <input type="checkbox" className="hidden" checked={rels[relKey].includes(o.id)} onChange={() => toggle(relKey, o.id)} />
            {render ? render(o) : o.name}
          </label>
        ))}
      </div>
    </div>
  );

  return (
    <div className="space-y-4">
      <h1 className="text-xl font-bold">{isNew ? 'Новая статья' : 'Редактирование статьи'}</h1>
      {notice && <p className="rounded-lg bg-green-50 px-3 py-2 text-sm text-green-700">{notice}</p>}
      {error && <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>}

      <div className="card grid gap-4 sm:grid-cols-3">
        <div>
          <label className="label">Тип</label>
          <select className="input" value={form.type} onChange={set('type')}>
            {TYPES.map((t) => <option key={t} value={t}>{TYPE_LABELS[t]}</option>)}
          </select>
        </div>
        <div>
          <label className="label">Slug (латиница-цифры-дефис)</label>
          <input className="input" value={form.slug} onChange={set('slug')} pattern="[a-z0-9-]+" required />
        </div>
        <div>
          <label className="label">Статус</label>
          <select className="input" value={form.status} onChange={set('status')} disabled={form.status === 'published'}>
            <option value="draft">Черновик</option>
            <option value="published">Опубликована</option>
          </select>
        </div>
      </div>

      <div className="card space-y-4">
        <div>
          <label className="label">Заголовок</label>
          <input className="input" value={form.title} onChange={set('title')} required />
        </div>
        <div>
          <label className="label">Тезис идеи (для type=ideya)</label>
          <textarea className="input" rows={2} value={form.thesis} onChange={set('thesis')} />
        </div>
        <div>
          <label className="label">Excerpt</label>
          <textarea className="input" rows={2} value={form.excerpt} onChange={set('excerpt')} />
        </div>
        <div>
          <label className="label">Контент (HTML — сюда ляжет TipTap, раздел 6.2)</label>
          <textarea className="input font-mono" rows={12} value={form.contentHtml} onChange={set('contentHtml')} />
        </div>
      </div>

      <div className="card space-y-4">
        <div className="flex items-center justify-between">
          <h2 className="font-semibold">Привязки к графу знаний</h2>
          {!isNew && <button type="button" onClick={() => void suggest()} className="btn-secondary">⚡ Подставить цепочку (тикер→компания→индустрия)</button>}
        </div>
        {isNew && <p className="text-sm text-zinc-500">Сохраните статью — затем появится автоподстановка цепочки.</p>}
        <CheckGroup label="Компании" options={dicts.companies} relKey="companyIds" />
        <CheckGroup label="Тикеры" options={dicts.tickers} relKey="tickerIds" render={(o) => `${o.symbol}${o.companyName ? ` · ${o.companyName}` : ''}`} />
        <CheckGroup label="Индустрии" options={dicts.industries} relKey="industryIds" />
        <CheckGroup label="Тренды" options={dicts.trends} relKey="trendIds" />
      </div>

      <div className="flex gap-3">
        <button className="btn" onClick={() => void save()} disabled={busy}>{busy ? 'Сохранение…' : 'Сохранить'}</button>
        {!isNew && form.status !== 'published' && <button className="btn-secondary" onClick={() => void publish()}>Опубликовать</button>}
      </div>
    </div>
  );
}
