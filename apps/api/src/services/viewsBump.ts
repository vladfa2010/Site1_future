/**
 * ТЗ-03: виртуальный счётчик просмотров + автодокрутка.
 *
 * viewsCount(article) = count(article_views) + views_base_offset + views_bump_accumulated
 * Реальные просмотры НИКОГДА не пишутся в article_views — таблица остаётся
 * источником честной аналитики (R4.2).
 */
import { sql } from 'drizzle-orm';
import { db, articles } from '@newinvest/db';

/**
 * Фрагмент SQL для селектов: виртуальный счётчик целиком.
 * Переиспользуется в списке/детали/статистике/поиске.
 * Заложено имя, чтобы при росте объёмов заменить подзапрос count(*) на
 * материализованный счётчик точечно (риск №3 ТЗ-03 §8).
 */
export const virtualViewsSql = sql<number>`(
  select count(*) from article_views av where av.article_id = ${articles.id}
)::int + ${articles.viewsBaseOffset} + ${articles.viewsBumpAccumulated}`;

/**
 * Один проход автодокрутки: всем «созревшим» статьям (enabled и дедлайн наступил)
 * добавляет случайное целое из [min, max] к accumulated и ставит lastBumpAt = now.
 *
 * Идемпотентность: начисление привязано к views_bump_last_at, а не к проходу —
 * два вызова подряд вторым не находит «созревших» строк (R3.3).
 * Одни бамп за проход: пропущенные за простой сервера периоды НЕ компенсируются
 * (зафиксировано, правка ревью v2.1 №2).
 */
export async function runViewsBump(): Promise<{
  processed: number;
  details: { articleId: number; added: number }[];
}> {
  const updated = await db.execute<{ article_id: number; added: number }>(sql`
    with due as (
      select id,
        floor(random() * (views_auto_bump_max - views_auto_bump_min + 1) + views_auto_bump_min)::int as added
      from ${articles}
      where ${articles.viewsAutoBumpEnabled}
        and ${articles.viewsAutoBumpEveryHours} is not null
        and (${articles.viewsBumpLastAt} is null
             or ${articles.viewsBumpLastAt} + ${articles.viewsAutoBumpEveryHours} * interval '1 hour' <= now())
    )
    update ${articles} as a
    set views_bump_accumulated = views_bump_accumulated + d.added,
        views_bump_last_at = now()
    from due d
    where a.id = d.id
    returning a.id as article_id, d.added as added
  `);
  const details = updated.rows.map((r) => ({ articleId: Number(r.article_id), added: Number(r.added) }));
  return { processed: details.length, details };
}
