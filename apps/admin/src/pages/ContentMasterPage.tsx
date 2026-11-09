import { useEffect, useMemo, useRef, useState } from 'react';
import { Link } from 'react-router';
import { api } from '../api';

/**
 * ContentMaster — AI-редактор для быстрого производства черновиков.
 * Сценарий: вставить текст или ссылку → дать инструкцию → получить рерайт →
 * выбрать тип → раскрываются параметры → «Создать черновик» → редактор.
 */

interface FactItem { claim: string; status: string; comment: string }
interface Source { title: string; url: string; snippet: string }
interface RewriteResult {
  title: string;
  html?: string;
  excerpt: string;
  mock: boolean;
  sourceUrl: string | null;
  summary?: string;
  report?: FactItem[];
  sources?: Source[];
}

interface ChatMsg {
  role: 'user' | 'assistant';
  instruction: string;
  result?: RewriteResult;
}

interface Opt { id: number; label: string }

const TYPES = [
  { value: 'novost', label: 'Новость' },
  { value: 'sobytie', label: 'Событие' },
  { value: 'ideya', label: 'Идея' },
  { value: 'analitika', label: 'Аналитика' },
  { value: 'interesnoe', label: 'Интересное' },
  { value: 'video', label: 'Видео' },
] as const;

const RU_TO_LAT: Record<string, string> = {
  а: 'a', б: 'b', в: 'v', г: 'g', д: 'd', е: 'e', ё: 'e', ж: 'zh', з: 'z', и: 'i', й: 'y',
  к: 'k', л: 'l', м: 'm', н: 'n', о: 'o', п: 'p', р: 'r', с: 's', т: 't', у: 'u', ф: 'f',
  х: 'h', ц: 'c', ч: 'ch', ш: 'sh', щ: 'sch', ъ: '', ы: 'y', ь: '', э: 'e', ю: 'yu', я: 'ya',
};

/** Заголовок → slug (кириллица транслитом, как везде на платформе). */
function slugify(title: string): string {
  return title
    .toLowerCase()
    .split('')
    .map((ch) => RU_TO_LAT[ch] ?? ch)
    .join('')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 80) || 'novyj-material';
}

/** Минимальная очистка для ПРЕДПРОСМОТРА (на сайте рендер идёт через полноценный sanitize). */
function previewHtml(html: string): string {
  return html
    .replace(/<(script|iframe|object|embed|form)[\s\S]*?(<\/\1>|$)/gi, '')
    .replace(/\son\w+\s*=\s*"[^"]*"/gi, '')
    .replace(/\son\w+\s*=\s*'[^']*'/gi, '')
    .replace(/javascript:/gi, '');
}

/** Тег-инпут с автодополнением: ввод → дроплист → Enter добавляет. */
function TagInput({ label, value, onChange, fetchOptions, placeholder }: {
  label: string;
  value: Opt[];
  onChange: (o: Opt[]) => void;
  fetchOptions: (q: string) => Promise<Opt[]>;
  placeholder: string;
}) {
  const [q, setQ] = useState('');
  const [opts, setOpts] = useState<Opt[]>([]);
  const [open, setOpen] = useState(false);
  const [focused, setFocused] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const lastQ = useRef<string | null>(null);

  // автодополнение: ТОЛЬКО в фокусе и ТОЛЬКО при реальном изменении текста —
  // иначе дроплист висит сразу и пересобирается после выбора (не даёт вводить)
  useEffect(() => {
    if (!focused) { lastQ.current = null; return; }
    if (lastQ.current === q) return;
    lastQ.current = q;
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => {
      fetchOptions(q.trim())
        .then((list) => {
          setOpts(list.slice(0, 8));
          setOpen(list.length > 0);
        })
        .catch(() => { setOpts([]); setOpen(false); });
    }, 200);
    return () => { if (timer.current) clearTimeout(timer.current); };
  }, [q, focused]); // eslint-disable-line react-hooks/exhaustive-deps

  const add = (o: Opt) => {
    onChange([...value, o]);
    setQ('');
    lastQ.current = ''; // сброс текста ≠ изменение запроса — список не пересобираем
    setOpen(false);
  };

  const visibleOpts = opts.filter((o) => !value.some((v) => v.id === o.id));

  return (
    <div className="relative">
      <span className="label">{label}</span>
      <div className="flex flex-wrap items-center gap-1.5 rounded-lg border border-zinc-700 bg-zinc-950 px-2 py-1.5">
        {value.map((o) => (
          <span key={o.id} className="flex items-center gap-1 rounded-full bg-zinc-800 px-2.5 py-0.5 text-xs text-zinc-200">
            {o.label}
            <button type="button" onClick={() => onChange(value.filter((v) => v.id !== o.id))} className="text-zinc-500 hover:text-red-400">×</button>
          </span>
        ))}
        <input
          className="min-w-32 flex-1 bg-transparent px-1 py-1 text-sm outline-none"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          onFocus={() => { setFocused(true); }}
          onBlur={() => { setTimeout(() => { setOpen(false); setFocused(false); }, 150); }}
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              e.preventDefault();
              if (opts[0]) add(opts[0]);
            }
          }}
          placeholder={placeholder}
        />
      </div>
      {open && visibleOpts.length > 0 && (
        <ul className="absolute z-10 mt-1 w-full rounded-lg border border-zinc-700 bg-zinc-900 py-1 shadow-lg">
          {visibleOpts.map((o) => (
            <li key={o.id}>
              <button type="button" onMouseDown={(e) => { e.preventDefault(); add(o); }} className="w-full px-3 py-1.5 text-left text-sm hover:bg-zinc-800">
                {o.label}
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

export default function ContentMasterPage() {
  const [messages, setMessages] = useState<ChatMsg[]>([]);
  const [source, setSource] = useState('');
  const [instruction, setInstruction] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [active, setActive] = useState<RewriteResult | null>(null);
  const [mode, setMode] = useState<'rewrite' | 'factcheck'>('rewrite');
  const [search, setSearch] = useState(false);

  // параметры черновика
  const [type, setType] = useState<string>('');
  const [title, setTitle] = useState('');
  const [slug, setSlug] = useState('');
  const [slugTouched, setSlugTouched] = useState(false);
  const [excerpt, setExcerpt] = useState('');
  const [thesis, setThesis] = useState('');
  const [sourceUrl, setSourceUrl] = useState('');
  const [videoUrl, setVideoUrl] = useState('');
  const [accessLevel, setAccessLevel] = useState('public');
  const [trends, setTrends] = useState<Opt[]>([]);
  const [companies, setCompanies] = useState<Opt[]>([]);
  const [tickers, setTickers] = useState<Opt[]>([]);
  const [creating, setCreating] = useState(false);
  const [created, setCreated] = useState<{ id: number; type: string; slug: string } | null>(null);

  const listRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    listRef.current?.scrollTo({ top: listRef.current.scrollHeight });
  }, [messages]);

  const autoSlug = useMemo(() => slugify(title), [title]);
  const effectiveSlug = slugTouched ? slug : autoSlug;

  const send = async () => {
    if (!source.trim() || !instruction.trim() || busy) return;
    setBusy(true);
    setError(null);
    const userMsg: ChatMsg = { role: 'user', instruction: instruction.trim() };
    setMessages((m) => [...m, userMsg]);
    try {
      const res = await api<RewriteResult>('/admin/content-master/rewrite', {
        method: 'POST',
        body: JSON.stringify({ source: source.trim(), instruction: instruction.trim(), mode, search }),
      });
      setMessages((m) => [...m, { role: 'assistant', instruction: instruction.trim(), result: res }]);
      setActive(res);
      setTitle(res.title);
      setExcerpt(res.excerpt);
      setSlugTouched(false);
      setSlug('');
      setSourceUrl(res.sourceUrl ?? '');
      setCreated(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Ошибка');
    } finally {
      setBusy(false);
    }
  };

  const createDraft = async () => {
    if (!active || !type || !title.trim() || creating) return;
    setCreating(true);
    setError(null);
    try {
      const created_res = await api<{ article: { id: number } }>('/articles', {
        method: 'POST',
        body: JSON.stringify({
          type,
          slug: effectiveSlug,
          title: title.trim(),
          contentHtml: active.html ?? `<p>${active.summary ?? ''}</p>`,
          excerpt: excerpt.trim() || undefined,
          thesis: thesis.trim() || undefined,
          sourceUrl: sourceUrl.trim() || undefined,
          videoUrl: type === 'video' && videoUrl.trim() ? videoUrl.trim() : undefined,
          accessLevel,
          status: 'draft',
        }),
      });
      await api(`/articles/${created_res.article.id}/relations`, {
        method: 'PUT',
        body: JSON.stringify({
          trendIds: trends.map((t) => t.id),
          companyIds: companies.map((c) => c.id),
          tickerIds: tickers.map((t) => t.id),
        }),
      });
      setCreated({ id: created_res.article.id, type, slug: effectiveSlug });
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Ошибка создания');
    } finally {
      setCreating(false);
    }
  };

  const fetchTrends = async (q: string): Promise<Opt[]> => {
    const d = await api<{ trends: { id: number; name: string }[] }>('/trends');
    return d.trends.filter((t) => t.name.toLowerCase().includes(q.toLowerCase())).map((t) => ({ id: t.id, label: t.name }));
  };
  const fetchCompanies = async (q: string): Promise<Opt[]> => {
    const d = await api<{ companies: { id: number; name: string }[] }>(`/companies?q=${encodeURIComponent(q)}`);
    return d.companies.map((c) => ({ id: c.id, label: c.name }));
  };
  const fetchTickers = async (q: string): Promise<Opt[]> => {
    const d = await api<{ tickers: { id: number; symbol: string }[] }>(`/tickers?q=${encodeURIComponent(q)}`);
    return d.tickers.map((t) => ({ id: t.id, label: t.symbol }));
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-bold">ContentMaster</h1>
        {created && (
          <Link to={`/articles/${created.type}/${created.slug}/edit`} className="btn text-[#beff00]">
            Открыть черновик в редакторе →
          </Link>
        )}
      </div>
      <p className="text-sm text-zinc-500">
        Вставьте текст или ссылку, опишите задачу — AI перепишет материал. Выберите тип, заполните параметры и создайте черновик.
      </p>
      {error && <p className="rounded-lg bg-red-500/10 px-3 py-2 text-sm text-red-400">{error}</p>}

      {/* Чат */}
      <div ref={listRef} className="card max-h-[420px] space-y-4 overflow-y-auto">
        {messages.length === 0 && (
          <p className="text-sm text-zinc-600">История рерайтов появится здесь. Каждый ответ можно превратить в черновик.</p>
        )}
        {messages.map((m, i) =>
          m.role === 'user' ? (
            <div key={i} className="ml-auto max-w-[80%] rounded-lg bg-zinc-800 px-3 py-2 text-sm text-zinc-200">
              {m.instruction}
            </div>
          ) : (
            m.result && (
              <div key={i} className="max-w-[92%] space-y-2 rounded-lg border border-zinc-700 bg-zinc-900/60 p-4">
                <div className="flex items-center justify-between gap-2">
                  <h3 className="font-semibold">{m.result.title}</h3>
                  <div className="flex shrink-0 gap-2">
                    {m.result.mock && <span className="rounded bg-amber-500/10 px-2 py-0.5 text-xs text-amber-400">mock — нет ключа LLM</span>}
                    <button
                      onClick={() => { setActive(m.result!); setTitle(m.result!.title); setExcerpt(m.result!.excerpt); setSourceUrl(m.result!.sourceUrl ?? ''); setCreated(null); setMode(m.result!.report ? 'factcheck' : 'rewrite'); }}
                      className={`rounded px-2 py-0.5 text-xs ${active === m.result ? 'bg-[#beff00] text-black' : 'bg-zinc-800 text-zinc-300 hover:bg-zinc-700'}`}
                    >
                      {active === m.result ? '✓ выбран' : 'взять за основу'}
                    </button>
                  </div>
                </div>
                {m.result.excerpt && <p className="text-sm text-zinc-400">{m.result.excerpt}</p>}
                {m.result.summary && <p className="rounded bg-zinc-800/60 px-3 py-2 text-sm text-zinc-200">{m.result.summary}</p>}
                {m.result.report && m.result.report.length > 0 && (
                  <ul className="space-y-1.5">
                    {m.result.report.map((r, ri) => (
                      <li key={ri} className="flex items-start gap-2 text-sm">
                        <span className={`mt-0.5 shrink-0 rounded px-1.5 py-0.5 text-xs ${r.status === 'confirmed' ? 'bg-green-500/10 text-green-400' : r.status === 'disputed' ? 'bg-red-500/10 text-red-400' : 'bg-amber-500/10 text-amber-400'}`}>
                          {r.status === 'confirmed' ? '✓ подтверждено' : r.status === 'disputed' ? '✗ спорно' : '? не проверено'}
                        </span>
                        <span className="text-zinc-300">{r.claim}</span>
                        {r.comment && <span className="text-xs text-zinc-500">— {r.comment}</span>}
                      </li>
                    ))}
                  </ul>
                )}
                {m.result.sources && m.result.sources.length > 0 && (
                  <div>
                    <span className="label">Источники ({m.result.sources.length})</span>
                    <ul className="space-y-1">
                      {m.result.sources.slice(0, 8).map((src, si) => (
                        <li key={si}>
                          <a href={src.url} target="_blank" rel="noopener noreferrer" className="text-sm text-[#c9ff2a] hover:underline">
                            {src.title || src.url}
                          </a>
                          {src.snippet && <span className="ml-2 text-xs text-zinc-500">{src.snippet.slice(0, 120)}</span>}
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
                {m.result.html && (
                  <div
                    className="prose-sm max-h-56 space-y-2 overflow-y-auto rounded border border-zinc-800 bg-zinc-950 p-3 text-sm leading-relaxed text-zinc-300 [&_h2]:mt-3 [&_h2]:font-bold [&_h3]:mt-2 [&_h3]:font-bold [&_ul]:list-disc [&_ul]:pl-5 [&_blockquote]:border-l-2 [&_blockquote]:border-zinc-700 [&_blockquote]:pl-3 [&_a]:text-[#c9ff2a]"
                    dangerouslySetInnerHTML={{ __html: previewHtml(m.result.html) }}
                  />
                )}
              </div>
            )
          ),
        )}
        {busy && <p className="text-sm text-zinc-500">AI пишет…</p>}
      </div>

      {/* Ввод */}
      <div className="card space-y-3">
        <div>
          <label className="label">Текст или ссылка</label>
          <textarea
            className="input min-h-28 w-full font-mono text-xs"
            value={source}
            onChange={(e) => setSource(e.target.value)}
            placeholder="Вставьте текст статьи или http(s)-ссылку — страница выкачается автоматически"
          />
        </div>
        <div className="flex flex-wrap gap-2">
          <button type="button" className="rounded-full border border-zinc-700 px-3 py-1 text-xs text-zinc-300 hover:border-[#beff00]/50" onClick={() => { setMode('factcheck'); setSearch(true); setInstruction('Проверь факты в тексте: выдели проверяемые утверждения, оцени каждое и укажи источники'); }}>
            🔍 Проверить факты
          </button>
          <button type="button" className="rounded-full border border-zinc-700 px-3 py-1 text-xs text-zinc-300 hover:border-[#beff00]/50" onClick={() => { setMode('rewrite'); setSearch(true); setInstruction('Найди первоисточник этого материала, уточни факты по актуальным источникам и перепиши с ссылками'); }}>
            🌐 Найти первоисточник
          </button>
          <button type="button" className="rounded-full border border-zinc-700 px-3 py-1 text-xs text-zinc-300 hover:border-[#beff00]/50" onClick={() => { setMode('rewrite'); setSearch(false); setInstruction('Перепиши как новость для инвесторов: сохрани факты, добавь контекст, почему это важно для рынка'); }}>
            ✏️ Новость для инвесторов
          </button>
        </div>
        <div>
          <label className="label">Что сделать</label>
          <textarea
            className="input min-h-16 w-full"
            value={instruction}
            onChange={(e) => setInstruction(e.target.value)}
            placeholder="Например: перепиши как новость для инвесторов, сохрани факты, добавь контекст почему это важно"
          />
        </div>
        <div className="flex items-center gap-4">
          <button className="btn" onClick={() => void send()} disabled={busy || !source.trim() || !instruction.trim()}>
            {busy ? 'Пишем…' : mode === 'factcheck' ? 'Проверить' : 'Отправить'}
          </button>
          <label className="flex items-center gap-2 text-sm text-zinc-400" title="Работает с провайдером DeepSeek: модель сама формирует поисковые запросы, поиск исполняет платформа">
            <input type="checkbox" checked={search} onChange={(e) => setSearch(e.target.checked)} />
            искать в интернете
          </label>
          {mode === 'factcheck' && <span className="rounded bg-sky-500/10 px-2 py-0.5 text-xs text-sky-400">режим: фактчек</span>}
        </div>
      </div>

      {/* Параметры черновика */}
      {active && (
        <div className="card space-y-4">
          <h2 className="font-semibold">Черновик</h2>
          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <label className="label">Тип контента</label>
              <select className="input w-full" value={type} onChange={(e) => setType(e.target.value)}>
                <option value="">— выберите тип —</option>
                {TYPES.map((t) => <option key={t.value} value={t.value}>{t.label}</option>)}
              </select>
            </div>
            <div>
              <label className="label">Доступ</label>
              <select className="input w-full" value={accessLevel} onChange={(e) => setAccessLevel(e.target.value)}>
                <option value="public">Открытый</option>
                <option value="auth">Только авторизованным</option>
                <option value="tariff">По тарифу</option>
              </select>
            </div>
            <div className="sm:col-span-2">
              <label className="label">Заголовок</label>
              <input className="input w-full" value={title} onChange={(e) => setTitle(e.target.value)} />
            </div>
            <div>
              <label className="label">Slug</label>
              <input
                className="input w-full font-mono"
                value={effectiveSlug}
                onChange={(e) => { setSlug(e.target.value); setSlugTouched(true); }}
              />
            </div>
            <div>
              <label className="label">Источник (URL)</label>
              <input className="input w-full font-mono" value={sourceUrl} onChange={(e) => setSourceUrl(e.target.value)} placeholder="https://…" />
            </div>
            <div className="sm:col-span-2">
              <label className="label">Лид (excerpt)</label>
              <textarea className="input min-h-14 w-full" value={excerpt} onChange={(e) => setExcerpt(e.target.value)} />
            </div>
            {type === 'ideya' && (
              <div className="sm:col-span-2">
                <label className="label">Тезис идеи</label>
                <textarea className="input min-h-14 w-full" value={thesis} onChange={(e) => setThesis(e.target.value)} />
              </div>
            )}
            {type === 'video' && (
              <div className="sm:col-span-2">
                <label className="label">URL видео</label>
                <input className="input w-full font-mono" value={videoUrl} onChange={(e) => setVideoUrl(e.target.value)} placeholder="https://youtube.com/…" />
              </div>
            )}
            <div className="sm:col-span-2">
              <TagInput label="Тренды" value={trends} onChange={setTrends} fetchOptions={fetchTrends} placeholder="начните вводить тренд…" />
            </div>
            <div className="sm:col-span-2">
              <TagInput label="Компании" value={companies} onChange={setCompanies} fetchOptions={fetchCompanies} placeholder="начните вводить компанию…" />
            </div>
            <div className="sm:col-span-2">
              <TagInput label="Тикеры" value={tickers} onChange={setTickers} fetchOptions={fetchTickers} placeholder="начните вводить тикер…" />
            </div>
          </div>
          <div className="flex items-center gap-3">
            <button className="btn" onClick={() => void createDraft()} disabled={creating || !type || !title.trim()}>
              {creating ? 'Создаём…' : 'Создать черновик'}
            </button>
            {created && <Link to={`/articles/${created.type}/${created.slug}/edit`} className="text-sm text-[#beff00] hover:underline">Открыть в редакторе →</Link>}
            <span className="text-xs text-zinc-600">Обложку и остальное — уже в редакторе статьи</span>
          </div>
        </div>
      )}
    </div>
  );
}
