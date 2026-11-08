/**
 * ТЗ-04 (ревью v2.1 №11): сверка денормализованных счётчиков с истиной.
 *
 * likes_count = COUNT(article_likes), shares_count = COUNT(article_share_events) — для ВСЕХ статей.
 * Скрипт безвреден: только приводит колонки к фактическому числу событий (самосхождение к истине,
 * правка ревью №9). Запускать на dev/stage; на проде — по решению (обычно раз в сутки, ночью).
 *
 * Запуск: npm run reconcile:engagement (из packages/db)
 */
import { sql } from 'drizzle-orm';
import { db } from './index.js';

/** Число статей, где колонки расходятся с фактическим COUNT по таблицам событий */
const mismatchSql = sql`
  select count(*)::int as n from articles
  where likes_count <> (select count(*) from article_likes al where al.article_id = articles.id)
     or shares_count <> (select count(*) from article_share_events se where se.article_id = articles.id)`;

const before = (await db.execute<{ n: number }>(mismatchSql)).rows[0];

await db.execute(sql`
  update articles set
    likes_count = (select count(*) from article_likes al where al.article_id = articles.id),
    shares_count = (select count(*) from article_share_events se where se.article_id = articles.id)`);

const after = (await db.execute<{ n: number }>(mismatchSql)).rows[0];
console.log(`[reconcile-engagement] расхождений до: ${before?.n ?? '?'}, после: ${after?.n ?? '?'}`);
if ((after?.n ?? 1) !== 0) {
  console.error('[reconcile-engagement] FAIL: расхождения остались после сверки');
  process.exit(1);
}
console.log('[reconcile-engagement] OK: likes_count/shares_count == COUNT(событий) для всех статей');
process.exit(0);
