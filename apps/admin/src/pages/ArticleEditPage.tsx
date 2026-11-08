import { useEffect, useState, useRef, lazy, Suspense } from 'react';
import { useParams, useNavigate } from 'react-router';
import { stripHtml } from '@newinvest/db/text-utils';
import { api } from '../api';
import PreviewModal from '../components/PreviewModal';
import MediaPickerModal from '../components/MediaPickerModal';
import EntityCloud from '../components/EntityCloud';
import { toEmbedUrl } from '../lib/video';

// TipTap тяжёлый (~450 KB) — грузим редактор лениво, только в редакторе статьи
const RichTextEditor = lazy(() =>
  import('../components/RichTextEditor').then((m) => ({ default: m.RichTextEditor })),
);

const TYPES = ['novost', 'ideya', 'sobytie', 'analitika', 'interesnoe', 'video'] as const;
const TYPE_LABELS: Record<string, string> = {
  novost: 'Новость', ideya: 'Идея', sobytie: 'Событие', analitika: 'Аналитика', interesnoe: 'Интересное', video: 'Видео',
};

interface Option { id: number; name: string; symbol?: string; companyName?: string }
interface Relations { companyIds: number[]; tickerIds: number[]; industryIds: number[]; trendIds: number[]; storyIds: number[] }

const EMPTY: Relations = { companyIds: [], tickerIds: [], industryIds: [], trendIds: [], storyIds: [] };

export default function ArticleEditPage() {
  const { type: urlType, slug } = useParams();
  const isNew = !slug;
  const navigate = useNavigate();

  const [form, setForm] = useState({
    type: 'novost', slug: '', title: '', excerpt: '', thesis: '', contentHtml: '', status: 'draft', metaDescription: '',
    accessLevel: 'public', accessTariffId: '', videoUrl: '',
  });
  const [articleId, setArticleId] = useState<number | null>(null);
  const [coverMediaId, setCoverMediaId] = useState<number | null>(null);
  const [coverPreview, setCoverPreview] = useState<string | null>(null);
  const [genOpen, setGenOpen] = useState(false);
  const [genPrompt, setGenPrompt] = useState('');
  const [genBusy, setGenBusy] = useState(false);
  const [excerptBusy, setExcerptBusy] = useState(false);
  const [excerptSize, setExcerptSize] = useState(250);
  const [excerptMock, setExcerptMock] = useState(false);
  const [metaBusy, setMetaBusy] = useState(false);
  const [metaSize, setMetaSize] = useState(200);
  const [metaMock, setMetaMock] = useState(false);
  const [previewOpen, setPreviewOpen] = useState(false);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [genError, setGenError] = useState<string | null>(null);
  const [genMock, setGenMock] = useState(false);
  const coverFileRef = useRef<HTMLInputElement>(null);
  const [uploadBusy, setUploadBusy] = useState(false);
  const [rels, setRels] = useState<Relations>(EMPTY);
  const [tariffPlans, setTariffPlans] = useState<{ id: number; name: string }[]>([]);
  const [dicts, setDicts] = useState<{ companies: Option[]; tickers: Option[]; industries: Option[]; trends: Option[] }>({ companies: [], tickers: [], industries: [], trends: [] });
  const [notice, setNotice] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    void (async () => {
      const [companies, tickers, industries, trends, plans] = await Promise.all([
        api<{ companies: Option[] }>('/companies').catch(() => ({ companies: [] })),
        api<{ tickers: Option[] }>('/tickers').catch(() => ({ tickers: [] })),
        api<{ industries: Option[] }>('/industries').catch(() => ({ industries: [] })),
        api<{ trends: Option[] }>('/trends').catch(() => ({ trends: [] })),
        api<{ plans: { id: number; name: string }[] }>('/tariff-plans').catch(() => ({ plans: [] })),
      ]);
      setDicts({ companies: companies.companies, tickers: tickers.tickers, industries: industries.industries, trends: trends.trends });
      setTariffPlans(plans.plans);

      if (!isNew && urlType && slug) {
        const detail = await api<{ article: { id: number; type: string; slug: string; title: string; excerpt: string | null; thesis: string | null; contentHtml: string; status: string; coverMediaId: number | null; accessLevel: string | null; accessTariffId: number | null; videoUrl: string | null }; coverUrl: string | null; meta: { description: string | null } }>(`/articles/${urlType}/${slug}`);
        const a = detail.article;
        setForm({
          type: a.type, slug: a.slug, title: a.title, excerpt: a.excerpt ?? '', thesis: a.thesis ?? '',
          contentHtml: a.contentHtml, status: a.status, metaDescription: detail.meta.description ?? '',
          accessLevel: a.accessLevel ?? 'public', accessTariffId: a.accessTariffId ? String(a.accessTariffId) : '',
          videoUrl: a.videoUrl ?? '',
        });
        setArticleId(a.id);
        setCoverMediaId(a.coverMediaId);
        setCoverPreview(detail.coverUrl ? (detail.coverUrl.startsWith('/') ? `${window.location.origin}${detail.coverUrl}` : detail.coverUrl) : null);
        const r = await api<{ relations: Relations }>(`/articles/${a.id}/relations`);
        setRels(r.relations);
      }
    })();
  }, [urlType, slug]);

  const set = (k: keyof typeof form) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) =>
    setForm((f) => ({ ...f, [k]: e.target.value }));

  // ---- Автогенерация slug из заголовка (транслит, стиль донора) ----
  const [autoSlug, setAutoSlug] = useState<string | null>(null);

  const slugify = (title: string) => {
    const map: Record<string, string> = {
      а: 'a', б: 'b', в: 'v', г: 'g', д: 'd', е: 'e', ё: 'e', ж: 'zh', з: 'z', и: 'i', й: 'j',
      к: 'k', л: 'l', м: 'm', н: 'n', о: 'o', п: 'p', р: 'r', с: 's', т: 't', у: 'u', ф: 'f',
      х: 'h', ц: 'c', ч: 'ch', ш: 'sh', щ: 'shh', ъ: '', ы: 'y', ь: '', э: 'e', ю: 'ju', я: 'ja',
    };
    return title
      .toLowerCase()
      .split('')
      .map((ch) => (map[ch] !== undefined ? map[ch] : ch))
      .join('')
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '')
      .slice(0, 80);
  };

  const onTitleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const title = e.target.value;
    setForm((f) => {
      // перезаписываем slug только если он пуст или равен последнему автогенерированному
      const next = { ...f, title };
      const generated = slugify(title);
      if (autoSlug === null ? f.slug === '' || f.slug === slugify(f.title) : f.slug === autoSlug) {
        next.slug = generated;
        setAutoSlug(generated);
      }
      return next;
    });
  };

  const onSlugManual = (e: React.ChangeEvent<HTMLInputElement>) => {
    setAutoSlug(null); // ручная правка — автогенерацию отключаем
    setForm((f) => ({ ...f, slug: e.target.value }));
  };

  const toggle = (key: keyof Relations, id: number) =>
    setRels((r) => ({ ...r, [key]: r[key].includes(id) ? r[key].filter((x) => x !== id) : [...r[key], id] }));

  const save = async () => {
    setBusy(true);
    setError(null);
    setNotice(null);
    try {
      let id = articleId;
      const payload = {
        ...form,
        coverMediaId: coverMediaId ?? undefined,
        accessTariffId: form.accessLevel === 'tariff' && form.accessTariffId ? Number(form.accessTariffId) : undefined,
      };
      if (isNew) {
        const created = await api<{ article: { id: number } }>('/articles', { method: 'POST', body: JSON.stringify(payload) });
        id = created.article.id;
        setArticleId(id);
      } else if (id) {
        await api(`/articles/${id}`, { method: 'PATCH', body: JSON.stringify(payload) });
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

  const unpublish = async () => {
    if (!articleId) return;
    await api(`/articles/${articleId}`, { method: 'PATCH', body: JSON.stringify({ status: 'draft' }) });
    setForm((f) => ({ ...f, status: 'draft' }));
    setNotice('Возвращено в черновики ✓');
  };

  // ---- Генерация лидa: промпт читает ВСЕ поля формы ----
  const genExcerpt = async () => {
    setExcerptBusy(true);
    setError(null);
    setExcerptMock(false);
    try {
      const entityNames = [
        ...rels.companyIds.map((id) => dicts.companies.find((c) => c.id === id)?.name).filter(Boolean),
        ...rels.tickerIds.map((id) => dicts.tickers.find((t) => t.id === id)?.symbol).filter(Boolean),
        ...rels.trendIds.map((id) => dicts.trends.find((t) => t.id === id)?.name).filter(Boolean),
      ].join(', ');
      const plain = stripHtml(form.contentHtml);
      if (plain.length < 50) {
        setError('Сначала заполните текст статьи — генерация читает его целиком');
        return;
      }
      const prompt = [
        `Напиши лид (краткое описание) для статьи инвестиционного медиа.`,
        `ЗАГОЛОВОК: ${form.title}`,
        form.thesis ? `ТЕЗИС: ${form.thesis}` : '',
        form.excerpt ? `ТЕКУЩИЙ ЛИД (можно улучшить, не копировать): ${form.excerpt}` : '',
        entityNames ? `УПОМИНАЮТСЯ: ${entityNames}` : '',
        `ТИП МАТЕРИАЛА: ${{ novost: 'новость', ideya: 'инвестиционная идея', analitika: 'аналитика', sobytie: 'событие', interesnoe: 'интересный разбор' }[form.type] ?? form.type}`,
        `ТРЕБОВАНИЯ: ${excerptSize}±20% знаков, без воды, без «в этой статье мы расскажем», информативно, на русском.`,
        `ТЕКСТ: ${plain.slice(0, 6000)}`,
      ].filter(Boolean).join('\n');

      const res = await api<{ text: string; mock: boolean }>('/media/generate-text', {
        method: 'POST',
        body: JSON.stringify({ prompt, maxChars: excerptSize }),
      });
      setForm((f) => ({ ...f, excerpt: res.text }));
      setExcerptMock(res.mock);
      setNotice(res.mock ? 'Лид собран из текста (mock — без ключа Kimi)' : 'Лид сгенерирован ✓');
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Ошибка генерации');
    } finally {
      setExcerptBusy(false);
    }
  };

  // ---- Генерация SEO meta description: та же механика, персона «seo» на сервере ----
  const genMeta = async () => {
    setMetaBusy(true);
    setError(null);
    setMetaMock(false);
    try {
      const plain = stripHtml(form.contentHtml);
      if (plain.length < 50) {
        setError('Сначала заполните текст статьи — генерация читает его целиком');
        return;
      }
      const prompt = [
        `Прочитай статью и всё, что есть ниже, и сгенерируй meta description длиной ${metaSize}±10% знаков.`,
        `ЗАГОЛОВОК: ${form.title}`,
        form.thesis ? `ТЕЗИС: ${form.thesis}` : '',
        form.excerpt ? `ЛИД: ${form.excerpt}` : '',
        form.metaDescription ? `ТЕКУЩИЙ META DESCRIPTION (можно улучшить): ${form.metaDescription}` : '',
        `ТРЕБОВАНИЯ: ${metaSize}±10% знаков, ключевые слова из текста естественно, без кликбейта, одно предложение или два коротких, на русском.`,
        `ТЕКСТ: ${plain.slice(0, 6000)}`,
      ].filter(Boolean).join('\n');

      const res = await api<{ text: string; mock: boolean }>('/media/generate-text', {
        method: 'POST',
        body: JSON.stringify({ prompt, maxChars: metaSize, persona: 'seo' }),
      });
      setForm((f) => ({ ...f, metaDescription: res.text.slice(0, 300) }));
      setMetaMock(res.mock);
      setNotice(res.mock ? 'Meta description собран из текста (mock — без ключа Kimi)' : 'Meta description сгенерирован ✓');
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Ошибка генерации');
    } finally {
      setMetaBusy(false);
    }
  };

  // ---- Генерация обложки через Kimi (mock без ключа) ----
  const buildPrompt = () => {
    const context =
      form.thesis || form.excerpt || stripHtml(form.contentHtml).slice(0, 300) || form.title;
    const entityNames = [
      ...rels.companyIds.map((id) => dicts.companies.find((c) => c.id === id)?.name).filter(Boolean),
      ...rels.trendIds.map((id) => dicts.trends.find((t) => t.id === id)?.name).filter(Boolean),
    ].join(', ');
    return [
      `Обложка для статьи инвестиционного медиа «${form.title}».`,
      `Тема: ${context}.`,
      entityNames ? `Ключевые сущности: ${entityNames}.` : '',
      'Стиль: сдержанная венчурная иллюстрация в фирменной палитре сайта — тёмный графитовый фон, оранжевый акцент; абстрактно-технологичный образ темы; без текста, без лиц, без логотипов; вертикальный формат 3:4.',
    ].filter(Boolean).join(' ');
  };

  const generateCover = async () => {
    if (!articleId) return;
    setGenBusy(true);
    setGenError(null);
    try {
      const res = await api<{ url: string; mock: boolean; media: { id: number } }>('/media/generate', {
        method: 'POST',
        body: JSON.stringify({ prompt: genPrompt, articleId }),
      });
      setCoverMediaId(res.media.id);
      setCoverPreview(`${window.location.origin}${res.url}`);
      setGenMock(res.mock);
      setNotice(res.mock ? 'Обложка-сгенерирована (mock-режим, ключ Kimi не задан) ✓' : 'Обложка сгенерирована через Kimi ✓');
    } catch (e) {
      setGenError(e instanceof Error ? e.message : 'Ошибка генерации');
    } finally {
      setGenBusy(false);
    }
  };

  // Загрузка обложки из файла (multipart — в обход JSON-клиента)
  const uploadCover = async (file: File) => {
    if (!articleId) return;
    setUploadBusy(true);
    setError(null);
    try {
      const fd = new FormData();
      fd.append('file', file);
      const res = await fetch('/api/media/upload', {
        method: 'POST',
        headers: { Authorization: `Bearer ${localStorage.getItem('token')}` },
        body: fd,
      });
      const body = await res.json();
      if (!res.ok) throw new Error(body.message ?? JSON.stringify(body));
      setCoverMediaId(body.media.id);
      setCoverPreview(`${window.location.origin}${body.url}`);
      setGenMock(false);
      setNotice('Обложка загружена ✓');
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Ошибка загрузки');
    } finally {
      setUploadBusy(false);
      if (coverFileRef.current) coverFileRef.current.value = '';
    }
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

  return (
    <div className="space-y-4">
      <h1 className="text-xl font-bold">{isNew ? 'Новая статья' : 'Редактирование статьи'}</h1>
      {notice && <p className="rounded-lg bg-green-50 px-3 py-2 text-sm text-green-400">{notice}</p>}
      {error && <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-400">{error}</p>}

      <div className="card grid gap-4 sm:grid-cols-3">
        <div>
          <label className="label">Тип</label>
          <select className="input" value={form.type} onChange={set('type')}>
            {TYPES.map((t) => <option key={t} value={t}>{TYPE_LABELS[t]}</option>)}
          </select>
        </div>
        <div>
          <label className="label">Slug (латиница-цифры-дефис)</label>
          <input className="input" value={form.slug} onChange={onSlugManual} pattern="[a-z0-9-]+" required />
        </div>
        <div>
          <label className="label">Статус</label>
          <select className="input" value={form.status} onChange={set('status')}>
            <option value="draft">Черновик</option>
            <option value="published">Опубликована</option>
          </select>
        </div>
        <div>
          <label className="label">Доступ (пейволл)</label>
          <select className="input" value={form.accessLevel} onChange={set('accessLevel')}>
            <option value="public">Без регистрации</option>
            <option value="auth">Любой залогиненный</option>
            <option value="tariff">По тарифу…</option>
          </select>
        </div>
        {form.accessLevel === 'tariff' && (
          <div>
            <label className="label">Тариф</label>
            <select className="input" value={form.accessTariffId} onChange={set('accessTariffId')}>
              <option value="">— выберите тариф</option>
              {tariffPlans.map((p) => (
                <option key={p.id} value={p.id}>{p.name}</option>
              ))}
            </select>
          </div>
        )}
      </div>

      <div className="card space-y-4">
        <div>
          <label className="label">Заголовок</label>
          <input className="input" value={form.title} onChange={onTitleChange} required />
        </div>
        <div>
          <label className="label">Тезис идеи (для type=ideya)</label>
          <textarea className="input" rows={2} value={form.thesis} onChange={set('thesis')} />
        </div>
        {form.type === 'video' && (
          <div>
            <label className="label">Ссылка на видео (YouTube / RuTube / VK — встроится плеером)</label>
            <input
              className="input font-mono"
              placeholder="https://www.youtube.com/watch?v=…"
              value={form.videoUrl}
              onChange={set('videoUrl')}
            />
            {form.videoUrl && !toEmbedUrl(form.videoUrl) && (
              <p className="mt-1 text-xs text-amber-400">Платформа не распознана — проверьте ссылку (поддерживаются YouTube, RuTube, VK, Vimeo, Dailymotion)</p>
            )}
          </div>
        )}
        <div>
          <label className="label">Excerpt</label>
          <textarea className="input" rows={2} value={form.excerpt} onChange={set('excerpt')} />
          <div className="mt-1.5 flex items-center gap-2">
            <select className="input max-w-[130px] py-1 text-xs" value={excerptSize} onChange={(e) => setExcerptSize(Number(e.target.value))}>
              <option value={150}>≈150 знаков</option>
              <option value={250}>≈250 знаков</option>
              <option value={400}>≈400 знаков</option>
            </select>
            <button type="button" className="btn-secondary py-1 text-xs" disabled={excerptBusy} onClick={() => void genExcerpt()}>
              {excerptBusy ? 'Генерируем…' : '✨ Сгенерировать из текста'}
            </button>
            {excerptMock && <span className="text-xs text-zinc-500">mock (без ключа)</span>}
          </div>
        </div>
        <div>
          <label className="label">SEO meta description (до 300 символов)</label>
          <input className="input" maxLength={300} value={form.metaDescription} onChange={set('metaDescription')} />
          <div className="mt-1.5 flex items-center gap-2">
            <select className="input max-w-[130px] py-1 text-xs" value={metaSize} onChange={(e) => setMetaSize(Number(e.target.value))}>
              <option value={150}>≈150 знаков</option>
              <option value={200}>≈200 знаков</option>
              <option value={300}>≈300 знаков</option>
            </select>
            <button type="button" className="btn-secondary py-1 text-xs" disabled={metaBusy} onClick={() => void genMeta()}>
              {metaBusy ? 'Генерируем…' : '✨ Сгенерировать (SEO)'}
            </button>
            {metaMock && <span className="text-xs text-zinc-500">mock (без ключа)</span>}
          </div>
        </div>
        <div>
          <label className="label">Контент</label>
          <Suspense fallback={<div className="input min-h-[320px] animate-pulse text-zinc-500">Загружаем редактор…</div>}>
            <RichTextEditor value={form.contentHtml} onChange={(html) => setForm((f) => ({ ...f, contentHtml: html }))} />
          </Suspense>
        </div>
      </div>

      {/* Обложка: текущая + генерация/загрузка */}
      <div className="card space-y-3">
        <div className="flex items-center justify-between">
          <h2 className="font-semibold">Обложка</h2>
          <span className="flex items-center gap-2">
            <button type="button" className="btn-secondary" onClick={() => setPickerOpen(true)}>
              🗂 Из медиатеки
            </button>
            {!isNew && (
              <>
                <input
                  ref={coverFileRef}
                  type="file"
                  accept="image/jpeg,image/png,image/webp,image/svg+xml"
                  className="hidden"
                  onChange={(e) => e.target.files?.[0] && void uploadCover(e.target.files[0])}
                />
                <button type="button" className="btn-secondary" disabled={uploadBusy} onClick={() => coverFileRef.current?.click()}>
                  {uploadBusy ? 'Загружаем…' : '⬆ Загрузить картинку'}
                </button>
                <button
                  type="button"
                  className="btn-secondary"
                  onClick={() => {
                    setGenPrompt(buildPrompt());
                    setGenOpen(!genOpen);
                  }}
                >
                  ✨ Сгенерировать обложку
                </button>
              </>
            )}
          </span>
        </div>
        {isNew && <p className="text-sm text-zinc-500">Сохраните статью — затем появится генерация обложки.</p>}
        {coverPreview && (
          <div className="flex items-start gap-4">
            <img src={coverPreview} alt="Обложка" className="h-48 w-36 rounded-lg border border-zinc-800 object-cover" />
            {genMock && <span className="rounded-full bg-amber-500/10 px-2 py-1 text-xs text-amber-400">mock — без ключа Kimi</span>}
          </div>
        )}
        {genOpen && (
          <div className="space-y-2 rounded-lg border border-zinc-800 bg-zinc-800/50 p-3">
            <label className="label">Промпт (собран из контекста статьи — можно редактировать)</label>
            <textarea className="input font-mono" rows={5} value={genPrompt} onChange={(e) => setGenPrompt(e.target.value)} />
            {genError && <p className="text-sm text-red-400">{genError}</p>}
            <button type="button" className="btn" onClick={() => void generateCover()} disabled={genBusy || genPrompt.length < 10}>
              {genBusy ? 'Генерируем…' : 'Сгенерировать'}
            </button>
          </div>
        )}
      </div>

      <div className="card space-y-4">
        <div className="flex items-center justify-between">
          <h2 className="font-semibold">Привязки к графу знаний</h2>
          {!isNew && <button type="button" onClick={() => void suggest()} className="btn-secondary">⚡ Подставить цепочку (тикер→компания→индустрия)</button>}
        </div>
        {isNew && <p className="text-sm text-zinc-500">Сохраните статью — затем появится автоподстановка цепочки.</p>}

        <EntityCloud
          label="Компании"
          options={dicts.companies}
          selectedIds={rels.companyIds}
          onToggle={(id) => toggle('companyIds', id)}
          onCreated={(o) => {
            setDicts((d) => ({ ...d, companies: [...d.companies, o] }));
            setRels((r) => (r.companyIds.includes(o.id) ? r : { ...r, companyIds: [...r.companyIds, o.id] }));
            setNotice(`Компания «${o.name}» создана и привязана ✓`);
          }}
          createEndpoint="/companies"
          buildCreateBody={(raw) => ({ name: raw, slug: slugify(raw) || `c${Date.now()}` })}
        />

        <EntityCloud
          label="Тикеры"
          options={dicts.tickers}
          selectedIds={rels.tickerIds}
          onToggle={(id) => toggle('tickerIds', id)}
          onCreated={(o) => {
            setDicts((d) => ({ ...d, tickers: [...d.tickers, o] }));
            setRels((r) => (r.tickerIds.includes(o.id) ? r : { ...r, tickerIds: [...r.tickerIds, o.id] }));
            setNotice(`Тикер ${o.name} создан и привязан ✓ (компанию укажите позже в разделе «Тикеры»)`);
          }}
          createEndpoint="/tickers"
          placeholder="Символ, напр. SPCX — Enter создаст"
          validate={(raw) => (/^[A-Z0-9.-]{1,15}$/i.test(raw) ? null : 'Тикер: латиница/цифры, до 15 символов')}
          buildCreateBody={(raw) => {
            const symbol = raw.toUpperCase();
            return { symbol, slug: symbol.toLowerCase() };
          }}
          renderOption={(o) => (o as Option).symbol ? `${(o as Option).symbol}${(o as Option).companyName ? ` · ${(o as Option).companyName}` : ''}` : o.name}
        />

        <EntityCloud
          label="Индустрии"
          options={dicts.industries}
          selectedIds={rels.industryIds}
          onToggle={(id) => toggle('industryIds', id)}
          onCreated={(o) => {
            setDicts((d) => ({ ...d, industries: [...d.industries, o] }));
            setRels((r) => (r.industryIds.includes(o.id) ? r : { ...r, industryIds: [...r.industryIds, o.id] }));
            setNotice(`Индустрия «${o.name}» создана и привязана ✓`);
          }}
          createEndpoint="/industries"
          buildCreateBody={(raw) => ({ name: raw, slug: slugify(raw) || `i${Date.now()}` })}
        />

        <EntityCloud
          label="Тренды"
          options={dicts.trends}
          selectedIds={rels.trendIds}
          onToggle={(id) => toggle('trendIds', id)}
          onCreated={(o) => {
            setDicts((d) => ({ ...d, trends: [...d.trends, o] }));
            setRels((r) => (r.trendIds.includes(o.id) ? r : { ...r, trendIds: [...r.trendIds, o.id] }));
            setNotice(`Тренд «${o.name}» создан и привязан ✓`);
          }}
          createEndpoint="/trends"
          buildCreateBody={(raw) => ({ name: raw, slug: slugify(raw) || `t${Date.now()}` })}
        />
      </div>

      <div className="flex gap-3">
        <button className="btn" onClick={() => void save()} disabled={busy}>{busy ? 'Сохранение…' : 'Сохранить'}</button>
        {!isNew && form.status !== 'published' && <button className="btn-secondary" onClick={() => void publish()}>Опубликовать</button>}
        {!isNew && form.status === 'published' && <button className="btn-secondary" onClick={() => void unpublish()}>Вернуть в черновик</button>}
        <button type="button" className="btn-secondary" onClick={() => setPreviewOpen(true)}>👁 Превью</button>
      </div>

      {previewOpen && (
        <PreviewModal
          title={form.title}
          type={form.type}
          thesis={form.thesis}
          excerpt={form.excerpt}
          contentHtml={form.contentHtml}
          coverUrl={coverPreview}
          onClose={() => setPreviewOpen(false)}
        />
      )}

      {pickerOpen && (
        <MediaPickerModal
          selectedId={coverMediaId}
          onSelect={(m) => {
            setCoverMediaId(m.id);
            setCoverPreview(m.filePath.startsWith('/') ? `${window.location.origin}${m.filePath}` : m.filePath);
            setGenMock(false);
            setPickerOpen(false);
            setNotice(`Обложка выбрана из медиатеки (#${m.id}) — не забудьте сохранить`);
          }}
          onClose={() => setPickerOpen(false)}
        />
      )}
    </div>
  );
}
