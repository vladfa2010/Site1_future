import type { ArticleListItem } from '../api';

/**
 * Каскад выбора «следующего материала» для автоподгрузки (ТЗ-06 §3.2) — чистая функция.
 * Приоритет: 1) лента первого тренда текущей статьи, 2) та же лента по дате того же типа,
 * 3) любые опубликованные. Побеждает первый непустой источник; исключены уже показанные id.
 * `null` = источник не запрашивался или запрос упал (в каскаде это шаг пропускается).
 */

export interface NextCandidate {
  id: number;
  type: string;
  slug: string;
  title: string;
}

export function pickCandidates(
  trendArticles: ArticleListItem[] | null,
  byTypeArticles: ArticleListItem[] | null,
  allArticles: ArticleListItem[] | null,
  excludeIds: ReadonlySet<number>,
): NextCandidate[] {
  const sources = [trendArticles, byTypeArticles, allArticles];
  for (const source of sources) {
    if (!source || source.length === 0) continue;
    const picked: NextCandidate[] = [];
    for (const a of source) {
      if (excludeIds.has(a.id)) continue;
      picked.push({ id: a.id, type: a.type, slug: a.slug, title: a.title });
      if (picked.length >= 20) break; // глубже MAX_LOADED=3 не уйдём, запас на исключения
    }
    if (picked.length > 0) return picked;
  }
  return [];
}
