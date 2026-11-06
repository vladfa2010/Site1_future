import { useEffect, useState } from 'react';
import { Navigate, useLocation } from 'react-router';

/**
 * Клиентские 301: таблица redirects (заполняется в админке, нужна для
 * SEO-миграции со старого сайта). На nginx проде редиректы отдаются
 * сервером; в SPA — перехват здесь.
 */
export function RedirectHandler({ children }: { children: React.ReactNode }) {
  const [map, setMap] = useState<Map<string, string> | null>(null);
  const location = useLocation();

  useEffect(() => {
    void fetch('/api/redirects')
      .then((r) => (r.ok ? r.json() : Promise.reject()))
      .then((d: { redirects: { oldPath: string; newPath: string }[] }) => {
        setMap(new Map(d.redirects.map((r) => [r.oldPath.replace(/\/$/, ''), r.newPath])));
      })
      .catch(() => setMap(new Map()));
  }, []);

  if (!map) return null; // загружаем таблицу — кратковременная пауза до первого рендера
  const target = map.get(location.pathname.replace(/\/$/, ''));
  if (target) return <Navigate to={target} replace />;
  return <>{children}</>;
}
