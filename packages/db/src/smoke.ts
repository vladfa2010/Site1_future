/**
 * Смоук-тест прототипа: заполняет граф знаний минимальными данными
 * и проверяет векторный поиск (косинусная близость через pgvector).
 *
 * Запуск: npm run db:smoke (из корня монорепо)
 */
import { db, articles, industries, companies, tickers, articleEmbeddings } from './index.js';
import { cosineDistance } from 'drizzle-orm';
import { sql } from 'drizzle-orm';

// Псевдо-эмбеддинг для теста: в реальности считается LLM при публикации
const fakeEmbedding = (seed: number) =>
  Array.from({ length: 1024 }, (_, i) => Math.sin(seed * (i + 1) * 0.01));

async function main() {
  console.log('1. Создаю индустрию, компанию, тикер...');

  const [industry] = await db
    .insert(industries)
    .values({ slug: 'spacetech', name: 'SpaceTech' })
    .onConflictDoNothing({ target: industries.slug })
    .returning();
  const spacetech = industry ?? (await db.query.industries.findFirst({ where: (t, { eq }) => eq(t.slug, 'spacetech') }))!;

  const [company] = await db
    .insert(companies)
    .values({ slug: 'spacex', name: 'SpaceX', isPublic: true })
    .onConflictDoNothing({ target: companies.slug })
    .returning();
  const spacex = company ?? (await db.query.companies.findFirst({ where: (t, { eq }) => eq(t.slug, 'spacex') }))!;

  const [ticker] = await db
    .insert(tickers)
    .values({ slug: 'spcx', symbol: 'SPCX', companyId: spacex.id, exchange: 'NASDAQ' })
    .onConflictDoNothing({ target: tickers.slug })
    .returning();
  const spcx = ticker ?? (await db.query.tickers.findFirst({ where: (t, { eq }) => eq(t.slug, 'spcx') }))!;

  console.log(`   OK: индустрия #${spacetech.id}, компания #${spacex.id}, тикер #${spcx.id} (${spcx.symbol})`);
  console.log('   Цепочка графа: тикер → компания → индустрия работает');

  console.log('2. Создаю статьи с эмбеддингами...');

  const articleRows = [
    { type: 'novost', slug: 'spacex-lider-po-sputnikam', title: 'SpaceX — лидер по количеству спутников', seed: 1 },
    { type: 'analitika', slug: 'ipо-spacex-razbor', title: 'SpaceX. Разбор IPO', seed: 2 },
    { type: 'interesnoe', slug: 'kak-rabotaet-skafandr', title: 'Как работает скафандр', seed: 50 },
  ];

  const ids: number[] = [];
  for (const a of articleRows) {
    const [row] = await db
      .insert(articles)
      .values({ type: a.type, slug: a.slug, title: a.title, contentHtml: '<p>Текст</p>', status: 'published' })
      .onConflictDoNothing({ target: [articles.type, articles.slug] })
      .returning();
    const article = row ?? (await db.query.articles.findFirst({ where: (t, { and, eq }) => and(eq(t.type, a.type), eq(t.slug, a.slug)) }))!;
    ids.push(article.id);

    await db
      .insert(articleEmbeddings)
      .values({ articleId: article.id, embedding: fakeEmbedding(a.seed), model: 'smoke-test' })
      .onConflictDoUpdate({
        target: articleEmbeddings.articleId,
        set: { embedding: fakeEmbedding(a.seed), model: 'smoke-test' },
      });
  }
  console.log(`   OK: ${ids.length} статьи, эмбеддинги посчитаны`);

  console.log('3. Векторный поиск: ищем похожие на статью #1...');

  const queryEmbedding = fakeEmbedding(1.05); // близко к статье с seed=1
  const similar = await db
    .select({
      id: articles.id,
      title: articles.title,
      distance: sql<number>`${cosineDistance(articleEmbeddings.embedding, queryEmbedding)}`,
    })
    .from(articleEmbeddings)
    .innerJoin(articles, sql`${articles.id} = ${articleEmbeddings.articleId}`)
    .orderBy(sql`${cosineDistance(articleEmbeddings.embedding, queryEmbedding)}`)
    .limit(3);

  console.log('   Результаты (расстояние — чем меньше, тем похоже):');
  for (const row of similar) {
    console.log(`   ${row.distance.toFixed(4)}  ${row.title}`);
  }

  const ok = similar[0]?.id === ids[0] && similar[0].distance < similar[similar.length - 1].distance;
  console.log(ok ? '\n✅ Смоук-тест пройден: граф + pgvector работают' : '\n❌ Что-то не так');
  process.exit(ok ? 0 : 1);
}

main().catch((e) => {
  console.error('Ошибка:', e.message);
  process.exit(1);
});
