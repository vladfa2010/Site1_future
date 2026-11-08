/**
 * Бэкфилл эмбеддингов статей для векторного поиска.
 * Использование: MOONSHOT_API_KEY=... MOONSHOT_EMBED_MODEL=<1024-мерная модель> npm run embed -w @newinvest/db
 * Идемпотентно: пересчитывает только статьи без эмбеддинга (или --force для всех).
 */
import { db, articles, articleEmbeddings } from './index.js';
import { stripHtml } from './text-utils.js';
import { sql, eq, isNull } from 'drizzle-orm';

const API_KEY = process.env.MOONSHOT_API_KEY ?? '';
const BASE_URL = process.env.MOONSHOT_BASE_URL ?? 'https://api.moonshot.ai/v1';
const MODEL = process.env.MOONSHOT_EMBED_MODEL ?? '';
const FORCE = process.argv.includes('--force');
const BATCH = 20;

if (!API_KEY || !MODEL) {
  console.error('Нужны MOONSHOT_API_KEY и MOONSHOT_EMBED_MODEL (1024-мерная модель).');
  process.exit(1);
}

async function embed(texts: string[]): Promise<number[][]> {
  const res = await fetch(`${BASE_URL}/embeddings`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${API_KEY}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ model: MODEL, input: texts }),
  });
  const data = (await res.json()) as { data?: { embedding: number[] }[]; error?: { message?: string } };
  if (!res.ok || !data.data) throw new Error(`embeddings API: ${res.status} ${data.error?.message ?? ''}`);
  return data.data.map((d) => d.embedding);
}

async function main() {
  // published-статьи без эмбеддинга (или все при --force)
  const missing = await db
    .select({ id: articles.id, title: articles.title, excerpt: articles.excerpt, thesis: articles.thesis, contentHtml: articles.contentHtml })
    .from(articles)
    .leftJoin(articleEmbeddings, eq(articleEmbeddings.articleId, articles.id))
    .where(FORCE ? sql`true` : isNull(articleEmbeddings.articleId));

  console.log(`К пересчёту: ${missing.length} статей (force=${FORCE})`);
  let done = 0;

  for (let i = 0; i < missing.length; i += BATCH) {
    const batch = missing.slice(i, i + BATCH);
    const texts = batch.map((a) => [a.title, a.thesis, a.excerpt, stripHtml(a.contentHtml).slice(0, 4000)].filter(Boolean).join('\n'));
    const vectors = await embed(texts);

    for (let j = 0; j < batch.length; j++) {
      const v = vectors[j];
      if (v.length !== 1024) throw new Error(`Модель вернула ${v.length} измерений, ждали 1024 — смените модель или миграцию`);
      await db.insert(articleEmbeddings)
        .values({ articleId: batch[j].id, embedding: v, model: MODEL })
        .onConflictDoUpdate({
          target: articleEmbeddings.articleId,
          set: { embedding: v, model: MODEL, updatedAt: sql`now()` },
        });
      done++;
    }
    console.log(`  ${done}/${missing.length}`);
  }
  console.log('Готово ✓');
  process.exit(0);
}

main().catch((e) => { console.error(e); process.exit(1); });
