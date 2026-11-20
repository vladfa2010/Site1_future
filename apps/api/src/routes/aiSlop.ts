/**
 * AI-slop аудит (2026-11-20): стилистическая проверка готового текста на «палевные»
 * ИИ-штампы. НЕ детектор «написано ли ИИ» (такие ненадёжны), а аудит конкретных
 * дефектов: штампы-вводные, пара «тезис/риск», обобщения без цифр, шаблонный ритм,
 * дословные дубли абзацев. Два режима:
 *   POST /api/admin/ai-slop {html} — диагностика {score, issues[]}
 *   POST /api/admin/ai-slop {html, fix: true, issues} — переписать проблемные места {html}
 *
 * Результаты полевого исследования (golden set, агент 2026-11-20) заложены в промпт:
 * доменные паттерны важнее школьных; <300 слов — отказ; дубли ловим детерминированно
 * ДО LLM (бесплатно и 100% точно).
 */
import { Router } from 'express';
import { z } from 'zod';
import { rateLimit } from 'express-rate-limit';
import { stripHtml } from '@newinvest/db/text-utils';
import { authRequired, requireRole } from '../middleware/auth.js';
import { getKimiSettings } from '../services/kimiSettings.js';
import { extractFirstJson, stripDsml } from './contentMaster.js';

export const aiSlopRouter = Router();

const limiter = rateLimit({
  windowMs: 60_000,
  limit: 10,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'ai-slop: слишком много запросов, подождите минуту' },
});

const issueSchema = z.object({
  quote: z.string().max(300),
  pattern: z.string().max(50),
  severity: z.enum(['critical', 'warn']),
  problem: z.string().max(300),
  suggestion: z.string().max(500),
});

const checkSchema = z.object({
  html: z.string().min(50).max(200_000),
  fix: z.boolean().default(false),
  issues: z.array(issueSchema).max(20).optional(),
});

const MIN_WORDS = 300;
const MAX_TEXT_CHARS = 15_000;

/** Детерминистический поиск дословных дублей абзацев — сильнейший сигнал, не нуждается в LLM.
 *  Работает по очищенному HTML (ДО stripHtml): абзацы выделяем по закрывающим
 *  блочным тегам — иначе схлопывание \s+ уничтожило бы границы абзацев. */
function findDuplicateParagraphs(cleanedHtml: string): z.infer<typeof issueSchema>[] {
  const norm = (s: string) => s.toLowerCase().replace(/\s+/g, ' ').replace(/[.,!?;:«»"„"—–\-]/g, '').trim();
  const paras = cleanedHtml
    .split(/<\/(?:p|h[1-6]|li|blockquote|div)>/i)
    .map((c) => stripHtml(c).trim())
    .filter((p) => p.length > 60);
  const seen = new Map<string, string>();
  const out: z.infer<typeof issueSchema>[] = [];
  for (const p of paras) {
    const key = norm(p).slice(0, 300);
    if (!key) continue;
    if (seen.has(key)) {
      out.push({
        quote: p.slice(0, 200),
        pattern: 'duplicated_passage',
        severity: 'critical',
        problem: 'Абзац дословно повторяется в тексте — мгновенно выдаёт машинную генерацию',
        suggestion: 'Удалите повтор, оставив один экземпляр в наиболее логичном месте',
      });
    } else {
      seen.set(key, p);
    }
  }
  return out;
}

const SLOP_SYSTEM = `Ты — стилистический аудитор русскоязычных текстов инвестиционного медиа.
Твоя задача — найти места, из-за которых текст выглядит машинно сгенерированным.
Ты НЕ определяешь, писал ли текст ИИ. Ты ищешь конкретные стилистические дефекты.

ЖЁСТКИЕ ПРАВИЛА:
1. ЗАПРЕЩЕНО изменять, удалять или «исправлять» факты, цифры, даты, названия компаний, тикеры, ссылки на источники и цитаты. В suggestion фактура quote и окружающего текста должна сохраняться дословно. Если проблемный фрагмент содержит факт — переписывай только формулировку, никогда — содержание.
2. Не придумывай новые факты, оценки и ссылки. Если конкретики не хватает, suggestion должен либо перефразировать без добавления фактов, либо явно предложить вставить [конкретный пример/источник] как плейсхолдер.
3. Цитаты (quote) — дословные фрагменты текста, уникальные: одна цитата = одно замечание. Не дублируй цитату в разных замечаниях.
4. Не аудируй: заголовки, подписи к таблицам, сноски, дисклеймеры, явно помеченные цитаты и переводы первоисточника (если текст помечен как перевод пресс-релиза/заявления — снижай вес ритмовых замечаний вдвое: жанр допускает единообразие).
5. Не более 10 замечаний: сначала наиболее серьёзные.

ИЩИ ЭТИ ПАТТЕРНЫ (для поля pattern):
- "cliche_opening" — штампы-вводные: «в современном мире», «важно отметить», «таким образом», «не секрет, что», «как известно».
- "not_just_but" — связка «не просто X, а Y» / «не только X, но и Y» при интерпретации событий.
- "thesis_risk_pair" — шаблонная пара «инвестиционный тезис / ключевой риск» с абстрактными формулировками без конкретных компаний, цифр или механизмов.
- "vague_generalization" — обобщения без источника и данных: «эксперты считают», «это демонстрирует способность», «устойчивый растущий источник», выводы, не подтверждённые цифрами в самом тексте.
- "template_rhythm" — три и более подряд идущих абзаца одинаковой конструкции.
- "numbered_clusters" — нумерованные «N ключевых X» с однотипными пунктами и эмодзи-маркерами.
- "empty_dash_intro" — вводные с тире, не несущие смысла; анафоры-лозунги («любого X, любого Y, в любом Z»).
- "duplicated_passage" — дословно повторяющиеся абзацы/фрагменты.
- "conclusion_formula" — формальное «В заключение…», «Таким образом, можно сделать вывод», риторический вопрос с тире как финал статьи.
- "no_specifics" — абзац-интерпретация события без единой конкретной детали (компания, цифра, дата, механизм).

severity: "critical" — дубли, выдуманные обобщения, ошибки фактуры в формулировках; "warn" — всё остальное.

Оценка score (0–100, 100 = текст не палится):
- начни со 100, вычитай: critical −10, warn −4;
- если весь текст не содержит ни одного паттерна — 95–100;
- типичный хороший журналистский текст: 85–95; видно машинное происхождение: <75.
Если текст короче ${MIN_WORDS} слов — верни {"score": null, "issues": [], "reason": "text_too_short"}.

ОТВЕЧАЙ СТРОГО JSON БЕЗ ПОЯСНЕНИЙ ВНЕ JSON:
{"score": число или null, "issues": [{"quote": "...", "pattern": "...", "severity": "critical|warn", "problem": "что не так, 1 предложение", "suggestion": "переписанный вариант"}], "reason": "только если score null"}`;

const FIX_SYSTEM = `Ты — редактор инвестиционного медиа. Тебе дан текст статьи (HTML) и список стилистических замечаний аудита.
Примени исправления: переписывай ТОЛЬКО проблемные фрагменты по suggestion, сохраняя весь остальной текст дословно.
ЖЁСТКО СОХРАНЯЙ: все факты, цифры, даты, имена компаний, тикеры, ссылки и цитаты — дословно. Меняется только формулировка.
Удали дословные дубли абзацев (оставь один экземпляр). Не добавляй новых фактов и оценок.
Сохрани HTML-разметку (допустимы <p>, <h2>, <h3>, <ul>, <ol>, <li>, <strong>, <em>, <blockquote>, <a href>).
ОТВЕЧАЙ СТРОГО JSON: {"html": "<полный текст статьи с применёнными правками>"}`;

async function llmChat(baseUrl: string, apiKey: string, model: string, system: string, user: string): Promise<string> {
  const res = await fetch(`${baseUrl}/chat/completions`, {
    method: 'POST',
    signal: AbortSignal.timeout(180_000),
    headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ model, messages: [{ role: 'system', content: system }, { role: 'user', content: user }], max_tokens: 8192, temperature: 0.2 }),
  });
  const data = (await res.json().catch(() => ({}))) as {
    choices?: { message?: { content?: string } }[];
    error?: { message?: string };
  };
  const content = data.choices?.[0]?.message?.content;
  if (!res.ok || !content) throw new Error(`LLM: ${res.status} ${data.error?.message ?? 'пустой ответ'}`);
  return content;
}

aiSlopRouter.post('/', authRequired, requireRole('admin', 'super_admin'), limiter, async (req, res) => {
  const parsed = checkSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: 'validation', details: parsed.error.flatten() });
    return;
  }
  const { html, fix } = parsed.data;

  // чистый текст: contentHtml может содержать целый лендинг со стилями/скриптами
  // (вывод исследования 2026-11-20) — stripHtml теги вырезает, но ТЕКСТ внутри
  // <script>/<style> оставил бы как есть, поэтому блоки удаляем ДО stripHtml
  const cleaned = html
    .replace(/<(script|style|noscript|svg)[\s\S]*?<\/\1>/gi, ' ')
    .replace(/<!--[\s\S]*?-->/g, ' ');
  const text = stripHtml(cleaned).replace(/\s+/g, ' ').trim();
  const words = text.split(' ').filter(Boolean).length;
  if (!fix && words < MIN_WORDS) {
    res.json({ score: null, issues: [], reason: 'text_too_short', words, mock: false });
    return;
  }

  // детерминистические дубли — всегда, даже в mock (не требуют ключа)
  const dupIssues = fix ? [] : findDuplicateParagraphs(cleaned);

  const s = await getKimiSettings();
  const key = s.provider === 'deepseek' ? s.deepseekApiKey : s.apiKey;
  const base = s.provider === 'deepseek' ? 'https://api.deepseek.com' : s.baseUrl;
  const model = s.provider === 'deepseek' ? s.deepseekModel : s.textModel;

  // mock без ключа: демо-результат, чтобы UX был понятен до появления ключа
  if (!key) {
    if (fix) {
      res.json({ html, mock: true });
      return;
    }
    res.json({
      score: 82, words, mock: true,
      issues: [
        ...dupIssues,
        { quote: '(демо) Инвестиционный тезис: …', pattern: 'thesis_risk_pair', severity: 'warn', problem: 'Демо-режим: шаблонная пара «тезис/риск» с абстрактной формулировкой', suggestion: 'Конкретизируйте тезис — добавьте механизм, цифру или компанию' },
        { quote: '(демо) не просто X, а Y', pattern: 'not_just_but', severity: 'warn', problem: 'Демо-режим: связка «не просто… а…» при интерпретации события', suggestion: 'Перепишите прямым утверждением без шаблонной связки' },
      ].slice(0, 12),
    });
    return;
  }

  try {
    if (fix) {
      const user = `ЗАМЕЧАНИЯ:\n${JSON.stringify(parsed.data.issues ?? [], null, 1)}\n\nТЕКСТ (HTML):\n${html.slice(0, 60_000)}`;
      const raw = await llmChat(base, key, model, FIX_SYSTEM, user);
      const json = extractFirstJson(stripDsml(raw));
      if (!json) throw new Error('Модель не вернула JSON с исправленным текстом');
      const d = JSON.parse(json) as { html?: unknown };
      if (typeof d.html !== 'string' || d.html.length < 50) throw new Error('Модель вернула пустой текст');
      res.json({ html: d.html, mock: false });
      return;
    }

    const user = `ТЕКСТ:\n${text.slice(0, MAX_TEXT_CHARS)}`;
    const raw = await llmChat(base, key, model, SLOP_SYSTEM, user);
    const json = extractFirstJson(stripDsml(raw));
    if (!json) throw new Error('Модель не вернула JSON — повторите проверку');
    const d = JSON.parse(json) as { score?: unknown; issues?: unknown; reason?: unknown };

    // нормализация + мердж детерминированных дублей
    const llmIssues = Array.isArray(d.issues)
      ? d.issues.map((i) => issueSchema.safeParse(i)).filter((r) => r.success).map((r) => (r as { success: true; data: z.infer<typeof issueSchema> }).data)
      : [];
    const issues = [...dupIssues, ...llmIssues].slice(0, 12);

    res.json({
      score: typeof d.score === 'number' ? d.score : null,
      issues,
      reason: typeof d.reason === 'string' ? d.reason : undefined,
      words,
      mock: false,
    });
  } catch (e) {
    res.status(502).json({ error: 'ai-slop failed', message: e instanceof Error ? e.message : 'unknown' });
  }
});
