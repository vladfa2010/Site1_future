/**
 * ContentMaster — AI-редактор для быстрого производства черновиков.
 *
 * POST /api/admin/content-master/rewrite {source, instruction, mode?, search?, sessionId?, stream?}
 *   source: текст статьи ИЛИ http(s)-ссылка (страница выкачивается и очищается в текст).
 *   sessionId: продолжить сессию — модель получает контекст предыдущих ходов (ТЗ-13).
 *   stream: true — ответ в SSE (meta → delta* → done/error), стримится финальный раунд LLM.
 *   Ответ: {title, html, excerpt, sessionId, truncated, usage, sources, mock} — готовая основа черновика.
 * GET    /api/admin/content-master/sessions      — мои сессии (последние 50)
 * GET    /api/admin/content-master/sessions/:id  — сессия + сообщения (своя, иначе 403/404)
 * DELETE /api/admin/content-master/sessions/:id  — удалить свою сессию
 *
 * Провайдер LLM — выбранный в настройках (Kimi/DeepSeek), без ключа — mock-режим.
 */
import { Router } from 'express';
import { z } from 'zod';
import { rateLimit } from 'express-rate-limit';
import http from 'node:http';
import https from 'node:https';
import dns from 'node:dns/promises';
import { eq, desc, sql } from 'drizzle-orm';
import { db, cmSessions, cmMessages, companies, trends } from '@newinvest/db';
import { authRequired, requireRole } from '../middleware/auth.js';
import { getKimiSettings, DEEPSEEK_BASE_URL } from '../services/kimiSettings.js';

export const contentMasterRouter = Router();

const rewriteLimiter = rateLimit({
  windowMs: 60_000,
  limit: 15,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'content-master: слишком много запросов, подождите минуту' },
});

const rewriteSchema = z.object({
  // source необязателен: пустой + search=true = режим исследования — модель сама
  // ищет материал по инструкции (2026-11-18: «найди и напиши статью о X»)
  source: z.string().trim().max(200_000).default(''),
  instruction: z.string().trim().min(3).max(2000),
  mode: z.enum(['rewrite', 'factcheck']).default('rewrite'),
  search: z.boolean().default(false), // поиск в интернете (DeepSeek + DuckDuckGo, агентный цикл)
  sessionId: z.number().int().positive().optional(), // продолжить сессию (ТЗ-13)
  stream: z.boolean().default(false), // SSE-ответ (ТЗ-13)
}).refine((v) => v.source.length >= 10 || v.search, {
  message: 'Без текста или ссылки нужен поиск в интернете — включите search',
});

// ---------- Сессии (ТЗ-13): персистентная история чата ----------

interface CmSessionRow { id: number; userId: number; title: string; source: string; mode: string; search: boolean }

/** Сессия текущего юзера: null — нет в БД, 'forbidden' — чужая. */
async function findSession(id: number, userId: number): Promise<CmSessionRow | 'forbidden' | null> {
  const [row] = await db.select().from(cmSessions).where(eq(cmSessions.id, id)).limit(1);
  if (!row) return null;
  if (row.userId !== userId) return 'forbidden';
  return row;
}

contentMasterRouter.get('/sessions', authRequired, requireRole('admin', 'super_admin'), async (req, res) => {
  // считаем сообщения одним агрегатом (leftJoin + groupBy — один round-trip)
  const list = await db
    .select({
      id: cmSessions.id,
      title: cmSessions.title,
      mode: cmSessions.mode,
      updatedAt: cmSessions.updatedAt,
      messageCount: sql<number>`count(${cmMessages.id})::int`.as('message_count'),
    })
    .from(cmSessions)
    .leftJoin(cmMessages, eq(cmMessages.sessionId, cmSessions.id))
    .where(eq(cmSessions.userId, req.user!.id))
    .groupBy(cmSessions.id)
    .orderBy(desc(cmSessions.updatedAt))
    .limit(50);
  res.json({ sessions: list });
});

contentMasterRouter.get('/sessions/:id', authRequired, requireRole('admin', 'super_admin'), async (req, res) => {
  const id = Number(req.params.id);
  if (!Number.isInteger(id)) { res.status(400).json({ error: 'validation' }); return; }
  const session = await findSession(id, req.user!.id);
  if (session === null) { res.status(404).json({ error: 'not found' }); return; }
  if (session === 'forbidden') { res.status(403).json({ error: 'forbidden' }); return; }
  const messages = await db
    .select({ id: cmMessages.id, role: cmMessages.role, instruction: cmMessages.instruction, resultJson: cmMessages.resultJson })
    .from(cmMessages)
    .where(eq(cmMessages.sessionId, id))
    .orderBy(cmMessages.id);
  res.json({
    session: { id: session.id, title: session.title, source: session.source, mode: session.mode, search: session.search },
    messages,
  });
});

contentMasterRouter.delete('/sessions/:id', authRequired, requireRole('admin', 'super_admin'), async (req, res) => {
  const id = Number(req.params.id);
  if (!Number.isInteger(id)) { res.status(400).json({ error: 'validation' }); return; }
  const session = await findSession(id, req.user!.id);
  if (session === null) { res.status(404).json({ error: 'not found' }); return; }
  if (session === 'forbidden') { res.status(403).json({ error: 'forbidden' }); return; }
  await db.delete(cmSessions).where(eq(cmSessions.id, id)); // сообщения каскадом
  res.json({ ok: true });
});

// ---------- Поиск: DuckDuckGo (без ключа) — исполняет вызовы web_search модели ----------
interface SearchHit { title: string; url: string; snippet: string }

/** Нативный Search API DeepSeek (api-docs.deepseek.com/api/search) — ранкированные результаты со скором и авторитетностью. */
async function deepseekSearch(query: string, apiKey: string): Promise<SearchHit[]> {
  const res = await fetch('https://api.deepseek.com/v1/tools/search', {
    method: 'POST',
    signal: AbortSignal.timeout(20_000),
    headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ query: query.slice(0, 128), count: 5 }),
  });
  const data = (await res.json().catch(() => ({}))) as { results?: { title?: string; url?: string; snippet?: string }[]; error?: { message?: string } };
  if (!res.ok) throw new Error(`DeepSeek Search HTTP ${res.status}: ${data.error?.message ?? ''}`);
  const hits = (data.results ?? [])
    .filter((r) => r.url && /^https?:\/\//.test(r.url))
    .map((r) => ({ title: String(r.title ?? ''), url: String(r.url), snippet: String(r.snippet ?? '') }));
  if (hits.length === 0) throw new Error('DeepSeek Search: пустая выдача');
  return hits;
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function ddgSearch(query: string): Promise<SearchHit[]> {
  // lite.duckduckgo.com: html-эндпоинт отдаёт челлендж (202), lite — мягче, но режет бёрсты.
  // Поэтому: паузы между запросами (в цикле) + ретраи с бэкоффом здесь.
  const u = `https://lite.duckduckgo.com/lite/?q=${encodeURIComponent(query.slice(0, 300))}`;
  let html = '';
  for (let attempt = 0; attempt < 3; attempt++) {
    if (attempt > 0) await sleep(attempt * 2500); // 2.5с, 5с
    const res = await fetch(u, {
      signal: AbortSignal.timeout(10_000),
      headers: { 'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0 Safari/537.36' },
    });
    if (res.status === 202) continue; // челлендж — повторим после паузы
    if (!res.ok) throw new Error(`DDG HTTP ${res.status}`);
    html = await res.text();
    break;
  }
  if (!html) throw new Error('DDG временно недоступен (антибот-челлендж)');
  const hits: SearchHit[] = [];
  // DDG отдаёт разметку то с двойными, то с одинарными кавычками — regex нечувствителен к типу
  const re = /<a(?=[^>]*class=['"]result-link['"])[^>]*href=["']([^"']+)["'][^>]*>([\s\S]*?)<\/a>[\s\S]*?<td[^>]*class=['"]result-snippet['"][^>]*>([\s\S]*?)<\/td>/g;
  let m: RegExpExecArray | null;
  const clean = (x: string) => x.replace(/<[^>]+>/g, '').replace(/&[^;]+;/g, ' ').replace(/\s+/g, ' ').trim();
  while ((m = re.exec(html)) && hits.length < 5) {
    const raw = m[1];
    const target = raw.startsWith('//duckduckgo.com/l/?') ? (new URL(`https:${raw}`).searchParams.get('uddg') ?? raw) : raw;
    if (!/^https?:\/\//.test(target)) continue; // только реальные URL
    hits.push({ url: target, title: clean(m[2]), snippet: clean(m[3]).slice(0, 300) });
  }
  if (hits.length === 0) throw new Error('DDG: пустая выдача');
  return hits;
}

// DeepSeek: обычный function-инструмент с зарезервированным именем web_search
const SEARCH_TOOL_DEEPSEEK = {
  type: 'function' as const,
  function: {
    name: 'web_search',
    description: 'Поиск в интернете для проверки фактов и поиска первоисточников',
    parameters: {
      type: 'object' as const,
      properties: { query: { type: 'string', description: 'Поисковый запрос' } },
      required: ['query'],
    },
  },
};
// Kimi/Moonshot: встроенный инструмент поиска — объявляется как builtin_function
const SEARCH_TOOL_KIMI = {
  type: 'builtin_function' as const,
  function: { name: '$web_search' },
};

interface ChatUsage { promptTokens: number; completionTokens: number; totalTokens: number }
const ZERO_USAGE: ChatUsage = { promptTokens: 0, completionTokens: 0, totalTokens: 0 };

interface StreamHandlers {
  onDelta?: (text: string) => void;
  signal?: AbortSignal;
}

interface ChatRoundResult {
  content: string;
  reasoningContent?: string; // thinking-модели DeepSeek требуют вернуть reasoning_content в историю (400 иначе)
  toolCalls: { id: string; type: 'function'; function: { name: string; arguments: string } }[];
  usage: ChatUsage;
}

/** Один раунд chat/completions. stream: дельты контента уходят в onDelta по мере прихода;
 *  tool_call-раунды собираются молча (контента нет). Возвращает собранный контент и usage. */
async function chatRound(
  base: string, key: string, model: string, messages: Record<string, unknown>[],
  tools: unknown[] | undefined, stream: boolean, h: StreamHandlers,
): Promise<ChatRoundResult> {
  const body: Record<string, unknown> = {
    model, messages,
    max_tokens: 8192, // reasoner-модели тратят бюджет на reasoning_content — запас ×2
    temperature: 0.3,
    ...(tools ? { tools } : {}),
    ...(stream ? { stream: true, stream_options: { include_usage: true } } : {}),
  };
  const res = await fetch(`${base}/chat/completions`, {
    method: 'POST',
    signal: h.signal ?? AbortSignal.timeout(120_000),
    headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  if (!stream) {
    const data = (await res.json().catch(() => ({}))) as {
      choices?: { message?: { content?: string; reasoning_content?: string; tool_calls?: { id: string; type: 'function'; function: { name: string; arguments: string } }[] } }[];
      usage?: { prompt_tokens?: number; completion_tokens?: number; total_tokens?: number };
      error?: { message?: string };
    };
    const msg = data.choices?.[0]?.message;
    if (!res.ok || !msg) throw new Error(`chat API: ${res.status} ${data.error?.message ?? 'пустой ответ'}`);
    return {
      content: msg.content ?? '',
      reasoningContent: msg.reasoning_content ?? undefined,
      toolCalls: msg.tool_calls ?? [],
      usage: {
        promptTokens: data.usage?.prompt_tokens ?? 0,
        completionTokens: data.usage?.completion_tokens ?? 0,
        totalTokens: data.usage?.total_tokens ?? 0,
      },
    };
  }
  if (!res.ok || !res.body) {
    const data = (await res.json().catch(() => ({}))) as { error?: { message?: string } };
    throw new Error(`chat API: ${res.status} ${data.error?.message ?? 'пустой ответ'}`);
  }
  let content = '';
  const toolCalls: { id: string; type: 'function'; function: { name: string; arguments: string } }[] = [];
  let usage: ChatUsage = { ...ZERO_USAGE };
  for await (const payload of readSse(res)) {
    const chunk = JSON.parse(payload) as {
      choices?: { delta?: { content?: string; tool_calls?: { index?: number; id?: string; function?: { name?: string; arguments?: string } }[] }; finish_reason?: string }[];
      usage?: { prompt_tokens?: number; completion_tokens?: number; total_tokens?: number };
    };
    const delta = chunk.choices?.[0]?.delta;
    if (delta?.content) { content += delta.content; h.onDelta?.(delta.content); }
    for (const tc of delta?.tool_calls ?? []) {
      const slot = toolCalls[tc.index ?? 0] ?? (toolCalls[tc.index ?? 0] = { id: '', type: 'function', function: { name: '', arguments: '' } });
      if (tc.id) slot.id = tc.id;
      if (tc.function?.name) slot.function.name += tc.function.name;
      if (tc.function?.arguments) slot.function.arguments += tc.function.arguments;
    }
    if (chunk.usage) {
      usage = {
        promptTokens: chunk.usage.prompt_tokens ?? 0,
        completionTokens: chunk.usage.completion_tokens ?? 0,
        totalTokens: chunk.usage.total_tokens ?? 0,
      };
    }
  }
  return { content, toolCalls: toolCalls.filter((c) => c.id), usage };
}

/** Разбор SSE-тела ответа провайдера: генерация по data:-строкам, конец — [DONE]. */
async function* readSse(res: Response): AsyncGenerator<string> {
  const reader = res.body!.getReader();
  const dec = new TextDecoder();
  let buf = '';
  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      buf += dec.decode(value, { stream: true });
      let sep: number;
      while ((sep = buf.indexOf('\n\n')) >= 0) {
        const raw = buf.slice(0, sep);
        buf = buf.slice(sep + 2);
        const line = raw.split('\n').find((l) => l.startsWith('data: '));
        if (!line) continue;
        const payload = line.slice(6).trim();
        if (payload === '[DONE]') return;
        yield payload;
      }
    }
  } finally {
    reader.cancel().catch(() => { /* соединение уже закрыто */ });
  }
}

/** Агентный цикл: модель просит web_search → мы исполняем через DDG → модель отвечает с источниками.
 *  Стримится контент того раунда, где модель даёт финальный ответ (ТЗ-13). */
async function chatWithSearch(
  base: string, key: string, model: string, system: string, user: string,
  searchTool: typeof SEARCH_TOOL_DEEPSEEK | typeof SEARCH_TOOL_KIMI,
  executeSearch: (query: string) => Promise<SearchHit[]>,
  h: StreamHandlers,
): Promise<{ content: string; sources: SearchHit[]; usage: ChatUsage }> {
  const messages: Record<string, unknown>[] = [
    { role: 'system', content: system },
    { role: 'user', content: user },
  ];
  const sources: SearchHit[] = [];
  let usage: ChatUsage = { ...ZERO_USAGE };
  for (let round = 0; round < 5; round++) {
    const isLastRound = round === 4;
    const r = await chatRound(base, key, model, messages, [searchTool], isLastRound && Boolean(h.onDelta), h);
    usage = r.usage;
    // DeepSeek v4 иногда отдаёт нативный DSML вместо tool_calls: <｜｜DSML｜｜ invoke ...> —
    // распознаём вызовы сами, иначе агентный цикл обрывается «Модель не вернула JSON»
    let calls = r.toolCalls;
    if (calls.length === 0 && r.content.includes('DSML')) {
      const dsmlQueries = [...r.content.matchAll(/parameter name="query"[^>]*>([^<｜]+)/g)].map((m) => m[1].trim()).filter(Boolean);
      if (dsmlQueries.length > 0) {
        console.log(`[content-master] DSML-fallback: ${dsmlQueries.length} вызовов из текста`);
        calls = dsmlQueries.map((q, i) => ({ id: `dsml_${round}_${i}`, type: 'function' as const, function: { name: 'web_search', arguments: JSON.stringify({ query: q }) } }));
        const asstDsml: Record<string, unknown> = { role: 'assistant', content: null, tool_calls: calls };
        if (r.reasoningContent) asstDsml.reasoning_content = r.reasoningContent;
        messages.push(asstDsml);
      }
    }
    if (calls.length === 0) return { content: r.content, sources, usage };
    if (calls === r.toolCalls) {
      const asst: Record<string, unknown> = { role: 'assistant', content: r.content || null, tool_calls: calls };
      if (r.reasoningContent) asst.reasoning_content = r.reasoningContent;
      messages.push(asst);
    }
    for (const c of r.toolCalls) {
      await sleep(350); // не ддосим DDG пачкой запросов — иначе челлендж на IP
      let query = '';
      try { query = (JSON.parse(c.function.arguments) as { query?: string }).query ?? ''; } catch { /* ignore */ }
      if (!query) {
        messages.push({ role: 'tool', tool_call_id: c.id, name: c.function.name, content: JSON.stringify({ error: 'пустой запрос' }) });
        continue;
      }
      try {
        const hits = await executeSearch(query);
        hits.forEach((hit) => { if (!sources.some((s) => s.url === hit.url)) sources.push(hit); });
        messages.push({ role: 'tool', tool_call_id: c.id, name: c.function.name, content: JSON.stringify({ results: hits }) });
      } catch (e) {
        const msg = e instanceof Error ? e.message : 'search failed';
        console.error(`[content-master] web_search "${query}" failed: ${msg}`);
        messages.push({ role: 'tool', tool_call_id: c.id, name: c.function.name, content: JSON.stringify({ error: msg }) });
      }
    }
  }
  // раунды кончились — финальный ответ без tools (модель ответит из знаний, честно пометив недоступность поиска).
  // Но если она ТАК И НЕ завершила поиск (DSML снова) — исполняем последние вызовы и даём ещё один шот.
  for (let shot = 0; shot < 2; shot++) {
    const final = await chatRound(base, key, model, messages, undefined, Boolean(h.onDelta), h);
    usage = final.usage;
    if (!final.content.includes('DSML')) return { content: final.content, sources, usage };
    const qs = [...final.content.matchAll(/parameter name="query"[^>]*>([^<｜]+)/g)].map((m) => m[1].trim()).filter(Boolean);
    if (qs.length === 0) return { content: final.content, sources, usage };
    console.log(`[content-master] пост-цикл: исполняем ${qs.length} DSML-вызовов, шот ${shot}`);
    const calls = qs.map((q, i) => ({ id: `post_${shot}_${i}`, type: 'function' as const, function: { name: 'web_search', arguments: JSON.stringify({ query: q }) } }));
    const asstPost: Record<string, unknown> = { role: 'assistant', content: null, tool_calls: calls };
    messages.push(asstPost);
    for (const c of calls) {
      await sleep(350);
      let hits: SearchHit[] = [];
      try {
        hits = await executeSearch(JSON.parse(c.function.arguments).query ?? '');
        hits.forEach((hit) => { if (!sources.some((s2) => s2.url === hit.url)) sources.push(hit); });
      } catch { /* ошибка поиска — модель получит пустые результаты и ответит из знаний */ }
      messages.push({ role: 'tool', tool_call_id: c.id, name: 'web_search', content: JSON.stringify({ results: hits }) });
    }
  }
  const last = await chatRound(base, key, model, messages, undefined, Boolean(h.onDelta), h);
  return { content: last.content, sources, usage: last.usage };
}

const REWRITER_SYSTEM = `Ты редактор инвестиционного медиа «Инвестиционно.рф». Переписываешь материалы по инструкции автора: меняешь стиль, структуру, глубину изложения — сохраняя факты и числа исходного текста, не добавляя выдуманных данных.
Отвечаешь СТРОГО одним JSON-объектом без пояснений: {"title": "заголовок до 120 символов", "html": "<p>текст в HTML</p>", "excerpt": "лид 1–2 предложения до 300 символов"}.
В html допустимы только теги: <p>, <h2>, <h3>, <ul>, <ol>, <li>, <strong>, <em>, <blockquote>, <a href="https://…">. Заголовки h2/h3 — для структуры длинных текстов.`;

const FACTCHECK_SYSTEM = `Ты фактчекер инвестиционного медиа «Инвестиционно.рф». Проверяешь факты в тексте автора: выделяешь проверяемые утверждения (числа, даты, события, статусы, имена) и оцениваешь каждое. Работаешь ТОЛЬКО с данными из текста и результатами поиска — не выдумываешь.
Отвечаешь СТРОГО одним JSON-объектом: {"report": [{"claim": "утверждение", "status": "confirmed|disputed|unverified", "comment": "короткий комментарий со ссылкой на источник если есть"}], "summary": "одно предложение-итог"}`;

const URL_RE = /^https?:\/\//i;

/** Хосты, куда серверу (с LLM-ключами на борту) ходить нельзя — SSRF-защита (строковая, до резолва). */
function assertPublicHost(hostname: string): void {
  const h = hostname.toLowerCase().replace(/^\[|\]$/g, '');
  if (
    h === 'localhost' ||
    h.endsWith('.local') ||
    h.endsWith('.internal') ||
    /^(127|10|0|169\.254)\./.test(h) ||
    /^192\.168\./.test(h) ||
    /^172\.(1[6-9]|2\d|3[01])\./.test(h) ||
    h === '::1' ||
    h.startsWith('fe80') ||
    h.startsWith('fd') ||
    h === 'metadata.google.internal'
  ) {
    throw new Error('Запрещённый адрес: приватные и служебные сети недоступны');
  }
}

/** IP-адрес публичный (не loopback/private/link-local/CGNAT/ULA/unspecified)? */
function ipIsPublic(ip: string): boolean {
  const v4 = ip.startsWith('::ffff:') ? ip.slice(7) : ip; // IPv4-mapped
  if (/^127\./.test(v4) || v4 === '0.0.0.0') return false;
  if (/^(10|169\.254|192\.168)\./.test(v4)) return false;
  if (/^172\.(1[6-9]|2\d|3[01])\./.test(v4)) return false;
  if (/^100\.(6[4-9]|[7-9]\d|1[01]\d|12[0-7])\./.test(v4)) return false; // CGNAT 100.64/10
  if (/^224\./.test(v4) || /^255\./.test(v4)) return false; // multicast/broadcast
  const low = ip.toLowerCase();
  if (low === '::1' || low === '::' || low.startsWith('fe80') || low.startsWith('fc') || low.startsWith('fd')) return false;
  if (low.startsWith('ff')) return false; // IPv6 multicast
  return true;
}

/** DNS lookup с проверкой адресов: хост допустим ТОЛЬКО если ВСЕ его адреса публичны.
 *  Пропуск приватного среди публичных закрывает DNS rebinding (аудит 2026-11-14) —
 *  иначе домен мог резолвиться в 127.0.0.1/10.x мимо строковой проверки hostname. */
interface LookupAddr { address: string; family: number }

async function lookupPublic(hostname: string): Promise<LookupAddr[]> {
  const addrs = await dns.lookup(hostname, { all: true });
  if (addrs.length === 0) throw new Error(`Не резолвится: ${hostname}`);
  if (!addrs.every((a) => ipIsPublic(a.address))) {
    throw new Error('Запрещённый адрес: hostname резолвится в приватную/служебную сеть (SSRF)');
  }
  return addrs;
}

/** SSRF-безопасный fetch: валидация hostname ДО и ПОСЛЕ резолва, ручные редиректы
 *  (каждый хоп перепроверяется), таймаут, лимит тела. Возвращает {status, headers, body}. */
function safeGet(rawUrl: string, redirectsLeft = 3): Promise<{ status: number; headers: http.IncomingHttpHeaders; body: string }> {
  return new Promise((resolve, reject) => {
    const u = new URL(rawUrl);
    if (!/^https?:$/.test(u.protocol)) return reject(new Error('Только http(s) ссылки'));
    if (u.username || u.password) return reject(new Error('URL с credentials не поддерживаются'));
    assertPublicHost(u.hostname); // строковая проверка ДО резолва
    const transport = u.protocol === 'https:' ? https : http;
    lookupPublic(u.hostname)
      .then((addrs) => {
        const req = transport.get(
          {
            hostname: u.hostname,
            port: u.port || (u.protocol === 'https:' ? 443 : 80),
            path: `${u.pathname}${u.search}`,
            headers: { 'User-Agent': 'Mozilla/5.0 (compatible; ContentMaster/1.0)' },
            lookup: (_h, _o, cb) => cb(null, addrs[0].address, addrs[0].family),
            timeout: 10_000,
          },
          (res) => {
            const loc = res.headers.location;
            if (res.statusCode! >= 300 && res.statusCode! < 400 && loc) {
              res.resume(); // тело редиректа не нужно
              if (redirectsLeft <= 0) return reject(new Error('Слишком много редиректов'));
              const next = new URL(loc, u).toString();
              safeGet(next, redirectsLeft - 1).then(resolve, reject); // хоп перепроверится целиком
              return;
            }
            const chunks: Buffer[] = [];
            let size = 0;
            res.on('data', (c: Buffer) => {
              size += c.length;
              if (size > 2_000_000) { req.destroy(); reject(new Error('Страница больше 2 МБ')); return; }
              chunks.push(c);
            });
            res.on('end', () => resolve({ status: res.statusCode!, headers: res.headers, body: Buffer.concat(chunks).toString('utf8') }));
          },
        );
        req.on('timeout', () => req.destroy(new Error('Таймаут запроса (10 с)')));
        req.on('error', reject);
      })
      .catch(reject);
  });
}

/** Выкачать страницу и сверстать в чистый текст (strip scripts/styles/тегов). */
async function fetchUrlText(rawUrl: string): Promise<string> {
  const res = await safeGet(rawUrl);
  const type = String(res.headers['content-type'] ?? '');
  if (!/text\/html|text\/plain|application\/json/.test(type)) {
    throw new Error(`Неподдерживаемый тип контента: ${type.slice(0, 60)}`);
  }
  const raw = res.body.slice(0, 2_000_000);
  if (res.status < 200 || res.status >= 300) throw new Error(`Страница ответила HTTP ${res.status}`);
  return htmlToText(raw);
}

function htmlToText(html: string): string {
  return html
    .replace(/<(script|style|noscript|svg|nav|footer|header|aside)[\s\S]*?<\/\1>/gi, ' ')
    .replace(/<!--[\s\S]*?-->/g, ' ')
    .replace(/<\/(p|div|h[1-6]|li|tr|br|blockquote)>/gi, '\n')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;|&apos;/g, "'")
    .replace(/[ \t]+/g, ' ')
    .replace(/\n\s*\n+/g, '\n\n')
    .trim();
}

/** Mock без ключа: базовая разметка текста, чтобы UX работал до появления ключа. */
function mockRewrite(text: string): { title: string; html: string; excerpt: string } {
  const paragraphs = text.split(/\n{2,}|\n/).map((s) => s.trim()).filter(Boolean);
  const first = paragraphs[0] ?? '';
  const title = first.length > 100 ? `${first.slice(0, 97)}…` : first || 'Без заголовка';
  const body = paragraphs.slice(1);
  const html = body.map((p) => `<p>${p.replace(/</g, '&lt;')}</p>`).join('\n') || '<p>(пусто)</p>';
  const excerpt = (body[0] ?? first).slice(0, 250);
  return { title, html, excerpt };
}

/** Извлечь первый сбалансированный JSON-объект из ответа модели.
 *  Жадный /\{[\s\S]*\}/ брал от первой { до ПОСЛЕДНЕЙ } — если модель после JSON
 *  дописывала текст с фигурными скобками, JSON.parse падал
 *  («Unexpected non-whitespace character after JSON at position N», баг 2026-11-17).
 *  Сканируем с балансировкой скобок и учётом строк/экранировок. */
function extractFirstJson(raw: string): string | null {
  const start = raw.indexOf('{');
  if (start === -1) return null;
  let depth = 0;
  let inStr = false;
  let esc = false;
  for (let i = start; i < raw.length; i++) {
    const ch = raw[i];
    if (inStr) {
      if (esc) esc = false;
      else if (ch === '\\') esc = true;
      else if (ch === '"') inStr = false;
      continue;
    }
    if (ch === '"') inStr = true;
    else if (ch === '{') depth++;
    else if (ch === '}') {
      depth--;
      if (depth === 0) return raw.slice(start, i + 1);
    }
  }
  return null;
}

/** Извлечь JSON из ответа модели (модели иногда оборачивают в ```json). */
function parseRewrite(raw: string): { title: string; html: string; excerpt: string } {
  const json = extractFirstJson(raw);
  if (!json) throw new Error(`Модель не вернула JSON: ${raw.slice(0, 200) || '(пустой ответ)'}`);
  const d = JSON.parse(json) as { title?: unknown; html?: unknown; excerpt?: unknown };
  const title = typeof d.title === 'string' ? d.title.trim() : '';
  const html = typeof d.html === 'string' ? d.html.trim() : '';
  if (!title || !html) throw new Error('Модель вернула пустой результат');
  return { title: title.slice(0, 200), html, excerpt: typeof d.excerpt === 'string' ? d.excerpt.trim().slice(0, 500) : '' };
}

/** Рерайт одним проходом (без поиска). Стримится при onDelta. */
async function rewriteWithLlm(
  baseUrl: string, apiKey: string, model: string, system: string, user: string, h: StreamHandlers,
): Promise<{ content: string; usage: ChatUsage }> {
  const r = await chatRound(baseUrl, apiKey, model,
    [{ role: 'system', content: system }, { role: 'user', content: user }],
    undefined, Boolean(h.onDelta), h);
  return { content: r.content, usage: r.usage };
}

/** Разбор JSON фактчека из ответа модели. */
function parseFactcheck(raw: string): { report: { claim: string; status: string; comment: string }[]; summary: string } {
  const json = extractFirstJson(raw);
  if (!json) throw new Error(`Модель не вернула JSON: ${raw.slice(0, 200) || '(пустой ответ)'}`);
  const d = JSON.parse(json) as { report?: unknown; summary?: unknown };
  const report = Array.isArray(d.report)
    ? (d.report as { claim?: unknown; status?: unknown; comment?: unknown }[]).map((r) => ({
        claim: String(r.claim ?? '').slice(0, 300),
        status: ['confirmed', 'disputed', 'unverified'].includes(String(r.status)) ? String(r.status) : 'unverified',
        comment: String(r.comment ?? '').slice(0, 500),
      }))
    : [];
  return { report, summary: typeof d.summary === 'string' ? d.summary.slice(0, 500) : '' };
}

// ---------- Контекст итеративного чата (ТЗ-13) ----------

const CONTEXT_TURNS = 8; // последние ходы (пара user+assistant), что влезает в бюджет модели
const CONTEXT_ASSISTANT_MAX = 1500; // символов на представление одного ответа в контексте

/** Компактное текстовое представление результата для контекста следующих ходов. */
function resultToContext(resultJson: string): string {
  try {
    const d = JSON.parse(resultJson) as { title?: string; html?: string; report?: { claim: string; status: string; comment: string }[]; summary?: string };
    if (Array.isArray(d.report)) {
      const lines = d.report.map((r) => `${r.claim} — ${r.status}${r.comment ? ` — ${r.comment}` : ''}`);
      if (d.summary) lines.push(`Итог: ${d.summary}`);
      return lines.join('\n').slice(0, CONTEXT_ASSISTANT_MAX);
    }
    const text = htmlToText(d.html ?? '').slice(0, CONTEXT_ASSISTANT_MAX);
    return `Заголовок: ${d.title ?? ''}\n\n${text}`;
  } catch {
    return '';
  }
}

/** Прошлые ходы сессии → сообщения для LLM (только для sessionId-запросов). */
async function buildSessionContext(sessionId: number): Promise<Record<string, unknown>[]> {
  const rows = await db
    .select({ role: cmMessages.role, instruction: cmMessages.instruction, resultJson: cmMessages.resultJson })
    .from(cmMessages)
    .where(eq(cmMessages.sessionId, sessionId))
    .orderBy(desc(cmMessages.id))
    .limit(CONTEXT_TURNS * 2);
  const out: Record<string, unknown>[] = [];
  for (const row of rows.reverse()) {
    if (row.role === 'user') {
      out.push({ role: 'user', content: row.instruction });
    } else if (row.resultJson) {
      const compact = resultToContext(row.resultJson);
      if (compact) out.push({ role: 'assistant', content: compact });
    }
  }
  return out;
}

/** Сохранить ход (user+assistant) в сессию, обновить title/updated_at. */
async function persistTurn(sessionId: number, instruction: string, resultPayload: Record<string, unknown>, title?: string): Promise<void> {
  await db.insert(cmMessages).values({ sessionId, role: 'user', instruction });
  await db.insert(cmMessages).values({ sessionId, role: 'assistant', instruction, resultJson: JSON.stringify(resultPayload) });
  await db.update(cmSessions)
    .set({ updatedAt: new Date(), ...(title ? { title: title.slice(0, 200) } : {}) })
    .where(eq(cmSessions.id, sessionId));
}

/** Заголовок новой сессии до первого ответа: hostname ссылки или начало текста. */
function sessionTitleFrom(source: string): string {
  if (URL_RE.test(source)) {
    try { return new URL(source).hostname; } catch { /* fallthrough */ }
  }
  return source.replace(/\s+/g, ' ').trim().slice(0, 80);
}

// ---------- Сам эндпоинт ----------

interface RewriteOutcome {
  payload: Record<string, unknown>; // то, что уходит клиенту (без stream-обёртки)
  persistTitle?: string;
}

contentMasterRouter.post(
  '/rewrite',
  authRequired,
  requireRole('admin', 'super_admin'),
  rewriteLimiter,
  async (req, res) => {
    const parsed = rewriteSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: 'validation', details: parsed.error.flatten() });
      return;
    }
    const wantStream = parsed.data.stream || req.headers.accept === 'text/event-stream';
    // SSE-заголовки ставим ДО любых await, иначе первый write уйдёт как обычный ответ
    if (wantStream) {
      res.writeHead(200, {
        'Content-Type': 'text/event-stream; charset=utf-8',
        'Cache-Control': 'no-cache, no-transform',
        Connection: 'keep-alive',
        'X-Accel-Buffering': 'no', // не буферизовать за прокси
      });
    }
    const sse = (obj: unknown) => { if (wantStream) res.write(`data: ${JSON.stringify(obj)}\n\n`); };
    const abort = new AbortController();
    res.on('close', () => abort.abort()); // клиент ушёл — гасим запрос к LLM

    try {
      let text: string;
      let sourceUrl: string | null = null;
      if (parsed.data.source && URL_RE.test(parsed.data.source)) {
        sourceUrl = parsed.data.source;
        text = await fetchUrlText(parsed.data.source);
        if (text.length < 50) {
          const e = new Error('Не удалось извлечь текст со страницы');
          if (wantStream) { sse({ type: 'error', message: e.message }); res.end(); } else { res.status(422).json({ error: e.message }); }
          return;
        }
      } else {
        text = parsed.data.source;
      }
      const truncated = text.length > 15_000;
      const research = text.length < 50; // режим исследования: источника нет — модель ищет сама

      // --- сессия: продолжение или создание ---
      let sessionId: number;
      let history: Record<string, unknown>[] = [];
      if (parsed.data.sessionId) {
        const session = await findSession(parsed.data.sessionId, req.user!.id);
        if (session === null) {
          const e = new Error('session not found');
          if (wantStream) { sse({ type: 'error', message: e.message }); res.end(); } else { res.status(404).json({ error: e.message }); }
          return;
        }
        if (session === 'forbidden') {
          const e = new Error('forbidden');
          if (wantStream) { sse({ type: 'error', message: e.message }); res.end(); } else { res.status(403).json({ error: e.message }); }
          return;
        }
        sessionId = session.id;
        history = await buildSessionContext(sessionId);
      } else {
        const [row] = await db.insert(cmSessions).values({
          userId: req.user!.id,
          // без источника название сессии — из инструкции (иначе пустые сессии-«без названия»)
          title: sessionTitleFrom(parsed.data.source || parsed.data.instruction),
          source: parsed.data.source.slice(0, 50_000),
          mode: parsed.data.mode,
          search: parsed.data.search,
        }).returning({ id: cmSessions.id });
        sessionId = row.id;
      }

      const s = await getKimiSettings();
      const key = s.provider === 'deepseek' ? s.deepseekApiKey : s.apiKey;
      const meta = { type: 'meta', sessionId, mode: parsed.data.mode, sourceUrl, truncated };
      sse(meta);

      if (!key) {
        // mock-режим: мгновенный ответ, стримить нечего (без источника mock от инструкции)
        const mock = mockRewrite(text || parsed.data.instruction);
        const payload: Record<string, unknown> = { ...mock, mock: true, sourceUrl, sessionId, truncated, usage: null };
        await persistTurn(sessionId, parsed.data.instruction, payload, mock.title);
        if (wantStream) { sse({ type: 'done', ...payload }); res.end(); } else res.json(payload);
        return;
      }
      const isDeepseek = s.provider === 'deepseek';

      // исследовательский режим: источника нет — модель сама ищет факты через web_search
      const userPrompt = research
        ? `Инструкция автора:\n${parsed.data.instruction}\n\nИСХОДНОГО ТЕКСТА НЕТ — исследуй тему самостоятельно: через поиск в интернете найди первоисточники и актуальные факты по теме инструкции, проверь цифры и даты, затем выполни инструкцию. Ссылайся на найденные источники.`
        : `Инструкция автора:\n${parsed.data.instruction}\n\n=== ИСХОДНЫЙ ТЕКСТ ===\n${text.slice(0, 15_000)}`;
      const model = isDeepseek ? s.deepseekModel : s.textModel;
      const base = isDeepseek ? DEEPSEEK_BASE_URL : s.baseUrl;
      const h: StreamHandlers = wantStream ? { onDelta: (t) => sse({ type: 'delta', text: t }), signal: abort.signal } : {};

      let outcome: RewriteOutcome;
      if (parsed.data.search) {
        // агентный цикл: модель сама решает, что искать; мы исполняем через DuckDuckGo
        const system = parsed.data.mode === 'factcheck' ? FACTCHECK_SYSTEM : `${REWRITER_SYSTEM}\nЕсли в материале есть факты, которые стоит проверить или уточнить — используй web_search. В html и excerpt указывай ссылки на источники (<a href="…">).`;
        const searchTool = isDeepseek ? SEARCH_TOOL_DEEPSEEK : SEARCH_TOOL_KIMI;
        // DeepSeek ищет нативным Search API (тот же ключ), Kimi — DuckDuckGo (fallback)
        const executeSearch = isDeepseek ? (q: string) => deepseekSearch(q, key) : ddgSearch;
        const { content, sources, usage } = await chatWithSearch(base, key, model, system, userPrompt, searchTool, executeSearch, h);
        if (parsed.data.mode === 'factcheck') {
          outcome = { payload: { ...parseFactcheck(content), sources, mock: false, sourceUrl, sessionId, truncated, usage }, persistTitle: 'Фактчек' };
        } else {
          const r = parseRewrite(content);
          outcome = { payload: { ...r, sources, mock: false, sourceUrl, sessionId, truncated, usage }, persistTitle: r.title };
        }
      } else if (parsed.data.mode === 'factcheck') {
        const { content, usage } = await rewriteWithLlm(base, key, model, FACTCHECK_SYSTEM, userPrompt, h);
        outcome = { payload: { ...parseFactcheck(content), sources: [], mock: false, sourceUrl, sessionId, truncated, usage }, persistTitle: 'Фактчек' };
      } else {
        const systemWithContext = history.length
          ? `${REWRITER_SYSTEM}\nПеред текущей инструкцией — предыдущие ходы работы над этим материалом (твои ответы сокращены). Опирайся на них, не повторяйся.`
          : REWRITER_SYSTEM;
        const messages: Record<string, unknown>[] = [
          { role: 'system', content: systemWithContext },
          ...history,
          { role: 'user', content: userPrompt },
        ];
        const r = await chatRound(base, key, model, messages, undefined, Boolean(h.onDelta), h);
        const parsedResult = parseRewrite(r.content);
        outcome = { payload: { ...parsedResult, sources: [], mock: false, sourceUrl, sessionId, truncated, usage: r.usage }, persistTitle: parsedResult.title };
      }

      await persistTurn(sessionId, parsed.data.instruction, outcome.payload, outcome.persistTitle);
      if (wantStream) {
        sse({ type: 'done', ...outcome.payload });
        res.end();
      } else {
        res.json(outcome.payload);
      }
    } catch (e) {
      const msg = e instanceof Error ? e.message : 'unknown';
      const status = /Запрещённый адрес|Только http|тип контента/i.test(msg) ? 400 : /извлечь текст/i.test(msg) ? 422 : 502;
      if (wantStream) {
        sse({ type: 'error', message: msg });
        res.end();
      } else {
        res.status(status).json({ error: 'rewrite failed', message: msg });
      }
    }
  },
);

// ---------- Извлечение связей из текста (ТЗ: чипсы-предложки в черновике) ----------

const EXTRACT_SYSTEM = `Ты аналитик инвестиционного медиа. По тексту статьи определяешь связанные сущности из КАТАЛОГА и компании вне каталога.
Отвечаешь СТРОГО одним JSON-объектом: {"companyIds": [числа], "trendIds": [числа], "unknown": ["названия компаний вне каталога"]}.
Правила: бери ТОЛЬКО id из каталога ниже; упоминание может быть косвенным (основатель, продукт, тикер); "unknown" — компании, которых нет в каталоге, но они существенны для текста (не более 3, короткие официальные названия). Ничего не выдумывай.`;

contentMasterRouter.post(
  '/extract',
  authRequired,
  requireRole('admin', 'super_admin'),
  async (req, res) => {
    const parsed = z.object({ text: z.string().trim().min(50).max(20_000) }).safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: 'validation', details: parsed.error.flatten() });
      return;
    }
    const [companyRows, trendRows] = await Promise.all([
      db.select({ id: companies.id, name: companies.name }).from(companies).orderBy(companies.name).limit(300),
      db.select({ id: trends.id, name: trends.name }).from(trends).orderBy(trends.name).limit(100),
    ]);
    const s = await getKimiSettings();
    const key = s.provider === 'deepseek' ? s.deepseekApiKey : s.apiKey;

    if (!key) {
      // mock: наивное вхождение подстроки
      const low = parsed.data.text.toLowerCase();
      res.json({
        companies: companyRows.filter((c) => low.includes(c.name.toLowerCase())).slice(0, 8),
        trends: trendRows.filter((t) => low.includes(t.name.toLowerCase())).slice(0, 5),
        unknown: [],
        mock: true,
      });
      return;
    }

    const catalog = [
      'КАТАЛОГ КОМПАНИЙ (id — название):',
      ...companyRows.map((c) => `${c.id} — ${c.name}`),
      'КАТАЛОГ ТРЕНДОВ (id — название):',
      ...trendRows.map((t) => `${t.id} — ${t.name}`),
    ].join('\n');
    const { content: raw } = await rewriteWithLlm(
      s.provider === 'deepseek' ? DEEPSEEK_BASE_URL : s.baseUrl,
      key,
      s.provider === 'deepseek' ? s.deepseekModel : s.textModel,
      `${EXTRACT_SYSTEM}\n\n${catalog}`,
      `ТЕКСТ:\n${parsed.data.text.slice(0, 12_000)}`,
      {},
    );
    const json = extractFirstJson(raw);
    if (!json) {
      res.status(502).json({ error: 'extract failed', message: 'Модель не вернула JSON' });
      return;
    }
    const d = JSON.parse(json) as { companyIds?: unknown; trendIds?: unknown; unknown?: unknown };
    const companyIds = new Set(Array.isArray(d.companyIds) ? d.companyIds.filter((x): x is number => Number.isInteger(x)) : []);
    const trendIds = new Set(Array.isArray(d.trendIds) ? d.trendIds.filter((x): x is number => Number.isInteger(x)) : []);
    const unknown = (Array.isArray(d.unknown) ? d.unknown : []).map(String).filter(Boolean).slice(0, 3);
    res.json({
      companies: companyRows.filter((c) => companyIds.has(c.id)),
      trends: trendRows.filter((t) => trendIds.has(t.id)),
      unknown,
      mock: false,
    });
  },
);
