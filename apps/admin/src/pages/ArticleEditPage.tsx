import { useEffect, useState, useRef, lazy, Suspense } from 'react';
import { useParams, useNavigate } from 'react-router';
import { stripHtml } from '@newinvest/db/text-utils';
import { api, isAdminRole } from '../api';
import { useAuth } from '../auth';
import PreviewModal from '../components/PreviewModal';
import MediaPickerModal from '../components/MediaPickerModal';
import AiSlopPanel from '../components/AiSlopPanel';
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
  const { user } = useAuth();
  const canEditViews = isAdminRole(user?.role); // ТЗ-03: секция докрутки — только admin/super_admin

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
  const [thesisBusy, setThesisBusy] = useState(false);
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
  const [dealStages, setDealStages] = useState<{ id: number; name: string }[]>([]);
  const [stageIds, setStageIds] = useState<number[]>([]);
  // фазы портфеля (пайплайн/портфель/архив) — 2026-11-18
  const [dealPhases, setDealPhases] = useState<{ id: number; name: string }[]>([]);
  const [phaseIds, setPhaseIds] = useState<number[]>([]);
  const [dicts, setDicts] = useState<{ companies: Option[]; tickers: Option[]; industries: Option[]; trends: Option[] }>({ companies: [], tickers: [], industries: [], trends: [] });
  const [notice, setNotice] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  // ТЗ-11: ИИ-заголовок — 3 варианта на выбор
  const [titleBusy, setTitleBusy] = useState(false);
  const [titleVariants, setTitleVariants] = useState<string[] | null>(null);
  // ТЗ-11: автосохранение черновика раз в минуту
  const [dirty, setDirty] = useState(false);
  const [autoState, setAutoState] = useState<'idle' | 'saving' | 'saved' | 'error'>('idle');
  const [autoSavedAt, setAutoSavedAt] = useState<string | null>(null);
  // ТЗ-03: настройки счётчиков просмотров (докрутка) — только admin/super_admin
  const [viewsBaseOffset, setViewsBaseOffset] = useState('0');
  // стартовая докрутка лайков/репостов (2026-11-17) — та же модель, что у просмотров
  const [likesBaseOffset, setLikesBaseOffset] = useState('0');
  const [sharesBaseOffset, setSharesBaseOffset] = useState('0');
  // итоговые счётчики «как на сайте» — показываем в блоке докрутки (2026-11-18)
  const [counterStats, setCounterStats] = useState<{ views: number; likes: number; shares: number } | null>(null);
  const [bumpEnabled, setBumpEnabled] = useState(false);
  const [bumpEveryHours, setBumpEveryHours] = useState('24');
  const [bumpMin, setBumpMin] = useState('1');
  const [bumpMax, setBumpMax] = useState('3');

  useEffect(() => {
    void (async () => {
      const [companies, tickers, stages, phases, industries, trends, plans] = await Promise.all([
        api<{ companies: Option[] }>('/companies').catch(() => ({ companies: [] })),
        api<{ tickers: Option[] }>('/tickers').catch(() => ({ tickers: [] })),
        api<{ stages: { id: number; name: string }[] }>('/deal-stages').catch(() => ({ stages: [] })),
        api<{ phases: { id: number; name: string }[] }>('/deal-phases').catch(() => ({ phases: [] })),
        api<{ industries: Option[] }>('/industries').catch(() => ({ industries: [] })),
        api<{ trends: Option[] }>('/trends').catch(() => ({ trends: [] })),
        api<{ plans: { id: number; name: string }[] }>('/tariff-plans').catch(() => ({ plans: [] })),
      ]);
      setDicts({ companies: companies.companies, tickers: tickers.tickers, industries: industries.industries, trends: trends.trends });
      setTariffPlans(plans.plans);
      setDealStages(stages.stages);
      setDealPhases(phases.phases);

      if (!isNew && urlType && slug) {
        const detail = await api<{ article: { id: number; type: string; slug: string; title: string; excerpt: string | null; thesis: string | null; contentHtml: string; status: string; coverMediaId: number | null; accessLevel: string | null; accessTariffId: number | null; videoUrl: string | null; stageIds?: number[]; phaseIds?: number[]; viewsBaseOffset: number; viewsAutoBumpEnabled: boolean; viewsAutoBumpEveryHours: number | null; viewsAutoBumpMin: number; viewsAutoBumpMax: number; likesBaseOffset: number; sharesBaseOffset: number }; coverUrl: string | null; meta: { description: string | null }; viewsCount: number; likesCount: number; sharesCount: number }>(`/articles/${urlType}/${slug}`);
        const a = detail.article;
        setForm({
          type: a.type, slug: a.slug, title: a.title, excerpt: a.excerpt ?? '', thesis: a.thesis ?? '',
          contentHtml: a.contentHtml, status: a.status, metaDescription: detail.meta.description ?? '',
          accessLevel: a.accessLevel ?? 'public', accessTariffId: a.accessTariffId ? String(a.accessTariffId) : '',
          videoUrl: a.videoUrl ?? '',
        });
        // ТЗ-03: предзаполнение настроек докрутки (детальный GET отдаёт колонки целиком)
        setViewsBaseOffset(String(a.viewsBaseOffset ?? 0));
        setLikesBaseOffset(String(a.likesBaseOffset ?? 0));
        setSharesBaseOffset(String(a.sharesBaseOffset ?? 0));
        setCounterStats({ views: detail.viewsCount ?? 0, likes: detail.likesCount ?? 0, shares: detail.sharesCount ?? 0 });
        setStageIds(a.stageIds ?? []);
        setPhaseIds(a.phaseIds ?? []);
        setBumpEnabled(a.viewsAutoBumpEnabled ?? false);
        setBumpEveryHours(String(a.viewsAutoBumpEveryHours ?? 24));
        setBumpMin(String(a.viewsAutoBumpMin ?? 1));
        setBumpMax(String(a.viewsAutoBumpMax ?? 3));
        setArticleId(a.id);
        setCoverMediaId(a.coverMediaId);
        setCoverPreview(detail.coverUrl ? (detail.coverUrl.startsWith('/') ? `${window.location.origin}${detail.coverUrl}` : detail.coverUrl) : null);
        const r = await api<{ relations: Relations }>(`/articles/${a.id}/relations`);
        setRels(r.relations);
      }
    })();
  }, [urlType, slug]);

  const set = (k: keyof typeof form) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) => {
    setDirty(true);
    setForm((f) => ({ ...f, [k]: e.target.value }));
  };

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
    setDirty(true);
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
    setDirty(true);
    setForm((f) => ({ ...f, slug: e.target.value }));
  };

  // Смена типа меняет адрес статьи (тип/slug) — при совпадении slug в новом типе
  // сервер отдаст 409 и тип не сохранится (выглядит как «чип не обновился»).
  // Предупреждаем сразу при выборе, а не после сохранения.
  const onTypeChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    const nextType = e.target.value;
    setDirty(true);
    setForm((f) => ({ ...f, type: nextType }));
    setNotice(null);
    setError(null);
    if (!isNew && articleId && nextType !== form.type && form.slug) {
      api<{ exists?: boolean }>(`/articles/slug-exists?type=${encodeURIComponent(nextType)}&slug=${encodeURIComponent(form.slug)}&excludeId=${articleId}`)
        .then((r) => {
          if (r.exists) {
            setError(`Внимание: статья типа «${TYPE_LABELS[nextType as keyof typeof TYPE_LABELS] ?? nextType}» со slug «${form.slug}» уже есть (id совпадения ищите в списке «Статьи»). Сохранение упадёт с 409 — сначала измените slug.`);
          }
        })
        .catch(() => { /* проверка — подсказка, не критична */ });
    }
  };

  const toggle = (key: keyof Relations, id: number) =>
    setRels((r) => ({ ...r, [key]: r[key].includes(id) ? r[key].filter((x) => x !== id) : [...r[key], id] }));

  const save = async () => {
    setBusy(true);
    setError(null);
    setNotice(null);
    try {
      let id = articleId;
      const payload: Record<string, unknown> = {
        ...form,
        // пустая строка videoUrl не шлём — сервер валидирует её как URL и отдаёт 400
        videoUrl: form.videoUrl || undefined,
        // null шлём осознанно — сервер снимает обложку (coverMediaId nullable в patch-схеме)
        coverMediaId,
        accessTariffId: form.accessLevel === 'tariff' && form.accessTariffId ? Number(form.accessTariffId) : undefined,
      };
      // ТЗ-03: настройки докрутки — только существующей статье и только админу (сервер всё равно 403/игнор)
      if (!isNew && id && canEditViews) {
        payload.viewsBaseOffset = Number(viewsBaseOffset) || 0;
        payload.likesBaseOffset = Number(likesBaseOffset) || 0;
        payload.sharesBaseOffset = Number(sharesBaseOffset) || 0;
        payload.viewsAutoBump = bumpEnabled
          ? {
              enabled: true,
              everyHours: Math.min(168, Math.max(1, Number(bumpEveryHours) || 24)),
              min: Math.max(0, Number(bumpMin) || 0),
              max: Math.max(0, Number(bumpMax) || 0),
            }
          : null; // выключить; диапазон на сервере сохраняется (R3.4)
      }
      if (isNew) {
        const created = await api<{ article: { id: number } }>('/articles', { method: 'POST', body: JSON.stringify(payload) });
        id = created.article.id;
        setArticleId(id);
        // новой статье можно было задать просмотры/лайки/репосты до первого сейва — досылаем сразу после создания
        if (canEditViews && (Number(viewsBaseOffset) > 0 || Number(likesBaseOffset) > 0 || Number(sharesBaseOffset) > 0 || bumpEnabled)) {
          await api(`/articles/${id}`, {
            method: 'PATCH',
            body: JSON.stringify({
              viewsBaseOffset: Number(viewsBaseOffset) || 0,
              likesBaseOffset: Number(likesBaseOffset) || 0,
              sharesBaseOffset: Number(sharesBaseOffset) || 0,
              viewsAutoBump: bumpEnabled
                ? {
                    enabled: true,
                    everyHours: Math.min(168, Math.max(1, Number(bumpEveryHours) || 24)),
                    min: Math.max(0, Number(bumpMin) || 0),
                    max: Math.max(0, Number(bumpMax) || 0),
                  }
                : null,
            }),
          });
        }
      } else if (id) {
        await api(`/articles/${id}`, { method: 'PATCH', body: JSON.stringify(payload) });
      }
      if (id) {
        await api(`/articles/${id}/relations`, {
          method: 'PUT',
          body: JSON.stringify({ companyIds: rels.companyIds, tickerIds: rels.tickerIds, industryIds: rels.industryIds, trendIds: rels.trendIds }),
        });
        if (form.type === 'ideya') {
          await api(`/articles/${id}/stages`, { method: 'PUT', body: JSON.stringify({ stageIds }) });
          await api(`/articles/${id}/phases`, { method: 'PUT', body: JSON.stringify({ phaseIds }) });
        }
      }
      setDirty(false);
      setAutoState('idle');
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

  // ---- ИИ-тезис (как в ContentMaster): инвестиционный тезис идеи из текста ----
  const genThesis = async () => {
    setThesisBusy(true);
    setError(null);
    try {
      const plain = stripHtml(form.contentHtml);
      if (plain.length < 50) {
        setError('Сначала заполните текст статьи — генерация читает его целиком');
        return;
      }
      const prompt = [
        'Сформулируй инвестиционный тезис идеи одним абзацем: что покупаем/во что верим, почему сейчас, какой катализатор.',
        `ЗАГОЛОВОК: ${form.title}`,
        form.thesis ? `ТЕКУЩИЙ ТЕЗИС (можно улучшить, не копировать): ${form.thesis}` : '',
        form.excerpt ? `ЛИД: ${form.excerpt}` : '',
        `ТИП МАТЕРИАЛА: инвестиционная идея`,
        'ТРЕБОВАНИЯ: до 300 знаков, конкретика вместо общих слов, без обещаний доходности, на русском.',
        `ТЕКСТ: ${plain.slice(0, 6000)}`,
      ].filter(Boolean).join('\n');
      const res = await api<{ text: string; mock: boolean }>('/media/generate-text', {
        method: 'POST',
        body: JSON.stringify({ prompt, maxChars: 300 }),
      });
      setForm((f) => ({ ...f, thesis: res.text.trim() }));
      setNotice(res.mock ? 'Тезис собран из текста (mock — без ключа LLM)' : 'Тезис сгенерирован ✓');
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Ошибка генерации');
    } finally {
      setThesisBusy(false);
    }
  };

  // ---- ТЗ-11: генерация заголовка — промпт читает ВСЕ поля, модель даёт 3 варианта ----
  // ---- Двухэтапная генерация обложки: этап 1 — DeepSeek пишет фотореалистичный промпт ----
  const genCoverPrompt = async () => {
    setGenBusy(true);
    setGenError(null);
    try {
      const plain = stripHtml(form.contentHtml);
      if (plain.length < 50) {
        setGenError('Сначала заполните текст статьи — промпт пишется из него');
        return;
      }
      const prompt = [
        `ЗАГОЛОВОК: ${form.title}`,
        form.excerpt ? `ЛИД: ${form.excerpt}` : '',
        `ТИП: ${form.type}`,
        `ТЕКСТ: ${plain.slice(0, 4000)}`,
      ].filter(Boolean).join('\n');
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

  const genTitle = async () => {
    setTitleBusy(true);
    setError(null);
    setTitleVariants(null);
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
        'Предложи 3 варианта заголовка для статьи инвестиционного медиа.',
        `ТЕКУЩИЙ ЗАГОЛОВОК (можно улучшить, не копировать): ${form.title}`,
        form.thesis ? `ТЕЗИС: ${form.thesis}` : '',
        form.excerpt ? `ЛИД: ${form.excerpt}` : '',
        entityNames ? `УПОМИНАЮТСЯ: ${entityNames}` : '',
        `ТИП МАТЕРИАЛА: ${{ novost: 'новость', ideya: 'инвестиционная идея', analitika: 'аналитика', sobytie: 'событие', interesnoe: 'интересный разбор' }[form.type] ?? form.type}`,
        'ТРЕБОВАНИЯ: каждый вариант до 100 символов; конкретика (цифры, имена, тикеры) вместо общих слов; без кликбейта; ответь ТОЛЬКО тремя строками — по одному варианту на строку, без нумерации и кавычек.',
        `ТЕКСТ: ${plain.slice(0, 6000)}`,
      ].filter(Boolean).join('\n');
      const res = await api<{ text: string; mock: boolean }>('/media/generate-text', {
        method: 'POST',
        body: JSON.stringify({ prompt, maxChars: 400 }),
      });
      const variants = res.text
        .split(/\n/)
        .map((t) => t.replace(/^\s*[-–—\d.)]+\s*|^["«]+|["»]+\s*$/g, '').trim())
        .filter((t) => t.length > 5)
        .slice(0, 3);
      setTitleVariants(variants.length > 0 ? variants : [res.text.trim()]);
      if (res.mock) setNotice('Заголовок собран из текста (mock — без ключа LLM)');
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Ошибка генерации');
    } finally {
      setTitleBusy(false);
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
    // новая (не сохранённая) статья тоже может: media-строка создаётся сразу,
    // а coverMediaId уедет в payload при первом сейве
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
      if (res.status === 401 && localStorage.getItem('token')) {
        localStorage.removeItem('token');
        window.location.href = '/login';
        return;
      }
      if (!res.ok) throw new Error(body.message ?? JSON.stringify(body));
      setCoverMediaId(body.media.id);
      setDirty(true); // обложка применится при ближайшем сохранении
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

  // ---- ТЗ-11: автосохранение черновика раз в минуту ----
  const autosave = async () => {
    if (!dirty || busy) return;
    if (!form.title.trim() && !stripHtml(form.contentHtml).trim()) return; // пустое не плодим
    setAutoState('saving');
    try {
      let id = articleId;
      const payload: Record<string, unknown> = {
        ...form,
        slug: form.slug || autoSlug || slugify(form.title) || 'novyj-material',
        videoUrl: form.videoUrl || undefined,
        coverMediaId,
        accessTariffId: form.accessLevel === 'tariff' && form.accessTariffId ? Number(form.accessTariffId) : undefined,
        // автосохранение никогда не публикует: новое — только draft, опубликованное — статус не трогаем
        status: isNew || form.status !== 'published' ? 'draft' : undefined,
      };
      // докрутка счётчиков — существующей статье и только админу (сервер всё равно отфильтрует)
      if (!isNew && articleId && canEditViews) {
        payload.viewsBaseOffset = Number(viewsBaseOffset) || 0;
        payload.likesBaseOffset = Number(likesBaseOffset) || 0;
        payload.sharesBaseOffset = Number(sharesBaseOffset) || 0;
      }
      if (isNew) {
        const created = await api<{ article: { id: number } }>('/articles', { method: 'POST', body: JSON.stringify(payload) });
        id = created.article.id;
        setArticleId(id);
        window.history.replaceState(null, '', `/articles/${payload.type}/${payload.slug}/edit`);
        setNotice('Черновик создан автосохранением — продолжайте писать ✓');
      } else if (id) {
        await api(`/articles/${id}`, { method: 'PATCH', body: JSON.stringify(payload) });
      }
      setDirty(false);
      setAutoState('saved');
      setAutoSavedAt(new Date().toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' }));
    } catch {
      setAutoState('error'); // dirty остаётся — повторим на следующем тике
    }
  };
  const autosaveRef = useRef(autosave);
  autosaveRef.current = autosave;
  useEffect(() => {
    const iv = setInterval(() => void autosaveRef.current(), 60_000);
    return () => clearInterval(iv);
  }, []);
  // последний рубеж: подтверждение ухода с несохранёнными правками
  useEffect(() => {
    const h = (e: BeforeUnloadEvent) => {
      if (dirty) {
        e.preventDefault();
        e.returnValue = '';
      }
    };
    window.addEventListener('beforeunload', h);
    return () => window.removeEventListener('beforeunload', h);
  }, [dirty]);

  return (
    <div className="space-y-4">
      <h1 className="text-xl font-bold">{isNew ? 'Новая статья' : 'Редактирование статьи'}</h1>
      {notice && <p className="rounded-lg bg-green-50 px-3 py-2 text-sm text-green-400">{notice}</p>}
      {error && <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-400">{error}</p>}

      <div className="card grid gap-4 sm:grid-cols-3">
        <div>
          <label className="label">Тип</label>
          <select className="input" value={form.type} onChange={onTypeChange}>
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
          <div className="flex items-end justify-between">
            <label className="label">Заголовок</label>
            <button
              type="button"
              className="btn-secondary px-2 py-0.5 text-xs"
              onClick={() => void genTitle()}
              disabled={titleBusy}
              title="3 варианта заголовка на основе текста статьи"
            >
              {titleBusy ? 'Генерируем…' : '✨ Заголовок'}
            </button>
          </div>
          <input className="input" value={form.title} onChange={onTitleChange} required />
          {titleVariants && (
            <div className="mt-2 space-y-1.5">
              {titleVariants.map((v, i) => (
                <button
                  key={i}
                  type="button"
                  onClick={() => { onTitleChange({ target: { value: v } } as React.ChangeEvent<HTMLInputElement>); setTitleVariants(null); setNotice('Заголовок применён ✓'); }}
                  className="block w-full rounded-lg border border-zinc-700 px-3 py-2 text-left text-sm hover:border-[#beff00]/60 hover:bg-zinc-800"
                >
                  {v}
                </button>
              ))}
            </div>
          )}
        </div>
        <div>
          <label className="label">Тезис идеи (для type=ideya)</label>
          <textarea className="input" rows={2} value={form.thesis} onChange={set('thesis')} />
          <button type="button" className="btn-secondary mt-1 py-1 text-xs" disabled={thesisBusy} onClick={() => void genThesis()}>
            {thesisBusy ? 'Генерируем…' : '✨ Тезис из текста'}
          </button>
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
            {/* ТЗ-16: импорт MD подставляет H1 в заголовок и первый абзац в тезис (по чекбоксу) */}
            <RichTextEditor
              value={form.contentHtml}
              onChange={(html) => {
                setDirty(true); // agent-68: без этого автосохранение пропускало и печать, и импорт
                setForm((f) => ({ ...f, contentHtml: html }));
              }}
              importFields={{ title: form.title, thesis: form.thesis }}
              onImportedMeta={({ title, thesis }) => {
                setDirty(true);
                setForm((f) => ({
                  ...f,
                  title: title ?? f.title,
                  thesis: thesis ?? f.thesis,
                  // slug пересобираем только если он пуст или был авто-сгенерирован из старого заголовка
                  slug: title && (f.slug === '' || f.slug === slugify(f.title)) ? slugify(title) : f.slug,
                }));
              }}
            />
          </Suspense>
        </div>
      </div>

      {/* Аудит готового текста на ИИ-штампы (2026-11-20): диагностика → исправление с подтверждением */}
      <AiSlopPanel getHtml={() => form.contentHtml} onApply={(html) => { setForm((f) => ({ ...f, contentHtml: html })); setDirty(true); }} />

      {/* Обложка: текущая + генерация/загрузка */}
      <div className="card space-y-3">
        <div className="flex items-center justify-between">
          <h2 className="font-semibold">Обложка</h2>
          <span className="flex items-center gap-2">
            <button type="button" className="btn-secondary" onClick={() => setPickerOpen(true)}>
              🗂 Из медиатеки
            </button>
            {/* ТЗ-11: обложка доступна ДО первого сейва — media создаётся сразу, coverMediaId в POST */}
            <input
              ref={coverFileRef}
              type="file"
              accept="image/jpeg,image/png,image/webp"
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
          </span>
        </div>
        {isNew && <p className="text-sm text-zinc-500">Обложка встанет на статью при первом сохранении — можно выбрать картинку до него.</p>}
        {coverPreview && (
          <div className="flex items-start gap-4">
            <img src={coverPreview} alt="Обложка" className="h-48 w-36 rounded-lg border border-zinc-800 object-cover" />
            <span className="flex flex-col items-start gap-2">
              {genMock && <span className="rounded-full bg-amber-500/10 px-2 py-1 text-xs text-amber-400">mock — без ключа Kimi</span>}
              <button
                type="button"
                className="btn-secondary"
                onClick={() => {
                  setCoverMediaId(null);
                  setCoverPreview(null); // снимется при сохранении (coverMediaId: null → PATCH)
                }}
              >
                ✕ Убрать обложку
              </button>
            </span>
          </div>
        )}
        {genOpen && (
          <div className="space-y-2 rounded-lg border border-zinc-800 bg-zinc-800/50 p-3">
            <div className="flex items-end justify-between">
              <label className="label">Промпт (этап 1 — из статьи, можно править и копировать)</label>
              <button type="button" className="btn-secondary px-2 py-0.5 text-xs" onClick={() => void genCoverPrompt()} disabled={genBusy}>
                {genBusy && genPrompt === '' ? 'Пишем…' : '✨ Из статьи'}
              </button>
            </div>
            <textarea className="input font-mono" rows={5} value={genPrompt} onChange={(e) => setGenPrompt(e.target.value)} placeholder="Нажмите «✨ Из статьи» — DeepSeek напишет фотореалистичный промпт. При ошибке Kimi промпт останется здесь для копирования." />
            {genError && <p className="text-sm text-red-400">{genError}</p>}
            <button type="button" className="btn" onClick={() => void generateCover()} disabled={genBusy || genPrompt.length < 10}>
              {genBusy ? 'Генерируем…' : 'Сгенерировать (этап 2 — Kimi)'}
            </button>
          </div>
        )}
      </div>

      {/* ТЗ-03: счётчики просмотров — collapsible, только admin/super_admin (ревью v2.1 №9, №10).
          При открытии блока подтягиваем свежие значения из базы (2026-11-18) */}
      {canEditViews && (
        <details
          className="card space-y-4"
          onToggle={(e) => {
            const el = e.currentTarget;
            if (!el.open || isNew || !urlType || !slug) return;
            // свежие seed-значения и итоги: блок могли не открывать давно, данные устарели
            api<{ article: { viewsBaseOffset: number; likesBaseOffset: number; sharesBaseOffset: number; viewsAutoBumpEnabled: boolean; viewsAutoBumpEveryHours: number | null; viewsAutoBumpMin: number; viewsAutoBumpMax: number }; viewsCount: number; likesCount: number; sharesCount: number }>(`/articles/${urlType}/${slug}`)
              .then((d) => {
                setViewsBaseOffset(String(d.article.viewsBaseOffset ?? 0));
                setLikesBaseOffset(String(d.article.likesBaseOffset ?? 0));
                setSharesBaseOffset(String(d.article.sharesBaseOffset ?? 0));
                setBumpEnabled(d.article.viewsAutoBumpEnabled ?? false);
                setBumpEveryHours(String(d.article.viewsAutoBumpEveryHours ?? 24));
                setBumpMin(String(d.article.viewsAutoBumpMin ?? 1));
                setBumpMax(String(d.article.viewsAutoBumpMax ?? 3));
                setCounterStats({ views: d.viewsCount ?? 0, likes: d.likesCount ?? 0, shares: d.sharesCount ?? 0 });
              })
              .catch(() => { /* тихо: значения из начальной загрузки остаются */ });
          }}
        >
          <summary className="cursor-pointer font-semibold">Счётчики (докрутка просмотров, лайков, репостов)</summary>
          {!isNew ? (
            <div className="grid gap-4 sm:grid-cols-4">
              {counterStats && (
                <p className="sm:col-span-4 rounded-lg bg-zinc-800/60 px-3 py-2 text-sm text-zinc-300">
                  Сейчас на сайте: 👁 {counterStats.views.toLocaleString('ru-RU')} просмотров · ♥ {counterStats.likes.toLocaleString('ru-RU')} лайков · ↻ {counterStats.shares.toLocaleString('ru-RU')} репостов
                  <span className="ml-2 text-xs text-zinc-500">(реальные + докрутка; обновляется при открытии блока)</span>
                </p>
              )}
              <div>
                <label className="label">Стартовые просмотры (seed)</label>
                <input
                  className="input"
                  type="number"
                  min={0}
                  max={1000000}
                  value={viewsBaseOffset}
                  onChange={(e) => setViewsBaseOffset(e.target.value)}
                />
                <p className="mt-1 text-xs text-zinc-500">Прибавляется к реальным просмотрам на карточках.</p>
              </div>
              {/* стартовая докрутка лайков/репостов (2026-11-17) */}
              <div>
                <label className="label">Стартовые лайки (seed)</label>
                <input
                  className="input"
                  type="number"
                  min={0}
                  max={1000000}
                  value={likesBaseOffset}
                  onChange={(e) => setLikesBaseOffset(e.target.value)}
                />
                <p className="mt-1 text-xs text-zinc-500">Фейковая база под реальными лайками.</p>
              </div>
              <div>
                <label className="label">Стартовые репосты (seed)</label>
                <input
                  className="input"
                  type="number"
                  min={0}
                  max={1000000}
                  value={sharesBaseOffset}
                  onChange={(e) => setSharesBaseOffset(e.target.value)}
                />
                <p className="mt-1 text-xs text-zinc-500">Фейковая база под реальными репостами.</p>
              </div>
              <div className="sm:col-span-3">
                <label className="flex items-center gap-2">
                  <input type="checkbox" checked={bumpEnabled} onChange={(e) => setBumpEnabled(e.target.checked)} />
                  <span className="label">Автодокрутка (раз в N часов добавляется случайное число из диапазона)</span>
                </label>
                {bumpEnabled && (
                  <div className="mt-3 grid gap-4 sm:grid-cols-3">
                    <div>
                      <label className="label">Каждые, часов (1–168)</label>
                      <input className="input" type="number" min={1} max={168} value={bumpEveryHours} onChange={(e) => setBumpEveryHours(e.target.value)} />
                    </div>
                    <div>
                      <label className="label">Мин. добавка</label>
                      <input className="input" type="number" min={0} max={10000} value={bumpMin} onChange={(e) => setBumpMin(e.target.value)} />
                    </div>
                    <div>
                      <label className="label">Макс. добавка</label>
                      <input className="input" type="number" min={0} max={10000} value={bumpMax} onChange={(e) => setBumpMax(e.target.value)} />
                    </div>
                  </div>
                )}
                {!bumpEnabled && <p className="mt-1 text-xs text-zinc-500">Выключено — диапазон сохранится для повторного включения.</p>}
              </div>
            </div>
          ) : (
            <p className="text-sm text-zinc-500">Сохраните статью — затем появятся настройки счётчиков.</p>
          )}
        </details>
      )}

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

        {form.type === 'ideya' && dealPhases.length > 0 && (
          <div>
            <span className="label">Фаза портфеля</span>
            <div className="flex flex-wrap gap-1.5">
              {dealPhases.map((ph) => {
                const on = phaseIds.includes(ph.id);
                return (
                  <button
                    key={ph.id}
                    type="button"
                    onClick={() => { setDirty(true); setPhaseIds(on ? phaseIds.filter((x) => x !== ph.id) : [ph.id]); }}
                    className={`rounded-full px-3 py-1 text-xs ${on ? 'bg-[#beff00] font-semibold text-black' : 'bg-zinc-800 text-zinc-300 hover:bg-zinc-700'}`}
                  >
                    {ph.name}
                  </button>
                );
              })}
            </div>
            <p className="mt-1 text-xs text-zinc-600">Раздел в скринере «Скринер проектов»: идея → пайплайн → портфель → архив.</p>
          </div>
        )}

        {form.type === 'ideya' && dealStages.length > 0 && (
          <div>
            <span className="label">Стадия идеи (таймлайн пайплайна)</span>
            <div className="flex flex-wrap gap-1.5">
              {dealStages.map((st) => {
                const on = stageIds.includes(st.id);
                return (
                  <button
                    key={st.id}
                    type="button"
                    onClick={() => { setDirty(true); setStageIds(on ? stageIds.filter((x) => x !== st.id) : [st.id]); }}
                    className={`rounded-full px-3 py-1 text-xs ${on ? 'bg-[#beff00] font-semibold text-black' : 'bg-zinc-800 text-zinc-300 hover:bg-zinc-700'}`}
                  >
                    {st.name}
                  </button>
                );
              })}
            </div>
            <p className="mt-1 text-xs text-zinc-600">Статус виден на карточке идеи и в скринере («Торги на бирже» включает график тикера на сайте).</p>
          </div>
        )}
      </div>

      <div className="flex gap-3">
        <button className="btn" onClick={() => void save()} disabled={busy}>{busy ? 'Сохранение…' : 'Сохранить'}</button>
        {!isNew && form.status !== 'published' && <button className="btn-secondary" onClick={() => void publish()}>Опубликовать</button>}
        {!isNew && form.status === 'published' && <button className="btn-secondary" onClick={() => void unpublish()}>Вернуть в черновик</button>}
        <button type="button" className="btn-secondary" onClick={() => setPreviewOpen(true)}>👁 Превью</button>
        <span className="ml-auto self-center text-xs text-zinc-500">
          {autoState === 'saving' && 'Автосохранение…'}
          {autoState === 'saved' && <span className="text-green-400">Черновик сохранён в {autoSavedAt}</span>}
          {autoState === 'error' && <span className="text-red-400">Автосохранение не удалось — попробуем через минуту</span>}
          {autoState === 'idle' && dirty && 'Есть несохранённые правки'}
          {autoState === 'idle' && !dirty && 'Автосохранение: вкл'}
        </span>
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
