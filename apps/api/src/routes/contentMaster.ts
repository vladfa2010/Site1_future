/**
 * ContentMaster — AI-редактор для быстрого производства черновиков.
 * POST /api/admin/content-master/rewrite {source, instruction}
 *   source: текст статьи ИЛИ http(s)-ссылка (страница выкачивается и очищается в текст).
 *   Ответ: {title, html, excerpt, mock} — готовая основа черновика.
 * Провайдер LLM — выбранный в настройках (Kimi/DeepSeek), без ключа — mock-режим.
 */
import { Router } from 'express';
import { z } from 'zod';
import { rateLimit } from 'express-rate-limit';
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
  source: z.string().trim().min(10).max(200_000),
  instruction: z.string().trim().min(3).max(2000),
  mode: z.enum(['rewrite', 'factcheck']).default('rewrite'),
  search: z.boolean().default(false), // поиск в интернете (DeepSeek + DuckDuckGo, агентный цикл)
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

/** Агентный цикл: модель просит web_search → мы исполняем через DDG → модель отвечает с источниками. */
async function chatWithSearch(
  base: string, key: string, model: string, system: string, user: string, label: string,
  searchTool: typeof SEARCH_TOOL_DEEPSEEK | typeof SEARCH_TOOL_KIMI,
  executeSearch: (query: string) => Promise<SearchHit[]>,
): Promise<{ content: string; sources: SearchHit[] }> {
  const messages: Record<string, unknown>[] = [
    { role: 'system', content: system },
    { role: 'user', content: user },
  ];
  const sources: SearchHit[] = [];
  for (let round = 0; round < 3; round++) {
    const res = await fetch(`${base}/chat/completions`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model, messages,
        tools: [searchTool],
        max_tokens: 4096,
        temperature: 0.3,
      }),
    });
    const data = (await res.json().catch(() => ({}))) as {
      choices?: { message?: { content?: string; tool_calls?: { id: string; function: { arguments: string } }[] }; finish_reason?: string }[];
      error?: { message?: string };
    };
    const msg = data.choices?.[0]?.message;
    if (!res.ok || !msg) throw new Error(`${label} chat API: ${res.status} ${data.error?.message ?? 'пустой ответ'}`);
    const calls = msg.tool_calls ?? [];
    if (calls.length === 0) return { content: msg.content ?? '', sources };
    messages.push({ role: 'assistant', content: msg.content ?? '', tool_calls: calls });
    for (const c of calls) {
      await sleep(350); // не ддосим DDG пачкой запросов — иначе челлендж на IP
      let query = '';
      try { query = (JSON.parse(c.function.arguments) as { query?: string }).query ?? ''; } catch { /* ignore */ }
      if (!query) {
        messages.push({ role: 'tool', tool_call_id: c.id, content: JSON.stringify({ error: 'пустой запрос' }) });
        continue;
      }
      try {
        const hits = await executeSearch(query);
        hits.forEach((h) => { if (!sources.some((s) => s.url === h.url)) sources.push(h); });
        messages.push({ role: 'tool', tool_call_id: c.id, content: JSON.stringify({ results: hits }) });
      } catch (e) {
        const msg = e instanceof Error ? e.message : 'search failed';
        console.error(`[content-master] web_search "${query}" failed: ${msg}`);
        messages.push({ role: 'tool', tool_call_id: c.id, content: JSON.stringify({ error: msg }) });
      }
    }
  }
  // раунды кончились (поиск стабильно недоступен) — финальный ответ без tools:
  // модель честно ответит на основе своих знаний с пометкой о недоступности поиска
  const finalRes = await fetch(`${base}/chat/completions`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model, messages,
      max_tokens: 4096, temperature: 0.3,
    }),
  });
  const finalData = (await finalRes.json().catch(() => ({}))) as {
    choices?: { message?: { content?: string } }[];
    error?: { message?: string };
  };
  const finalText = finalData.choices?.[0]?.message?.content;
  if (!finalRes.ok || !finalText) {
    throw new Error(`${label} chat API: ${finalRes.status} ${finalData.error?.message ?? 'пустой ответ'}`);
  }
  return { content: finalText, sources };
}

const REWRITER_SYSTEM = `Ты редактор инвестиционного медиа «Инвестиционно.рф». Переписываешь материалы по инструкции автора: меняешь стиль, структуру, глубину изложения — сохраняя факты и числа исходного текста, не добавляя выдуманных данных.
Отвечаешь СТРОГО одним JSON-объектом без пояснений: {"title": "заголовок до 120 символов", "html": "<p>текст в HTML</p>", "excerpt": "лид 1–2 предложения до 300 символов"}.
В html допустимы только теги: <p>, <h2>, <h3>, <ul>, <ol>, <li>, <strong>, <em>, <blockquote>, <a href="https://…">. Заголовки h2/h3 — для структуры длинных текстов.`;

const FACTCHECK_SYSTEM = `Ты фактчекер инвестиционного медиа «Инвестиционно.рф». Проверяешь факты в тексте автора: выделяешь проверяемые утверждения (числа, даты, события, статусы, имена) и оцениваешь каждое. Работаешь ТОЛЬКО с данными из текста и результатами поиска — не выдумываешь.
Отвечаешь СТРОГО одним JSON-объектом: {"report": [{"claim": "утверждение", "status": "confirmed|disputed|unverified", "comment": "короткий комментарий со ссылкой на источник если есть"}], "summary": "одно предложение-итог"}`;

const URL_RE = /^https?:\/\//i;

/** Хосты, куда серверу (с LLM-ключами на борту) ходить нельзя — SSRF-защита. */
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

/** Выкачать страницу и сверстать в чистый текст (strip scripts/styles/тегов). */
async function fetchUrlText(rawUrl: string): Promise<string> {
  const u = new URL(rawUrl);
  if (!/^https?:$/.test(u.protocol)) throw new Error('Только http(s) ссылки');
  assertPublicHost(u.hostname);
  const res = await fetch(u.toString(), {
    signal: AbortSignal.timeout(10_000),
    redirect: 'follow',
    headers: { 'User-Agent': 'Mozilla/5.0 (compatible; ContentMaster/1.0)' },
  });
  assertPublicHost(new URL(res.url).hostname); // редирект не должен увести во внутреннюю сеть
  const type = res.headers.get('content-type') ?? '';
  if (!/text\/html|text\/plain|application\/json/.test(type)) {
    throw new Error(`Неподдерживаемый тип контента: ${type.slice(0, 60)}`);
  }
  const raw = (await res.text()).slice(0, 2_000_000);
  if (!res.ok) throw new Error(`Страница ответила HTTP ${res.status}`);
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

/** Извлечь JSON из ответа модели (модели иногда оборачивают в ```json). */
function parseRewrite(raw: string): { title: string; html: string; excerpt: string } {
  const m = raw.match(/\{[\s\S]*\}/);
  if (!m) throw new Error('Модель не вернула JSON');
  const d = JSON.parse(m[0]) as { title?: unknown; html?: unknown; excerpt?: unknown };
  const title = typeof d.title === 'string' ? d.title.trim() : '';
  const html = typeof d.html === 'string' ? d.html.trim() : '';
  if (!title || !html) throw new Error('Модель вернула пустой результат');
  return { title: title.slice(0, 200), html, excerpt: typeof d.excerpt === 'string' ? d.excerpt.trim().slice(0, 500) : '' };
}


/** Рерайт с запасом max_tokens (512 в textGen для рерайта мало). */
async function rewriteWithLlm(
  baseUrl: string, apiKey: string, model: string, prompt: string, label: string,
  system: string = REWRITER_SYSTEM,
): Promise<string> {
  const res = await fetch(`${baseUrl}/chat/completions`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model,
      messages: [
        { role: 'system', content: system },
        { role: 'user', content: prompt },
      ],
      max_tokens: 8192,
      temperature: 0.5,
      // гарантируем JSON на выходе (DeepSeek/Moonshot поддерживают response_format);
      // иначе рассуждающие модели (deepseek-v4-pro) иногда возвращают текст вне схемы
      response_format: { type: 'json_object' },
    }),
  });
  const data = (await res.json().catch(() => ({}))) as {
    choices?: { message?: { content?: string } }[];
    error?: { message?: string };
  };
  const text = data.choices?.[0]?.message?.content ?? '';
  if (!res.ok || !text) throw new Error(`${label} chat API: ${res.status} ${data.error?.message ?? 'пустой ответ'}`);
  return text;
}

/** Разбор JSON фактчека из ответа модели. */
function parseFactcheck(raw: string): { report: { claim: string; status: string; comment: string }[]; summary: string } {
  const m = raw.match(/\{[\s\S]*\}/);
  if (!m) throw new Error('Модель не вернула JSON');
  const d = JSON.parse(m[0]) as { report?: unknown; summary?: unknown };
  const report = Array.isArray(d.report)
    ? (d.report as { claim?: unknown; status?: unknown; comment?: unknown }[]).map((r) => ({
        claim: String(r.claim ?? '').slice(0, 300),
        status: ['confirmed', 'disputed', 'unverified'].includes(String(r.status)) ? String(r.status) : 'unverified',
        comment: String(r.comment ?? '').slice(0, 500),
      }))
    : [];
  return { report, summary: typeof d.summary === 'string' ? d.summary.slice(0, 500) : '' };
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
    try {
      let text: string;
      let sourceUrl: string | null = null;
      if (URL_RE.test(parsed.data.source)) {
        sourceUrl = parsed.data.source;
        text = await fetchUrlText(parsed.data.source);
        if (text.length < 50) {
          res.status(422).json({ error: 'Не удалось извлечь текст со страницы' });
          return;
        }
      } else {
        text = parsed.data.source;
      }

      const s = await getKimiSettings();
      const key = s.provider === 'deepseek' ? s.deepseekApiKey : s.apiKey;
      if (!key) {
        res.json({ ...mockRewrite(text), mock: true, sourceUrl });
        return;
      }
      const isDeepseek = s.provider === 'deepseek';

      const userPrompt = `Инструкция автора:\n${parsed.data.instruction}\n\n=== ИСХОДНЫЙ ТЕКСТ ===\n${text.slice(0, 15_000)}`;
      const model = isDeepseek ? s.deepseekModel : s.textModel;
      const base = isDeepseek ? DEEPSEEK_BASE_URL : s.baseUrl;
      const label = isDeepseek ? 'DeepSeek' : 'Kimi';

      if (parsed.data.search) {
        // агентный цикл: модель сама решает, что искать; мы исполняем через DuckDuckGo
        const system = parsed.data.mode === 'factcheck' ? FACTCHECK_SYSTEM : `${REWRITER_SYSTEM}\nЕсли в материале есть факты, которые стоит проверить или уточнить — используй web_search. В html и excerpt указывай ссылки на источники (<a href="…">).`;
        const searchTool = isDeepseek ? SEARCH_TOOL_DEEPSEEK : SEARCH_TOOL_KIMI;
        // DeepSeek ищет нативным Search API (тот же ключ), Kimi — DuckDuckGo (fallback)
        const executeSearch = isDeepseek ? (q: string) => deepseekSearch(q, key) : ddgSearch;
        const { content, sources } = await chatWithSearch(base, key, model, system, userPrompt, label, searchTool, executeSearch);
        if (parsed.data.mode === 'factcheck') {
          res.json({ ...parseFactcheck(content), sources, mock: false, sourceUrl });
        } else {
          res.json({ ...parseRewrite(content), sources, mock: false, sourceUrl });
        }
        return;
      }
      if (parsed.data.mode === 'factcheck') {
        const raw = await rewriteWithLlm(base, key, model, userPrompt, label, FACTCHECK_SYSTEM);
        res.json({ ...parseFactcheck(raw), sources: [], mock: false, sourceUrl });
        return;
      }
      const raw = await rewriteWithLlm(base, key, model, userPrompt, label);
      res.json({ ...parseRewrite(raw), sources: [], mock: false, sourceUrl });
    } catch (e) {
      const msg = e instanceof Error ? e.message : 'unknown';
      const status = /Запрещённый адрес|Только http|тип контента/i.test(msg) ? 400 : /извлечь текст/i.test(msg) ? 422 : 502;
      res.status(status).json({ error: 'rewrite failed', message: msg });
    }
  },
);

