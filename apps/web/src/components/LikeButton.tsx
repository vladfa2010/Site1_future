import { useEffect, useRef, useState } from 'react';
import { Heart } from 'lucide-react';
import { useAuth } from '../auth';
import { useAuthModal } from '../authModal';
import { api } from '../api';
import { formatCount } from '../lib/format';

/**
 * Лайк материала (ТЗ-04, образец — FavoriteButton): сердечко + число.
 * Анониму открывает AuthModal (лайк не создаётся, L1); клик по карточке не уходит
 * в навигацию (preventDefault/stopPropagation). Счётчик обновляется оптимистично,
 * после ответа подтягивается серверный likesCount (заодно лечит гонки, §4.4).
 */
export function LikeButton({
  articleId,
  liked,
  likesCount,
  className = '',
}: {
  articleId: number;
  liked: boolean;
  likesCount: number;
  className?: string;
}) {
  const { user } = useAuth();
  const { open } = useAuthModal();
  const [state, setState] = useState({ liked, likesCount });
  const [pending, setPending] = useState(false);
  // последние пропсы — для отката при ошибке, если сервер ещё не подтвердил
  const propsRef = useRef({ liked, likesCount });
  propsRef.current = { liked, likesCount };

  // серверные данные перезаписывают локальные при рефетче (монтирование/фокус окна)
  useEffect(() => {
    setState({ liked, likesCount });
  }, [liked, likesCount]);

  const toggle = async () => {
    if (!user) {
      open('login', window.location.pathname);
      return;
    }
    if (pending) return;
    const wasLiked = state.liked;
    setState((s) => ({ liked: !s.liked, likesCount: s.likesCount + (s.liked ? -1 : 1) }));
    setPending(true);
    try {
      const r = wasLiked ? await api.unlike(articleId) : await api.like(articleId);
      setState({ liked: r.liked, likesCount: r.likesCount });
    } catch {
      setState(propsRef.current); // откат оптимистичного обновления
    } finally {
      setPending(false);
    }
  };

  return (
    <button
      type="button"
      title={state.liked ? 'Убрать лайк' : 'Нравится'}
      onClick={(e) => {
        e.preventDefault();
        e.stopPropagation();
        void toggle();
      }}
      className={`flex h-8 items-center gap-1 rounded-full px-2.5 backdrop-blur-sm transition-colors ${
        state.liked ? 'bg-[#beff00] text-black' : 'bg-black/60 text-zinc-300 hover:text-[#beff00]'
      } ${className}`}
    >
      <Heart size={15} fill={state.liked ? 'currentColor' : 'none'} />
      {/* минимальная ширина + tabular-nums — раскладка не «прыгает» при смене числа (U1) */}
      <span className="min-w-[2ch] text-center text-xs font-semibold tabular-nums">
        {formatCount(state.likesCount)}
      </span>
    </button>
  );
}
