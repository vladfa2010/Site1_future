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
});

const REWRITER_SYSTEM = `Ты редактор инвестиционного медиа «Инвестиционно.рф». Переписываешь материалы по инструкции автора: меняешь стиль, структуру, глубину изложения — сохраняя факты и числа исходного текста, не добавляя выдуманных данных.
Отвечаешь СТРОГО одним JSON-объектом без пояснений: {"title": "заголовок до 120 символов", "html": "<p>текст в HTML</p>", "excerpt": "лид 1–2 предложения до 300 символов"}.
В html допустимы только теги: <p>, <h2>, <h3>, <ul>, <ol>, <li>, <strong>, <em>, <blockquote>, <a href="https://…">. Заголовки h2/h3 — для структуры длинных текстов.`;

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
): Promise<string> {
  const res = await fetch(`${baseUrl}/chat/completions`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model,
      messages: [
        { role: 'system', content: REWRITER_SYSTEM },
        { role: 'user', content: prompt },
      ],
      max_tokens: 4096,
      temperature: 0.5,
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

      const model = s.provider === 'deepseek' ? s.deepseekModel : s.textModel;
      const base = s.provider === 'deepseek' ? DEEPSEEK_BASE_URL : s.baseUrl;
      const raw = await rewriteWithLlm(
        base,
        key,
        model,
        `Инструкция автора:\n${parsed.data.instruction}\n\n=== ИСХОДНЫЙ ТЕКСТ ===\n${text.slice(0, 15_000)}`,
        s.provider === 'deepseek' ? 'DeepSeek' : 'Kimi',
      );
      res.json({ ...parseRewrite(raw), mock: false, sourceUrl });
    } catch (e) {
      const msg = e instanceof Error ? e.message : 'unknown';
      const status = /Запрещённый адрес|Только http|тип контента/i.test(msg) ? 400 : /извлечь текст/i.test(msg) ? 422 : 502;
      res.status(status).json({ error: 'rewrite failed', message: msg });
    }
  },
);

