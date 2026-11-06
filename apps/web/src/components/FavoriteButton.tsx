import { Bookmark } from 'lucide-react';
import { useFavorites } from '../favorites';
import { useAuth } from '../auth';
import { useAuthModal } from '../authModal';

/**
 * Иконка «в избранное» для карточек и шапок страниц.
 * Анониму — открывает регистрацию (с возвратом сюда).
 */
export function FavoriteButton({ entityType, entityId, className = '' }: { entityType: string; entityId: number; className?: string }) {
  const { user } = useAuth();
  const { open } = useAuthModal();
  const { isFavorite, toggle } = useFavorites();
  const active = isFavorite(entityType, entityId);

  return (
    <button
      type="button"
      title={active ? 'Убрать из избранного' : 'В избранное'}
      onClick={(e) => {
        e.preventDefault();
        e.stopPropagation();
        if (!user) {
          open('login', window.location.pathname);
          return;
        }
        void toggle(entityType, entityId);
      }}
      className={`flex h-8 w-8 items-center justify-center rounded-full backdrop-blur-sm transition-colors ${
        active ? 'bg-[#beff00] text-black' : 'bg-black/60 text-zinc-300 hover:text-[#beff00]'
      } ${className}`}
    >
      <Bookmark size={15} fill={active ? 'currentColor' : 'none'} />
    </button>
  );
}
