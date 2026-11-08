/**
 * Backfill reading_time для существующих материалов (ТЗ-09).
 * Использование: npm run backfill:reading-time -w @newinvest/db [-- --force]
 * Без --force пересчитывает только статьи с reading_time IS NULL (идемпотентно).
 * --force — чистый пересчёт от текущего контента для всех статей.
 * UPDATE батчами по 50 (один roundtrip на батч, CASE по id).
 */
import { db, articles } from './index.js';
import { calcReadingTime } from './text-utils.js';
import { sql, isNull } from 'drizzle-orm';

const FORCE = process.argv.includes('--force');
const BATCH = 50;

async function main() {
  const rows = await db
    .select({ id: articles.id, contentHtml: articles.contentHtml })
    .from(articles)
    .where(FORCE ? sql`true` : isNull(articles.readingTime));

  console.log(`К пересчёту: ${rows.length} статей (force=${FORCE})`);
  let done = 0;

  for (let i = 0; i < rows.length; i += BATCH) {
    const batch = rows.slice(i, i + BATCH);
    // один UPDATE на батч: case id when <id> then <минуты> end where id in (...)
    // (идентификаторы без квалификатора таблицы — SET в PG его не принимает;
    //  минуты — целые литералы от calcReadingTime, безопасны для sql.raw)
    const cases = sql.join(
      batch.map((r) => sql`when ${r.id} then ${sql.raw(String(calcReadingTime(r.contentHtml)))}`),
      sql` `,
    );
    const ids = sql.join(batch.map((r) => sql`${r.id}`), sql`, `);
    await db.execute(sql`update articles set reading_time = case id ${cases} end where id in (${ids})`);
    done += batch.length;
    console.log(`  ${done}/${rows.length}`);
  }

  // контрольный запрос: не должно остаться NULL (иначе exit 1 без --force)
  const [rest] = await db
    .select({ n: sql<number>`count(*)::int` })
    .from(articles)
    .where(isNull(articles.readingTime));
  console.log(`обновлено ${done}; осталось NULL: ${rest.n}`);
  if (rest.n > 0 && !FORCE) {
    console.error('Остались статьи без reading_time — перезапустите с --force или разберитесь вручную.');
    process.exit(1);
  }
  console.log('Готово ✓');
  process.exit(0);
}

main().catch((e) => { console.error(e); process.exit(1); });
