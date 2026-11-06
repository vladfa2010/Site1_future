import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from 'react';
import { useAuth } from './auth';

/**
 * Избранное: набор ключей "type:id", единое для всех карточек.
 * Загружается при логине; toggle — оптимистично.
 */
interface FavoritesState {
  keys: Set<string>;
  toggle: (entityType: string, entityId: number) => Promise<void>;
  isFavorite: (entityType: string, entityId: number) => boolean;
}

const FavoritesContext = createContext<FavoritesState>({ keys: new Set(), toggle: async () => {}, isFavorite: () => false });

const authHeaders = () => ({ Authorization: `Bearer ${localStorage.getItem('token')}`, 'Content-Type': 'application/json' });

export function FavoritesProvider({ children }: { children: ReactNode }) {
  const { user } = useAuth();
  const [keys, setKeys] = useState<Set<string>>(new Set());

  useEffect(() => {
    if (!user) {
      setKeys(new Set());
      return;
    }
    void fetch('/api/favorites/keys', { headers: authHeaders() })
      .then((r) => (r.ok ? r.json() : Promise.reject()))
      .then((d: { keys: string[] }) => setKeys(new Set(d.keys)))
      .catch(() => {});
  }, [user]);

  const toggle = useCallback(async (entityType: string, entityId: number) => {
    const key = `${entityType}:${entityId}`;
    const had = keys.has(key);
    setKeys((prev) => {
      const next = new Set(prev);
      if (had) next.delete(key);
      else next.add(key);
      return next;
    });
    try {
      let r: Response;
      if (had) {
        r = await fetch(`/api/favorites/${entityType}/${entityId}`, { method: 'DELETE', headers: authHeaders() });
      } else {
        // PUT /api/favorites (тело) — роут НЕ принимает path-параметры
        r = await fetch('/api/favorites', {
          method: 'PUT',
          headers: authHeaders(),
          body: JSON.stringify({ entityType, entityId }),
        });
      }
      if (!r.ok) throw new Error();
    } catch {
      // откат оптимистичного обновления
      setKeys((prev) => {
        const next = new Set(prev);
        if (had) next.add(key);
        else next.delete(key);
        return next;
      });
    }
  }, [keys]);

  const isFavorite = useCallback((entityType: string, entityId: number) => keys.has(`${entityType}:${entityId}`), [keys]);

  return <FavoritesContext.Provider value={{ keys, toggle, isFavorite }}>{children}</FavoritesContext.Provider>;
}

export const useFavorites = () => useContext(FavoritesContext);
