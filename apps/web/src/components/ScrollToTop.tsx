import { useLayoutEffect } from 'react';
import { useLocation } from 'react-router';

/** Сброс скролла в начало при переходе на новую страницу.
 *  SPA-навигация через history pushState сохраняет прежний scrollY — без этого
 *  новая страница открывалась «посередине» скролла предыдущей (баг 2026-11-17
 *  и регресс 2026-11-22: «карточка новости открывается не с начала»).
 *
 *  Три меры сразу:
 *  1) useLayoutEffect — скролл сбрасывается ДО paint, браузер не успевает
 *     показать новую страницу на старой позиции (useEffect бежит после paint);
 *  2) зависимость от location.key, а не pathname — key меняется только на push
 *     (реальный переход по карточке), но НЕ на replace. AutoLoadNext меняет URL
 *     через history.replaceState напрямую — роутер его не видит, так что лишний
 *     сброс при автоподгрузке следующей статьи не грозит, а сценарии «роутер
 *     думает, что мы там же» перестают ломать сброс;
 *  3) history.scrollRestoration = 'manual' — браузер больше не восстанавливает
 *     свои сохранённые позиции скролла поверх нашего сброса.
 */
export default function ScrollToTop() {
  const { key } = useLocation();
  useLayoutEffect(() => {
    if ('scrollRestoration' in window.history) window.history.scrollRestoration = 'manual';
    window.scrollTo({ top: 0, left: 0, behavior: 'auto' });
  }, [key]);
  return null;
}
