#!/usr/bin/env node
/**
 * Golden set регрессионной проверки аудита ИИ-штампов (2026-11-20).
 *
 * Прогоняет POST /api/admin/ai-slop по фиксированному набору статей и печатает
 * сводку: score / число замечаний / топ-паттерны. Ожидания — в docs/ai-slop-golden.md
 * (выводы полевого исследования субагентом). Запускать после каждой правки промпта
 * SLOP_SYSTEM: если распределение score'ов заметно поплыло — промпт регрессировал.
 *
 * Использование:
 *   BASE=https://217-114-10-164.sslip.io:8443 TOKEN=<admin-jwt> node scripts/ai-slop-golden.mjs
 */
const BASE = process.env.BASE ?? 'http://localhost:1003';
const TOKEN = process.env.TOKEN;
if (!TOKEN) { console.error('Задайте TOKEN (admin JWT)'); process.exit(1); }

// Фиксированный набор: 3 ИИ-статьи + 2 человеческие (миграция WP) — id/url стабильны
const CASES = [
  { id: 'A', url: '/api/articles/novost/vulcan-vernulas-k-poletam-i-poteryala-40-sputnikov-amazon-leo-chto-eto-znachit-d', kind: 'ИИ' },
  { id: 'B', url: '/api/articles/analitika/kraken-marzha-platformy-12-kv-kv-do-487-mln-ebitda-60-mln-v-q3-2026', kind: 'ИИ' },
  { id: 'C', url: '/api/articles/ideya/proekt-prometej-sledujushhij-shag-razvitija-ii', kind: 'ИИ' },
  { id: 'D', url: '/api/articles/interesnoe/kak-rabotaet-skafandr', kind: 'человек' },
  { id: 'D2', url: '/api/articles/interesnoe/world-models-kak-ai-uchitsja-ponimat-fizicheskij-mir', kind: 'человек?' },
];

const auth = { Authorization: `Bearer ${TOKEN}`, 'Content-Type': 'application/json' };

for (const c of CASES) {
  const art = await fetch(`${BASE}${c.url}`).then((r) => r.json()).catch(() => null);
  const html = art?.article?.contentHtml;
  if (!html) { console.log(`${c.id}\t${c.kind}\t— не удалось получить текст`); continue; }
  const t0 = Date.now();
  const r = await fetch(`${BASE}/api/admin/ai-slop`, { method: 'POST', headers: auth, body: JSON.stringify({ html }) });
  const d = await r.json().catch(() => ({}));
  const dt = ((Date.now() - t0) / 1000).toFixed(0);
  if (!r.ok) { console.log(`${c.id}\t${c.kind}\tОШИБКА ${r.status}: ${(d.message ?? '').slice(0, 80)}`); continue; }
  const patterns = (d.issues ?? []).map((i) => i.pattern).join(',') || '—';
  console.log(`${c.id}\t${c.kind}\tscore=${d.score ?? d.reason}\tissues=${(d.issues ?? []).length}\t[${patterns}]\t${dt}s${d.mock ? '\tmock' : ''}`);
}
console.log('\nОжидания см. docs/ai-slop-golden.md');
