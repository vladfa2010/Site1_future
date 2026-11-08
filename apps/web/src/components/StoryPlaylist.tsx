/**
 * ТЗ-08: видео-плейлист сюжета (story из type=video → плейлист).
 * Главный плеер + список серий + автопереход (YouTube IFrame API).
 * Принцип 4.3: пустые секции не рендерятся.
 */
import { useEffect, useRef, useState } from 'react';
import { toEmbedUrl, videoThumbnail } from '../lib/video';

// Ревью v2.1 №3: типизация YouTube IFrame API (без @types/youtube — объявляем глобально)
declare global {
  interface Window {
    YT?: {
      Player: new (
        el: string | HTMLElement,
        opts: {
          videoId: string;
          playerVars?: Record<string, number | string>;
          events?: { onStateChange?: (e: { data: number }) => void };
        },
      ) => YtPlayer;
      PlayerState?: { ENDED: number };
    };
    onYouTubeIframeAPIReady?: () => void;
  }
}

interface YtPlayer {
  destroy(): void;
  loadVideoById(videoId: string): void;
}

export interface PlaylistArticle {
  id: number;
  type: string;
  slug: string;
  title: string;
  excerpt: string | null;
  publishedAt: string | null;
  videoUrl: string | null;
  isPrimary: boolean;
}

/** id YouTube-видео из embed/src URL; null — не YouTube */
function youtubeVideoId(url: string): string | null {
  const embed = toEmbedUrl(url);
  if (!embed) return null;
  return embed.match(/youtube\.com\/embed\/([\w-]+)/)?.[1] ?? null;
}

/** Ленивая загрузка YouTube IFrame API с guard от повторного inject (ревью v2.1 №4) */
function ensureYouTubeApi(): Promise<void> {
  return new Promise((resolve) => {
    if (window.YT?.Player) {
      resolve();
      return;
    }
    const prev = window.onYouTubeIframeAPIReady;
    window.onYouTubeIframeAPIReady = () => {
      prev?.();
      resolve();
    };
    if (!document.querySelector('script[src="https://www.youtube.com/iframe_api"]')) {
      const s = document.createElement('script');
      s.src = 'https://www.youtube.com/iframe_api';
      document.head.appendChild(s);
    }
  });
}

const AUTOPLAY_KEY = 'invrf:playlist-autoplay';

/** Ревью v2.1 №7: try/catch на JSON.parse (Safari private mode) */
function readAutoplayPref(): boolean {
  try {
    return localStorage.getItem(AUTOPLAY_KEY) !== '0'; // по умолчанию включён (ТЗ R3)
  } catch {
    return true;
  }
}

export default function StoryPlaylist({ articles }: { articles: PlaylistArticle[] }) {
  // R5: стартовый индекс — isPrimary, иначе первый по порядку (порядок уже отсортирован по sort_order)
  const [currentIndex, setCurrentIndex] = useState(() => {
    const i = articles.findIndex((a) => a.isPrimary);
    return i >= 0 ? i : 0;
  });
  const [autoplay, setAutoplay] = useState(readAutoplayPref);

  const current = articles[currentIndex];
  const embedUrl = current?.videoUrl ? toEmbedUrl(current.videoUrl) : null;
  const ytId = current?.videoUrl ? youtubeVideoId(current.videoUrl) : null;

  // R3: autoplay только для YouTube (RuTube/VK iframe событий не шлёт — тумблер скрыт)
  const showAutoplayToggle = ytId !== null;
  const autoplayRef = useRef(autoplay);
  autoplayRef.current = autoplay;

  const playerRef = useRef<YtPlayer | null>(null);
  const playerHostId = `yt-player-${current?.id ?? 'none'}`;

  // YouTube-серия: плеер через IFrame API; автопереход — loadVideoById, НЕ сменой src (ревью v2.1 №2)
  useEffect(() => {
    playerRef.current = null;
    if (!ytId) return;
    let cancelled = false;
    void ensureYouTubeApi().then(() => {
      if (cancelled || !window.YT?.Player) return;
      // Ревью v2.1 №4: создание Player в useEffect после монтирования iframe (не в render)
      const player = new window.YT.Player(playerHostId, {
        videoId: ytId,
        playerVars: { enablejsapi: 1, rel: 0 },
        events: {
          onStateChange: (e) => {
            // Автозапуск первой серии при загрузке НЕ выполняется (playerVars без autoplay)
            if (e.data === window.YT?.PlayerState?.ENDED && autoplayRef.current) {
              setCurrentIndex((i) => {
                // Решение ТЗ (тест 7 §5): серия без embed исключается — перепрыгиваем её;
                // если следующей валидной нет — стоп (последняя серия без цикла)
                for (let j = i + 1; j < articles.length; j++) {
                  const url = articles[j].videoUrl;
                  if (url && toEmbedUrl(url)) return j;
                }
                return i;
              });
            }
          },
        },
      });
      playerRef.current = player;
    });
    return () => {
      cancelled = true;
      // Риск-таблица ТЗ: destroy + отписка на unmount
      playerRef.current?.destroy();
      playerRef.current = null;
    };
    // playerHostId деривативен от current.id; пересоздание плеера — только при смене серии
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ytId, current?.id]);

  const toggleAutoplay = () => {
    setAutoplay((v) => {
      const next = !v;
      try {
        localStorage.setItem(AUTOPLAY_KEY, next ? '1' : '0');
      } catch {
        /* Safari private mode — состояние не сохранится, тумблер работает в рамках сессии */
      }
      return next;
    });
  };

  return (
    <div className="grid gap-6 lg:grid-cols-3">
      <div className="space-y-4 lg:col-span-2">
        {/* Ревью v2.1 №1: счётчик «Серия N из M» в зоне плеера */}
        <div className="flex items-center justify-between gap-4">
          <span className="text-sm text-zinc-400">
            Серия {currentIndex + 1} из {articles.length}
          </span>
          {showAutoplayToggle && (
            <label className="flex cursor-pointer items-center gap-2 text-sm text-zinc-400">
              <input type="checkbox" checked={autoplay} onChange={toggleAutoplay} className="accent-[#beff00]" />
              Следующее видео автоматически
            </label>
          )}
        </div>

        {ytId ? (
          <div className="overflow-hidden rounded-xl border border-[#2a2a2a]">
            {/* Контейнер захватывается new YT.Player по id; key гарантирует чистый DOM при смене серии */}
            <div key={playerHostId} id={playerHostId} className="aspect-video w-full" />
          </div>
        ) : embedUrl ? (
          // RuTube/VK/Dailymotion/Vimeo: обычный embed (событий ended нет — автоплей недоступен, ТЗ R3)
          <div className="overflow-hidden rounded-xl border border-[#2a2a2a]">
            <iframe
              key={current.id}
              src={embedUrl}
              title={current.title}
              className="aspect-video w-full"
              allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
              allowFullScreen
              loading="lazy"
            />
          </div>
        ) : (
          // ТЗ §7.5: серия без video_url / нераспознанная платформа — превью-заглушка, клик → материал
          <a
            href={`/${current.type}/${current.slug}`}
            className="relative flex aspect-video w-full flex-col items-center justify-center gap-3 overflow-hidden rounded-xl border border-[#2a2a2a] bg-zinc-900 text-center"
          >
            {current.videoUrl && videoThumbnail(current.videoUrl) ? (
              <img src={videoThumbnail(current.videoUrl)!} alt="" className="absolute h-full w-full object-cover opacity-30" />
            ) : null}
            <span className="relative text-zinc-400">Видео этой серии недоступно для встраивания</span>
            <span className="relative font-semibold text-[#beff00]">Открыть материал →</span>
          </a>
        )}

        <div>
          <h2 className="text-xl font-bold">{current.title}</h2>
          {current.excerpt && <p className="mt-2 text-sm text-zinc-400">{current.excerpt}</p>}
          <a href={`/${current.type}/${current.slug}`} className="mt-2 inline-block text-sm font-semibold text-[#beff00] hover:text-[#d6ff5c]">
            Открыть материал →
          </a>
        </div>
      </div>

      {/* R2.3: список серий — сбоку на десктопе, снизу на мобильном (grid 2/3 + 1/3) */}
      <ol className="space-y-2">
        {articles.map((a, i) => {
          const thumb = a.videoUrl ? videoThumbnail(a.videoUrl) : null;
          const playing = i === currentIndex;
          return (
            <li key={a.id}>
              <button
                type="button"
                onClick={() => setCurrentIndex(i)}
                className={`flex w-full items-center gap-3 rounded-xl border p-2 text-left transition-colors ${
                  playing ? 'border-[#beff00]/60 bg-[#beff00]/5' : 'border-[#2a2a2a] hover:border-zinc-600'
                }`}
              >
                <span className="w-6 shrink-0 text-center text-sm text-zinc-500">{i + 1}</span>
                {thumb ? (
                  <img src={thumb} alt="" className="h-12 w-20 shrink-0 rounded-lg object-cover" loading="lazy" />
                ) : (
                  <span className="flex h-12 w-20 shrink-0 items-center justify-center rounded-lg bg-zinc-800 text-xs text-zinc-500">
                    {a.type}
                  </span>
                )}
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm font-semibold text-zinc-100">{a.title}</span>
                  <span className="block text-xs text-zinc-500">
                    {a.publishedAt?.slice(0, 10)}
                    {a.isPrimary ? ' · главная' : ''}
                  </span>
                </span>
                {playing && <span className="shrink-0 rounded-full bg-[#beff00] px-2 py-0.5 text-xs font-bold text-zinc-950">сейчас</span>}
              </button>
            </li>
          );
        })}
      </ol>
    </div>
  );
}
