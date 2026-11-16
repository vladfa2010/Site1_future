import { useEffect, useMemo, useRef, useState } from 'react';
import { Link } from 'react-router';
import { api, ApiError } from '../api';
import { RichTextEditor } from '../components/RichTextEditor';
import { sanitizeArticleHtml } from '../lib/sanitize';

/**
 * ContentMaster — AI-редактор для быстрого производства черновиков.
 * Сценарий: вставить текст или ссылку → дать инструкцию → получить рерайт →
 * выбрать тип → раскрываются параметры → «Создать черновик» → редактор.
 * ТЗ-13: сессии персистентны (история не теряется), ответ стримится (SSE),
 * в сессии модель видит предыдущие ходы.
 */

interface FactItem { claim: string; status: string; comment: string }
interface Source { title: string; url: string; snippet: string }
interface Usage { promptTokens: number; completionTokens: number; totalTokens: number }
interface RewriteResult {
  title: string;
  html?: string;
  excerpt: string;
  mock: boolean;
  sourceUrl: string | null;
  summary?: string;
  report?: FactItem[];
  sources?: Source[];
  sessionId?: number;
  truncated?: boolean;
  usage?: Usage | null;
}

interface ChatMsg {
  role: 'user' | 'assistant';
  instruction: string;
  result?: RewriteResult;
}

interface SessionListItem { id: number; title: string; mode: string; updatedAt: string; messageCount: number }
interface StoredMessage { id: number; role: string; instruction: string; resultJson: string | null }

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
  if (!title) return '';
  return title
    .toLowerCase()
    .split('')
    .map((ch) => RU_TO_LAT[ch] ?? ch)
    .join('')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 80) || 'novyj-material';
}

/** SSE-клиент для /rewrite?stream=true: meta → delta* → done | error.
 *  fetch + ReadableStream, т.к. EventSource не умеет Authorization-заголовок. */
async function streamRewrite(
  body: Record<string, unknown>,
  onDelta: (text: string) => void,
): Promise<RewriteResult> {
  const token = localStorage.getItem('token');
  const res = await fetch('/api/admin/content-master/rewrite', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: JSON.stringify({ ...body, stream: true }),
  });
  if (!res.ok || !res.body) {
    const errBody = await res.json().catch(() => ({}));
    throw new ApiError(res.status, errBody);
  }
  const reader = res.body.getReader();
  const dec = new TextDecoder();
  let buf = '';
  let meta: Record<string, unknown> = {};
  let done: RewriteResult | null = null;
  for (;;) {
    const { done: eof, value } = await reader.read();
    if (eof) break;
    buf += dec.decode(value, { stream: true });
    let sep: number;
    while ((sep = buf.indexOf('\n\n')) >= 0) {
      const raw = buf.slice(0, sep);
      buf = buf.slice(sep + 2);
      const line = raw.split('\n').find((l) => l.startsWith('data: '));
      if (!line) continue;
      const evt = JSON.parse(line.slice(6)) as { type?: string; text?: string; message?: string } & RewriteResult;
      if (evt.type === 'meta') meta = evt as unknown as Record<string, unknown>;
      else if (evt.type === 'delta') onDelta(evt.text ?? '');
      else if (evt.type === 'done') done = evt;
      else if (evt.type === 'error') throw new Error(evt.message ?? 'Ошибка стрима');
    }
  }
  if (!done) throw new Error('Поток закрыт без результата');
  // meta приходит до done — подтягиваем поля, которых может не быть в done
  return { ...meta, ...done } as unknown as RewriteResult;
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
  const [streamText, setStreamText] = useState(''); // живой текст стрима (ТЗ-13)

  // сессии (ТЗ-13)
  const [sessionId, setSessionId] = useState<number | null>(null);
  const [sessions, setSessions] = useState<SessionListItem[]>([]);
  const [loadingSession, setLoadingSession] = useState(false);

  // параметры черновика
  const [type, setType] = useState<string>('');
  const [contentHtml, setContentHtml] = useState(''); // тело черновика — редактируется прямо здесь
  // предложенные AI связи (автоизвлечение после ответа)
  const [suggested, setSuggested] = useState<{ trends: Opt[]; companies: Opt[]; unknown: string[]; mock: boolean } | null>(null);
  const [sugBusy, setSugBusy] = useState(false);
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
  }, [messages, streamText]);

  const autoSlug = useMemo(() => slugify(title), [title]);
  const effectiveSlug = slugTouched ? slug : autoSlug;

  const refreshSessions = async () => {
    try {
      const d = await api<{ sessions: SessionListItem[] }>('/admin/content-master/sessions');
      setSessions(d.sessions);
    } catch { /* список сессий — некритично */ }
  };
  useEffect(() => { void refreshSessions(); }, []);

  const resetWorkspace = () => {
    setMessages([]);
    setSource('');
    setActive(null);
    setSessionId(null);
    setCreated(null);
    setStreamText('');
  };

  const applyResult = (res: RewriteResult) => {
    setActive(res);
    // factcheck-ответ не содержит title — иначе undefined уходит в slugify → краш рендера
    setTitle(res.title ?? '');
    setExcerpt(res.excerpt ?? '');
    setContentHtml(res.html ?? (res.summary ? `<p>${res.summary}</p>` : '')); // фактчек без html — итог в тело
    void extractEntities(res.html ?? source); // связи предлагаем автоматически
    setSlugTouched(false);
    setSlug('');
    // источник в черновик: сначала sourceUrl результата, иначе первый найденный (ТЗ-13 ф.4.2)
    setSourceUrl(res.sourceUrl ?? res.sources?.[0]?.url ?? '');
    setCreated(null);
  };

  const extractEntities = async (text: string) => {
    if (text.trim().length < 50) { setSuggested(null); return; }
    setSugBusy(true);
    try {
      const r = await api<{ trends: { id: number; name: string }[]; companies: { id: number; name: string }[]; unknown: string[]; mock: boolean }>(
        '/admin/content-master/extract',
        { method: 'POST', body: JSON.stringify({ text: text.slice(0, 20_000) }) },
      );
      // сервер отдаёт name, чипсы/теги живут на label — маппим здесь
      setSuggested({
        trends: r.trends.map((t) => ({ id: t.id, label: t.name })),
        companies: r.companies.map((c) => ({ id: c.id, label: c.name })),
        unknown: r.unknown,
        mock: r.mock,
      });
    } catch {
      setSuggested(null); // извлечение — удобство, не критично: молча пропускаем
    } finally {
      setSugBusy(false);
    }
  };

  const createUnknownCompany = async (name: string) => {
    try {
      const res = await api<{ company: { id: number; name: string } }>('/companies', {
        method: 'POST',
        body: JSON.stringify({ name, slug: slugify(name) || `c${Date.now()}` }),
      });
      const opt: Opt = { id: res.company.id, label: res.company.name };
      setCompanies((prev) => (prev.some((c) => c.id === opt.id) ? prev : [...prev, opt]));
      setSuggested((prev) => prev ? { ...prev, unknown: prev.unknown.filter((u) => u !== name) } : prev);
    } catch { /* компания с таким именем может уже существовать — подскажет ошибка при следующем извлечении */ }
  };

  const loadSession = async (id: number) => {
    setLoadingSession(true);
    setError(null);
    try {
      const d = await api<{ session: { id: number; title: string; source: string; mode: string; search: boolean }; messages: StoredMessage[] }>(
        `/admin/content-master/sessions/${id}`,
      );
      const restored: ChatMsg[] = [];
      let lastResult: RewriteResult | null = null;
      for (const m of d.messages) {
        if (m.role === 'user') {
          restored.push({ role: 'user', instruction: m.instruction });
        } else if (m.resultJson) {
          try {
            const result = JSON.parse(m.resultJson) as RewriteResult;
            restored.push({ role: 'assistant', instruction: m.instruction, result });
            lastResult = result;
          } catch { /* битое сообщение пропускаем */ }
        }
      }
      setSessionId(d.session.id);
      setSource(d.session.source);
      setMode('rewrite'); // сессия — это работа над статьёй: новый ход всегда пишет текст; фактчек — по тоглу/пресету
      setSearch(d.session.search);
      setMessages(restored);
      setCreated(null);
      setStreamText('');
      if (lastResult) {
        setActive(lastResult);
        setTitle(lastResult.title ?? ''); // factcheck-сессии без title — иначе slugify краш
        setExcerpt(lastResult.excerpt ?? '');
        setContentHtml(lastResult.html ?? (lastResult.summary ? `<p>${lastResult.summary}</p>` : ''));
        setSourceUrl(lastResult.sourceUrl ?? lastResult.sources?.[0]?.url ?? '');
      } else {
        setActive(null);
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Ошибка загрузки сессии');
    } finally {
      setLoadingSession(false);
    }
  };

  const deleteSession = async (id: number) => {
    try {
      await api(`/admin/content-master/sessions/${id}`, { method: 'DELETE' });
      if (sessionId === id) resetWorkspace();
      await refreshSessions();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Ошибка удаления');
    }
  };

  const send = async () => {
    if (!source.trim() || !instruction.trim() || busy) return;
    setBusy(true);
    setError(null);
    setStreamText('');
    const userMsg: ChatMsg = { role: 'user', instruction: instruction.trim() };
    setMessages((m) => [...m, userMsg]);
    try {
      const res = await streamRewrite(
        {
          source: source.trim(),
          instruction: instruction.trim(),
          mode,
          search,
          ...(sessionId ? { sessionId } : {}),
        },
        (t) => setStreamText((prev) => prev + t),
      );
      setMessages((m) => [...m, { role: 'assistant', instruction: instruction.trim(), result: res }]);
      setSessionId(res.sessionId ?? sessionId);
      applyResult(res);
      // фактчек получен → следующий ход почти всегда «напиши статью»: переключаем режим,
      // иначе модель продолжит отвечать списком утверждений вместо текста
      if (mode === 'factcheck') setMode('rewrite');
      void refreshSessions();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Ошибка');
    } finally {
      setBusy(false);
      setStreamText('');
    }
  };

  const createDraft = async () => {
    if (!active || creating) return;
    // валидация с понятной ошибкой вместо молча-серой кнопки
    if (!type) { setError('Выберите тип контента — без него черновик не создать'); return; }
    if (!title.trim()) { setError('Заголовок пуст — задайте его вручную или сгенерируйте'); return; }
    setCreating(true);
    setError(null);
    try {
      const created_res = await api<{ article: { id: number } }>('/articles', {
        method: 'POST',
        body: JSON.stringify({
          type,
          slug: effectiveSlug,
          title: title.trim(),
          contentHtml: contentHtml || `<p>${active.summary ?? ''}</p>`, // тело могли править руками в панели
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
    // ТЗ-13 ф.4.4: серверная фильтрация вместо выкачивания всех трендов
    const d = await api<{ trends: { id: number; name: string }[] }>(`/trends${q ? `?q=${encodeURIComponent(q)}` : ''}`);
    return d.trends.map((t) => ({ id: t.id, label: t.name }));
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
        Вставьте текст или ссылку, опишите задачу — AI перепишет материал. Ответ приходит по мере генерации.
        В рамках сессии модель помнит предыдущие ходы — можно просить «сделай короче», «добавь цифры».
      </p>
      {error && <p className="rounded-lg bg-red-500/10 px-3 py-2 text-sm text-red-400">{error}</p>}

      {/* Сессии (ТЗ-13) */}
      <div className="card flex flex-wrap items-center gap-2">
        <span className="label mb-0">Сессии</span>
        <select
          className="input min-w-64 flex-1"
          value={sessionId ?? ''}
          disabled={loadingSession}
          onChange={(e) => {
            const v = e.target.value;
            if (!v) resetWorkspace();
            else void loadSession(Number(v));
          }}
        >
          <option value="">— новая сессия —</option>
          {sessions.map((s) => (
            <option key={s.id} value={s.id}>
              {s.title || `Сессия ${s.id}`} · {s.messageCount} сообщ. · {new Date(s.updatedAt).toLocaleString('ru-RU', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })}
            </option>
          ))}
        </select>
        {sessionId && (
          <button
            type="button"
            className="rounded-lg border border-zinc-700 px-3 py-1.5 text-xs text-zinc-400 hover:border-red-500/50 hover:text-red-400"
            onClick={() => void deleteSession(sessionId)}
          >
            удалить сессию
          </button>
        )}
      </div>

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
                      onClick={() => { setActive(m.result!); setTitle(m.result!.title ?? ''); setExcerpt(m.result!.excerpt ?? ''); setContentHtml(m.result!.html ?? (m.result!.summary ? `<p>${m.result!.summary}</p>` : '')); setSourceUrl(m.result!.sourceUrl ?? m.result!.sources?.[0]?.url ?? ''); setCreated(null); setMode(m.result!.report ? 'factcheck' : 'rewrite'); }}
                      className={`rounded px-2 py-0.5 text-xs ${active === m.result ? 'bg-[#beff00] text-black' : 'bg-zinc-800 text-zinc-300 hover:bg-zinc-700'}`}
                    >
                      {active === m.result ? '✓ выбран' : 'взять за основу'}
                    </button>
                  </div>
                </div>
                {m.result.truncated && (
                  <p className="rounded bg-amber-500/10 px-2 py-1 text-xs text-amber-400">
                    Исходный текст обрезан до 15 000 символов — хвост не передан модели
                  </p>
                )}
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
                    dangerouslySetInnerHTML={{ __html: sanitizeArticleHtml(m.result.html) }}
                  />
                )}
                {m.result.usage && (
                  <p className="text-xs text-zinc-600">
                    токенов: {m.result.usage.totalTokens} (вход {m.result.usage.promptTokens} / выход {m.result.usage.completionTokens})
                  </p>
                )}
              </div>
            )
          ),
        )}
        {busy && (
          <div className="max-w-[92%] space-y-2">
            <p className="text-sm text-zinc-500">AI пишет…</p>
            {streamText && (
              <pre className="max-h-40 overflow-y-auto whitespace-pre-wrap rounded border border-zinc-800 bg-zinc-950 p-3 text-sm text-zinc-300">{streamText}</pre>
            )}
          </div>
        )}
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
          <label className="flex items-center gap-2 text-sm text-zinc-400" title="Работает с обоими провайдерами: модель сама формирует поисковые запросы, исполнение — на платформе">
            <input type="checkbox" checked={search} onChange={(e) => setSearch(e.target.checked)} />
            искать в интернете
          </label>
          <button
            type="button"
            onClick={() => setMode(mode === 'factcheck' ? 'rewrite' : 'factcheck')}
            title="Переключить: фактчек — список проверенных утверждений, рерайт — готовый текст"
            className={`rounded px-2 py-0.5 text-xs ${mode === 'factcheck' ? 'bg-sky-500/10 text-sky-400' : 'bg-zinc-800 text-zinc-400 hover:text-zinc-200'}`}
          >
            режим: {mode === 'factcheck' ? 'фактчек' : 'рерайт'} ⇄
          </button>
          {sessionId && <span className="rounded bg-zinc-800 px-2 py-0.5 text-xs text-zinc-400">сессия #{sessionId}</span>}
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
              <label className="label">Контент (то, что пойдёт в статью — можно править прямо здесь)</label>
              <RichTextEditor value={contentHtml} onChange={setContentHtml} />
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
              {(suggested || sugBusy) && (
                <div className="sm:col-span-2 rounded-lg border border-zinc-800 bg-zinc-900/40 p-3">
                  <div className="mb-2 flex items-center justify-between">
                    <span className="label mb-0">Связи из текста (AI) — нажмите, чтобы добавить</span>
                    {sugBusy && <span className="text-xs text-zinc-500">анализ…</span>}
                  </div>
                  {suggested && (
                    <div className="flex flex-wrap gap-1.5">
                      {suggested.trends.map((t) => {
                        const on = trends.some((x) => x.id === t.id);
                        return (
                          <button key={`t${t.id}`} type="button"
                            onClick={() => setTrends(on ? trends.filter((x) => x.id !== t.id) : [...trends, t])}
                            className={`rounded-full px-2.5 py-1 text-xs ${on ? 'bg-[#beff00] font-semibold text-black' : 'bg-zinc-800 text-zinc-300 hover:bg-zinc-700'}`}>
                            {t.label}
                          </button>
                        );
                      })}
                      {suggested.companies.map((c) => {
                        const on = companies.some((x) => x.id === c.id);
                        return (
                          <button key={`c${c.id}`} type="button"
                            onClick={() => setCompanies(on ? companies.filter((x) => x.id !== c.id) : [...companies, c])}
                            className={`rounded-full px-2.5 py-1 text-xs ${on ? 'bg-[#beff00] font-semibold text-black' : 'bg-zinc-800 text-zinc-300 hover:bg-zinc-700'}`}>
                            {c.label}
                          </button>
                        );
                      })}
                      {suggested.unknown.map((u) => (
                        <button key={`u${u}`} type="button" onClick={() => void createUnknownCompany(u)}
                          className="rounded-full border border-dashed border-[#beff00]/50 px-2.5 py-1 text-xs text-[#beff00] hover:bg-[#beff00]/10"
                          title="Создать компанию в справочнике и привязать">
                          + {u}
                        </button>
                      ))}
                      {suggested.mock && <span className="self-center text-xs text-amber-400">(mock — без ключа LLM)</span>}
                      {suggested.trends.length + suggested.companies.length + suggested.unknown.length === 0 && (
                        <span className="text-xs text-zinc-600">сущности не найдены</span>
                      )}
                    </div>
                  )}
                </div>
              )}
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
            <button className="btn" onClick={() => void createDraft()} disabled={creating}>
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
