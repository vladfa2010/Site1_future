/**
 * ТЗ-07: Trending Now — бегущая строка «Сейчас читают» под шапкой.
 * - Публичный топ по реальным просмотрам за 6 ч (GET /api/trending).
 * - Счётчик 👁 НЕ рендерим (аддендум ревью v2.1 №1: конфликт с виртуальными
 *   счётчиками ТЗ-03; тиккер — навигация, не аналитика).
 * - Скрыт на страницах материалов /:type/:slug (аддендум №2: marquee мешает чтению).
 * - Пустой список → null (принцип 4.3), но последний непустой снапшот держим
 *   до 2×TTL, чтобы тиккер не исчезал посреди сессии при кратком «провале» окна.
 * - Marquee: дубль контента aria-hidden, пауза при hover, transform-анимация;
 *   touch (hover: none) и prefers-reduced-motion → ручной скролл без autoplay.
 */
import { useEffect, useRef, useState } from 'react';
import { Link, useLocation } from 'react-router';
import { useQuery } from '@tanstack/react-query';
import { api, type TrendingItem } from '../api';

const REFETCH_MS = 5 * 60 * 1000; // = бэкенд-TTL: фронт не долбит API чаще кэша
const SNAPSHOT_TTL_MS = 2 * REFETCH_MS; // аддендум v2.1 №6: держим снапшот до 2×TTL

// типы материалов (как ARTICLE_TYPES в packages/db) — страницы чтения скрывают тиккер
const ARTICLE_PAGE_RE = /^\/(novost|sobytie|analitika|interesnoe|ideya|video)\/[^/]+$/;

function TickerList({ items, hidden }: { items: TrendingItem[]; hidden?: boolean }) {
  return (
    <ul aria-hidden={hidden || undefined} className="flex shrink-0 items-center">
      {items.map((it) => (
        <li key={`${it.type}/${it.slug}`} className="flex shrink-0 items-center">
          <Link
            to={`/${it.type}/${it.slug}`}
            className="whitespace-nowrap text-xs text-zinc-300 transition-colors hover:text-[#beff00] sm:text-sm"
          >
            {it.title}
          </Link>
          <span className="px-3 text-zinc-600" aria-hidden="true">•</span>
        </li>
      ))}
    </ul>
  );
}

export function TrendingTicker() {
  const { pathname } = useLocation();
  const { data } = useQuery({
    queryKey: ['trending'],
    queryFn: () => api.trending(),
    refetchInterval: REFETCH_MS,
    staleTime: REFETCH_MS,
    retry: false,
  });

  // последний непустой снапшот: при кратком опустошении окна не дёргаем вёрстку
  const [snapshot, setSnapshot] = useState<{ items: TrendingItem[]; at: number } | null>(null);
  const items = data?.items;
  useEffect(() => {
    if (items && items.length > 0) setSnapshot({ items, at: Date.now() });
  }, [items]);

  // длительность цикла — из ширины ленты: комфортная скорость чтения, минимум 40 с
  const trackRef = useRef<HTMLDivElement>(null);
  const [duration, setDuration] = useState(40);
  useEffect(() => {
    const firstCopy = trackRef.current?.firstElementChild;
    if (firstCopy && firstCopy.scrollWidth > 0) {
      setDuration(Math.max(40, Math.round(firstCopy.scrollWidth / 55)));
    }
  }, [snapshot]);

  if (ARTICLE_PAGE_RE.test(pathname)) return null; // страница чтения — без marquee

  const live = items && items.length > 0 ? items : null;
  const held = snapshot && Date.now() - snapshot.at < SNAPSHOT_TTL_MS ? snapshot.items : null;
  const shown = live ?? held;
  if (!shown) return null; // пусто = нет элемента (принцип 4.3)

  return (
    <nav aria-label="Сейчас читают" className="ticker border-b border-[#2a2a2a] bg-[#111]">
      <div className="flex h-9 items-center">
        <span className="flex h-full shrink-0 items-center border-r border-[#2a2a2a] bg-[#111] px-3 text-xs font-bold uppercase tracking-wide text-[#beff00] sm:px-4">
          Сейчас читают
        </span>
        <div className="ticker-viewport flex-1">
          <div
            ref={trackRef}
            className="ticker-track flex w-max"
            style={{ animationDuration: `${duration}s` }}
          >
            <TickerList items={shown} />
            <TickerList items={shown} hidden /> {/* дубль для бесшовного цикла */}
          </div>
        </div>
      </div>
    </nav>
  );
}
