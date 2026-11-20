import { useState } from 'react';
import { api } from '../api';

interface SlopIssue {
  quote: string;
  pattern: string;
  severity: 'critical' | 'warn';
  problem: string;
  suggestion: string;
}

interface SlopResult {
  score: number | null;
  issues: SlopIssue[];
  reason?: string;
  words?: number;
  mock?: boolean;
}

/**
 * Панель «🧐 ИИ-штампы» (2026-11-20): стилистический аудит готового текста.
 * Не детектор «ИИ vs человек», а поиск палевных штампов: пара «тезис/риск»,
 * «не просто X, а Y», обобщения без цифр, дубли абзацев, шаблонный ритм.
 * Два шага: диагностика → «Исправить» (LLM переписывает проблемные места,
 * факты/цифры/тикеры сохраняются) → автор решает «Применить/Отклонить».
 */
export default function AiSlopPanel({ getHtml, onApply }: { getHtml: () => string; onApply: (html: string) => void }) {
  const [busy, setBusy] = useState(false);
  const [fixBusy, setFixBusy] = useState(false);
  const [result, setResult] = useState<SlopResult | null>(null);
  const [fixedHtml, setFixedHtml] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const check = async () => {
    const html = getHtml();
    if (!html || html.replace(/<[^>]+>/g, '').trim().length < 200) {
      setError('Текст слишком короткий для аудита — нужно хотя бы несколько абзацев');
      return;
    }
    setBusy(true);
    setError(null);
    setResult(null);
    setFixedHtml(null);
    try {
      const r = await api<SlopResult>('/admin/ai-slop', { method: 'POST', body: JSON.stringify({ html }) });
      setResult(r);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Ошибка аудита');
    } finally {
      setBusy(false);
    }
  };

  const fix = async () => {
    if (!result || result.issues.length === 0) return;
    setFixBusy(true);
    setError(null);
    try {
      const r = await api<{ html: string }>('/admin/ai-slop', {
        method: 'POST',
        body: JSON.stringify({ html: getHtml(), fix: true, issues: result.issues }),
      });
      setFixedHtml(r.html);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Ошибка исправления');
    } finally {
      setFixBusy(false);
    }
  };

  const scoreColor = (s: number | null) => (s == null ? 'text-zinc-400' : s >= 85 ? 'text-green-400' : s >= 70 ? 'text-amber-400' : 'text-red-400');

  return (
    <div className="rounded-lg border border-zinc-800 bg-zinc-900/40 p-3">
      <div className="flex flex-wrap items-center gap-2">
        <button type="button" className="btn-secondary" disabled={busy || fixBusy} onClick={() => void check()}>
          {busy ? 'Аудируем…' : '🧐 ИИ-штампы'}
        </button>
        <span className="text-xs text-zinc-600">Стилистическая проверка: палит ли текст как сгенерированный (не детектор ИИ, а аудит штампов)</span>
      </div>

      {error && <p className="mt-2 rounded-lg bg-red-500/10 px-3 py-2 text-sm text-red-400">{error}</p>}

      {result && (
        <div className="mt-3 space-y-3">
          <div className="flex flex-wrap items-baseline gap-3">
            <span className={`text-2xl font-bold tabular-nums ${scoreColor(result.score)}`}>
              {result.score == null ? '—' : result.score}
            </span>
            <span className="text-sm text-zinc-400">
              {result.score == null
                ? result.reason === 'text_too_short'
                  ? `Текст короткий (${result.words ?? '?'} слов) — аудит от 300 слов`
                  : 'Аудит не выполнен'
                : result.score >= 85
                  ? 'не палится'
                  : result.score >= 70
                    ? 'есть штампы — стоит пройтись'
                    : 'сильно палится — перепишите проблемные места'}
            </span>
            {result.mock && <span className="rounded-full bg-amber-500/10 px-2 py-0.5 text-xs text-amber-400">demo — без ключа LLM</span>}
          </div>

          {result.issues.length > 0 && (
            <ul className="space-y-2">
              {result.issues.map((i, n) => (
                <li key={n} className="rounded-lg border border-zinc-800 bg-zinc-950/60 p-3 text-sm">
                  <span className={`mb-1 inline-block rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide ${i.severity === 'critical' ? 'bg-red-500/15 text-red-400' : 'bg-amber-500/15 text-amber-400'}`}>
                    {i.pattern}
                  </span>
                  <blockquote className="border-l-2 border-zinc-600 pl-2 italic text-zinc-300">«{i.quote}»</blockquote>
                  <p className="mt-1 text-zinc-400">{i.problem}</p>
                  <p className="mt-1 text-zinc-500"><span className="text-zinc-600">→</span> {i.suggestion}</p>
                </li>
              ))}
            </ul>
          )}

          {result.issues.length > 0 && !fixedHtml && (
            <button type="button" className="btn" disabled={fixBusy} onClick={() => void fix()}>
              {fixBusy ? 'Исправляем…' : '✨ Исправить проблемные места'}
            </button>
          )}

          {fixedHtml && (
            <div className="flex items-center gap-3 rounded-lg border border-[#beff00]/30 bg-[#beff00]/5 p-3">
              <span className="text-sm">Исправленный текст готов. Факты, цифры и тикеры сохранены — проверьте перед применением.</span>
              <button type="button" className="btn" onClick={() => { onApply(fixedHtml); setFixedHtml(null); }}>
                Применить
              </button>
              <button type="button" className="btn-secondary" onClick={() => setFixedHtml(null)}>
                Отклонить
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
