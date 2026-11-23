import { useEffect, useRef } from 'react';
import { useLocation } from 'react-router';

/**
 * Яндекс.Метрика (ID 104473798): трекинг клиентских SPA-переходов.
 *
 * Счётчик ставится в index.html и фиксирует только первую загрузку приложения;
 * при навигации React Router без перезагрузки страницы сниппет не срабатывает,
 * поэтому каждый последующий переход шлём вручную через ym('hit', ...).
 *
 * В бот-шаблон (ТЗ-10, apps/api/src/services/botRender.ts) счётчик НЕ добавляем:
 * там по ТЗ запрещён любой JS, а хиты ботов только засоряли бы статистику.
 */
const YM_ID = 104473798;

declare global {
  interface Window {
    ym?: (...args: unknown[]) => void;
  }
}

export default function YandexMetrika() {
  const { pathname, search } = useLocation();
  // Первый просмотр (включая прямой заход на конкретный URL) фиксирует
  // сниппет в index.html — дублировать его здесь нельзя.
  const isFirstRender = useRef(true);

  useEffect(() => {
    if (isFirstRender.current) {
      isFirstRender.current = false;
      return;
    }
    window.ym?.(YM_ID, 'hit', window.location.href, {
      title: document.title,
      referrer: document.referrer,
    });
  }, [pathname, search]);

  return null;
}
