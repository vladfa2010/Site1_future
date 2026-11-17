import { useEffect } from 'react';
import { useLocation } from 'react-router';

/** Сброс скролла в начало при переходе на новую страницу (изменился pathname).
 *  SPA-навигация через history pushState сохраняет прежний scrollY — без этого
 *  новая страница открывалась «посередине» скролла предыдущей (баг 2026-11-17:
 *  новость из середины ленты открывалась не с начала). */
export default function ScrollToTop() {
  const { pathname } = useLocation();
  useEffect(() => {
    window.scrollTo({ top: 0, left: 0, behavior: 'auto' });
  }, [pathname]);
  return null;
}
