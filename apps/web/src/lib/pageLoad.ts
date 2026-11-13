import { useEffect, useRef } from 'react';
import { useLocation } from 'react-router';
import { useIsFetching } from '@tanstack/react-query';

/**
 * Телеметрия загрузки страниц (для админ-метрики «Скорость страниц»).
 * Открытие страницы → момент, когда React Query догрузил данные (isFetching === 0).
 * Отправка через sendBeacon — не блокирует и переживает уход со страницы.
 */
export function usePageLoadTelemetry() {
  const { pathname } = useLocation();
  const isFetching = useIsFetching();
  const startedAt = useRef(Date.now());
  const pathRef = useRef(pathname);
  const sentRef = useRef(true); // первый маунт — это полная загрузка приложения, не замеряем

  useEffect(() => {
    startedAt.current = Date.now();
    pathRef.current = pathname;
    sentRef.current = false;
  }, [pathname]);

  useEffect(() => {
    if (isFetching > 0 || sentRef.current) return;
    const elapsed = Date.now() - startedAt.current;
    sentRef.current = true;
    if (elapsed < 50) return; // мгновенная страница — смысла нет
    const body = JSON.stringify({ path: pathRef.current, loadMs: elapsed });
    if (navigator.sendBeacon) {
      navigator.sendBeacon('/api/telemetry/page-load', new Blob([body], { type: 'application/json' }));
    } else {
      void fetch('/api/telemetry/page-load', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body,
        keepalive: true,
      }).catch(() => { /* телеметрия не критична */ });
    }
  }, [isFetching]);
}

/** Полоска прогресса загрузки данных (react-query) — сверху экрана. */
export function useLoadingBarActive(): boolean {
  return useIsFetching() > 0;
}
