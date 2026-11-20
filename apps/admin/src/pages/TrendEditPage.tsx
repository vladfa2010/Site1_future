import { useEffect, useRef, useState } from 'react';
import { useParams } from 'react-router';
import { api } from '../api';
import { RichTextEditor } from '../components/RichTextEditor';
import MediaPickerModal from '../components/MediaPickerModal';
import { stripHtml } from '@newinvest/db/text-utils';

/**
 * Редактор тренда — паритет возможностей с редактором статьи (2026-11-20):
 * обложка (загрузка/генерация/медиатека), SEO description с ИИ, ИИ-название,
 * лонгрид с вставкой картинок из медиатеки (тулбар RichTextEditor).
 */
export default function TrendEditPage() {
  const { id } = useParams();
  const [form, setForm] = useState({ slug: '', name: '', description: '', status: 'active' });
  const [metaDescription, setMetaDescription] = useState('');
  const [notice, setNotice] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  // обложка (как в редакторе статьи)
  const [coverMediaId, setCoverMediaId] = useState<number | null>(null);
  const [coverPreview, setCoverPreview] = useState<string | null>(null);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [uploadBusy, setUploadBusy] = useState(false);
  const [genOpen, setGenOpen] = useState(false);
  const [genPrompt, setGenPrompt] = useState('');
  const [genBusy, setGenBusy] = useState(false);
  const [genError, setGenError] = useState<string | null>(null);
  const [genMock, setGenMock] = useState(false);
  const coverFileRef = useRef<HTMLInputElement>(null);

  // ИИ-кнопки
  const [aiBusy, setAiBusy] = useState<string | null>(null);
  const [nameVariants, setNameVariants] = useState<string[] | null>(null);

  useEffect(() => {
    void (async () => {
      // публичный список: найдём по id → деталь по slug (там обложка и meta)
      const { trends } = await api<{ trends: { id: number; slug: string; name: string; description: string | null; status: string }[] }>('/trends');
      const t = trends.find((x) => x.id === Number(id));
      if (!t) { setError('Тренд не найден'); return; }
      const detail = await api<{ trend: { slug: string; name: string; description: string | null; status: string; coverMediaId: number | null }; coverUrl: string | null; meta: { description: string | null } }>(`/trends/${t.slug}`);
      setForm({ slug: detail.trend.slug, name: detail.trend.name, description: detail.trend.description ?? '', status: detail.trend.status });
      setMetaDescription(detail.meta.description ?? '');
      setCoverMediaId(detail.trend.coverMediaId);
      setCoverPreview(detail.coverUrl ? (detail.coverUrl.startsWith('/') ? `${window.location.origin}${detail.coverUrl}` : detail.coverUrl) : null);
    })().catch(() => setError('Ошибка загрузки'));
  }, [id]);

  const save = async () => {
    setError(null);
    setNotice(null);
    setBusy(true);
    try {
      await api(`/trends/${id}`, {
        method: 'PATCH',
        body: JSON.stringify({ ...form, metaDescription: metaDescription.trim() || undefined, coverMediaId }),
      });
      setNotice('Сохранено ✓');
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Ошибка сохранения');
    } finally {
      setBusy(false);
    }
  };

  const uploadCover = async (file: File) => {
    setUploadBusy(true);
    setError(null);
    try {
      const fd = new FormData();
      fd.append('file', file);
      const token = localStorage.getItem('token');
      const res = await fetch('/api/media/upload', {
        method: 'POST',
        headers: token ? { Authorization: `Bearer ${token}` } : {},
        body: fd,
      });
      if (res.status === 401 && token) {
        localStorage.removeItem('token');
        window.location.href = '/login';
        return;
      }
      const body = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(body.message ?? JSON.stringify(body));
      setCoverMediaId(body.media.id);
      setCoverPreview(`${window.location.origin}${body.url}`);
      setGenMock(false);
      setNotice('Обложка загружена — не забудьте сохранить ✓');
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Ошибка загрузки');
    } finally {
      setUploadBusy(false);
      if (coverFileRef.current) coverFileRef.current.value = '';
    }
  };

  /** Этап 1 генерации обложки: LLM пишет фотореалистичный промпт из лонгрида. */
  const genCoverPrompt = async () => {
    const plain = stripHtml(form.description);
    if (plain.length < 50 && form.name.trim().length < 5) {
      setGenError('Сначала заполните название/лонгрид — промпт пишется из них');
      return;
    }
    setGenBusy(true);
    setGenError(null);
    try {
      const prompt = [
        `ЗАГОЛОВОК: ${form.name}`,
        `ТЕКСТ: ${(plain || form.name).slice(0, 4000)}`,
      ].join('\n');
      const res = await api<{ text: string; mock: boolean }>('/media/generate-text', {
        method: 'POST',
        body: JSON.stringify({ prompt, maxChars: 700, persona: 'visual' }),
      });
      setGenPrompt(res.text.trim());
      if (res.mock) setGenError('Промпт собран из текста (mock — без ключа LLM). Его можно править и копировать.');
    } catch (e) {
      setGenError(e instanceof Error ? e.message : 'Ошибка генерации промпта');
    } finally {
      setGenBusy(false);
    }
  };

  /** Этап 2: рисуем через Kimi (media без привязки, coverMediaId в PATCH при сохранении). */
  const generateCover = async () => {
    if (genPrompt.trim().length < 10) {
      setGenError('Сначала получите промпт («✨ Из текста») — его можно подправить');
      return;
    }
    setGenBusy(true);
    setGenError(null);
    try {
      const res = await api<{ url: string; mock: boolean; media: { id: number } }>('/media/generate', {
        method: 'POST',
        body: JSON.stringify({ prompt: genPrompt.trim() }),
      });
      setCoverMediaId(res.media.id);
      setCoverPreview(`${window.location.origin}${res.url}`);
      setGenMock(res.mock);
      setNotice(res.mock ? 'Обложка сгенерирована (mock — без ключа Kimi) — не забудьте сохранить' : 'Обложка сгенерирована через Kimi — не забудьте сохранить ✓');
    } catch (e) {
      setGenError(e instanceof Error ? e.message : 'Ошибка генерации обложки');
    } finally {
      setGenBusy(false);
    }
  };

  /** ✨ Название: 3 варианта из лонгрида, клик применяет. */
  const genName = async () => {
    const plain = stripHtml(form.description);
    if (plain.length < 50) { setError('Сначала заполните лонгрид — название пишется из него'); return; }
    setAiBusy('name');
    setError(null);
    try {
      const prompt = [
        'Предложи 3 варианта названия для лендинга тренда инвестиционного медиа.',
        form.name ? `ТЕКУЩЕЕ НАЗВАНИЕ (можно улучшить, не копировать): ${form.name}` : '',
        'ТРЕБОВАНИЯ: каждый вариант до 60 символов; конкретика вместо общих слов; ответь ТОЛЬКО тремя строками — по варианту на строку, без нумерации и кавычек.',
        `ТЕКСТ: ${plain.slice(0, 6000)}`,
      ].filter(Boolean).join('\n');
      const res = await api<{ text: string; mock: boolean }>('/media/generate-text', {
        method: 'POST',
        body: JSON.stringify({ prompt, maxChars: 300 }),
      });
      const variants = res.text.split(/\n/).map((t) => t.replace(/^\s*[-–—\d.)]+\s*|^["«]+|["»]+\s*$/g, '').trim()).filter((t) => t.length > 3).slice(0, 3);
      setNameVariants(variants.length > 0 ? variants : [res.text.trim()]);
      if (res.mock) setNotice('Название собрано из текста (mock — без ключа LLM)');
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Ошибка генерации');
    } finally {
      setAiBusy(null);
    }
  };

  /** ✨ SEO description из лонгрида (персона seo). */
  const genSeo = async () => {
    const plain = stripHtml(form.description);
    if (plain.length < 50) { setError('Сначала заполните лонгрид — SEO пишется из него'); return; }
    setAiBusy('seo');
    setError(null);
    try {
      const prompt = [
        'Прочитай текст и сгенерируй meta description лендинга тренда.',
        `НАЗВАНИЕ: ${form.name}`,
        metaDescription ? `ТЕКУЩИЙ META DESCRIPTION (можно улучшить): ${metaDescription}` : '',
        'ТРЕБОВАНИЯ: 200±10% знаков, ключевые слова из текста естественно, без кликбейта, одно предложение или два коротких, на русском.',
        `ТЕКСТ: ${plain.slice(0, 6000)}`,
      ].filter(Boolean).join('\n');
      const res = await api<{ text: string; mock: boolean }>('/media/generate-text', {
        method: 'POST',
        body: JSON.stringify({ prompt, maxChars: 200, persona: 'seo' }),
      });
      setMetaDescription(res.text.trim().slice(0, 300));
      if (res.mock) setNotice('SEO собрано из текста (mock — без ключа LLM)');
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Ошибка генерации');
    } finally {
      setAiBusy(null);
    }
  };

  return (
    <div className="space-y-4">
      <h1 className="text-xl font-bold">Тренд</h1>
      {notice && <p className="rounded-lg bg-green-50 px-3 py-2 text-sm text-green-700">{notice}</p>}
      {error && <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>}

      <div className="card grid gap-4 sm:grid-cols-3">
        <div>
          <label className="label">Название</label>
          <span className="flex gap-2">
            <input className="input w-full" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
            <button type="button" className="btn-secondary shrink-0" disabled={aiBusy === 'name'} onClick={() => void genName()}>
              {aiBusy === 'name' ? '…' : '✨ Название'}
            </button>
          </span>
          {nameVariants && (
            <span className="mt-2 flex flex-wrap gap-1.5">
              {nameVariants.map((v) => (
                <button key={v} type="button" onClick={() => { setForm((f) => ({ ...f, name: v })); setNameVariants(null); }}
                  className="rounded-full bg-zinc-800 px-2.5 py-1 text-left text-xs text-zinc-200 hover:bg-[#beff00] hover:text-black">
                  {v}
                </button>
              ))}
            </span>
          )}
        </div>
        <div>
          <label className="label">Slug</label>
          <input className="input font-mono" value={form.slug} onChange={(e) => setForm({ ...form, slug: e.target.value })} />
        </div>
        <div>
          <label className="label">Статус</label>
          <select className="input" value={form.status} onChange={(e) => setForm({ ...form, status: e.target.value })}>
            <option value="active">Активен</option>
            <option value="closed">Закрыт</option>
          </select>
        </div>
        <div className="sm:col-span-3">
          <label className="label">SEO description (meta)</label>
          <span className="flex gap-2">
            <input className="input w-full" maxLength={300} value={metaDescription} onChange={(e) => setMetaDescription(e.target.value)} />
            <button type="button" className="btn-secondary shrink-0" disabled={aiBusy === 'seo'} onClick={() => void genSeo()}>
              {aiBusy === 'seo' ? '…' : '✨ (SEO)'}
            </button>
          </span>
        </div>
      </div>

      {/* Обложка: паритет с редактором статьи */}
      <div className="card space-y-3">
        <div className="flex items-center justify-between">
          <h2 className="font-semibold">Обложка</h2>
          <span className="flex items-center gap-2">
            <input
              ref={coverFileRef}
              type="file"
              accept="image/jpeg,image/png,image/webp"
              className="hidden"
              onChange={(e) => e.target.files?.[0] && void uploadCover(e.target.files[0])}
            />
            <button type="button" className="btn-secondary" disabled={uploadBusy} onClick={() => coverFileRef.current?.click()}>
              {uploadBusy ? 'Загружаем…' : '⬆ Загрузить'}
            </button>
            <button type="button" className="btn-secondary" onClick={() => setPickerOpen(true)}>
              🗂 Из медиатеки
            </button>
            <button type="button" className="btn-secondary" onClick={() => { setGenPrompt(''); setGenOpen(!genOpen); }}>
              ✨ Сгенерировать
            </button>
          </span>
        </div>
        {coverPreview && (
          <div className="flex items-start gap-4">
            <img src={coverPreview} alt="Обложка" className="h-40 w-32 rounded-lg border border-zinc-800 object-cover" />
            <span className="flex flex-col items-start gap-2">
              {genMock && <span className="rounded-full bg-amber-500/10 px-2 py-1 text-xs text-amber-400">mock — без ключа Kimi</span>}
              <button type="button" className="btn-secondary" onClick={() => { setCoverMediaId(null); setCoverPreview(null); }}>
                ✕ Убрать обложку
              </button>
              <span className="text-xs text-zinc-600">Обложка видна в карусели «Тренды» на главной и в og:image. Сохраните, чтобы применить.</span>
            </span>
          </div>
        )}
        {genOpen && (
          <div className="space-y-2 rounded-lg border border-zinc-800 bg-zinc-800/50 p-3">
            <div className="flex items-end justify-between">
              <label className="label">Промпт (этап 1 — из текста, можно править и копировать)</label>
              <button type="button" className="btn-secondary px-2 py-0.5 text-xs" onClick={() => void genCoverPrompt()} disabled={genBusy}>
                {genBusy && genPrompt === '' ? 'Пишем…' : '✨ Из текста'}
              </button>
            </div>
            <textarea className="input font-mono" rows={5} value={genPrompt} onChange={(e) => setGenPrompt(e.target.value)} placeholder="Нажмите «✨ Из текста» — DeepSeek напишет фотореалистичный промпт. При ошибке Kimi промпт останется здесь для копирования." />
            {genError && <p className="text-sm text-red-400">{genError}</p>}
            <button type="button" className="btn" onClick={() => void generateCover()} disabled={genBusy || genPrompt.trim().length < 10}>
              {genBusy ? 'Генерируем…' : 'Сгенерировать (этап 2 — Kimi)'}
            </button>
          </div>
        )}
      </div>

      <div className="card">
        <label className="label">Лонгрид лендинга (визуальный редактор; HTML из миграции тоже сюда; картинки — через 📤/🗂/🖼 в тулбаре)</label>
        <RichTextEditor value={form.description} onChange={(html) => setForm({ ...form, description: html })} />
      </div>

      <button className="btn" onClick={() => void save()} disabled={busy}>
        {busy ? 'Сохраняем…' : 'Сохранить'}
      </button>

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
