/**
 * Единый менеджер document.title (ТЗ-06, синхронизация с ТЗ-02 — единственный механизм).
 * Формат: «{title}» — инвестиционно.рф (для статей; заголовок ПОЛНЫЙ, без обрезки).
 */

export const SITE_TITLE = 'инвестиционно.рф';

export const articleTitle = (title: string) => `«${title}» — ${SITE_TITLE}`;

export const setArticleTitle = (title: string) => {
  document.title = articleTitle(title);
};

/** Сброс на «голый» сайт при unmount страницы статьи (аддендум v2.1 №7 —
 *  иначе заголовок протекает на страницы без менеджера). */
export const resetPageTitle = () => {
  document.title = SITE_TITLE;
};
