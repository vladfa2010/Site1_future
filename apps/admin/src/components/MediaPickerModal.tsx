import { useEffect, useState } from 'react';
import { api } from '../api';

interface MediaItem { id: number; filePath: string; alt: string | null; sourceUrl: string | null; createdAt: string }

interface Props {
  selectedId: number | null;
  onSelect: (item: MediaItem) => void;
  onClose: () => void;
}

const src = (m: MediaItem) => (m.filePath.startsWith('/') ? `${window.location.origin}${m.filePath}` : m.filePath);

/** Модал выбора обложки из файлового хранилища (медиатека) */
export default function MediaPickerModal({ selectedId, onSelect, onClose }: Props) {
  const [items, setItems] = useState<MediaItem[]>([]);
  const [q, setQ] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    api<{ media: MediaItem[] }>('/media')
      .then((d) => setItems(d.media))
      .catch((e) => setError(e instanceof Error ? e.message : 'Ошибка загрузки'))
      .finally(() => setLoading(false));
  }, []);

  const filtered = q.trim()
    ? items.filter((m) => `${m.filePath} ${m.alt ?? ''} ${m.sourceUrl ?? ''}`.toLowerCase().includes(q.trim().toLowerCase()))
    : items;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-zinc-950/80 p-4 backdrop-blur-sm" onClick={onClose}>
      <div
        className="flex max-h-[85vh] w-full max-w-4xl flex-col rounded-xl border border-zinc-700 bg-zinc-900 shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between border-b border-zinc-800 px-4 py-3">
          <h2 className="font-semibold">Выбрать из медиатеки</h2>
          <div className="flex items-center gap-3">
            <input
              autoFocus
              className="input w-56 py-1 text-sm"
              placeholder="Поиск по файлу…"
              value={q}
              onChange={(e) => setQ(e.target.value)}
            />
            <button onClick={onClose} className="rounded-lg bg-zinc-800 px-3 py-1.5 text-sm text-zinc-300 hover:bg-zinc-700">✕</button>
          </div>
        </div>

        <div className="flex-1 overflow-y-auto p-4">
          {loading && <p className="text-sm text-zinc-500">Загружаем…</p>}
          {error && <p className="text-sm text-red-400">{error}</p>}
          {!loading && !error && filtered.length === 0 && (
            <p className="text-sm text-zinc-500">{q ? 'Ничего не найдено.' : 'Медиатека пуста — загрузите или сгенерируйте обложку.'}</p>
          )}
          <div className="grid grid-cols-3 gap-3 sm:grid-cols-5 lg:grid-cols-6">
            {filtered.map((m) => (
              <button
                key={m.id}
                onClick={() => onSelect(m)}
                className={`group relative overflow-hidden rounded-lg border-2 transition-all ${
                  selectedId === m.id ? 'border-[#beff00]' : 'border-zinc-800 hover:border-zinc-500'
                }`}
                title={m.filePath}
              >
                <img src={src(m)} alt={m.alt ?? ''} loading="lazy" className="aspect-square w-full object-cover" />
                <span className="absolute inset-x-0 bottom-0 truncate bg-zinc-950/80 px-1.5 py-0.5 text-left text-[10px] text-zinc-400 opacity-0 transition-opacity group-hover:opacity-100">
                  #{m.id} {m.sourceUrl ?? ''}
                </span>
                {selectedId === m.id && (
                  <span className="absolute right-1 top-1 rounded-full bg-[#beff00] px-1.5 text-xs font-bold text-zinc-950">✓</span>
                )}
              </button>
            ))}
          </div>
        </div>

        <div className="border-t border-zinc-800 px-4 py-2 text-xs text-zinc-500">
          Найдено: {filtered.length} из {items.length} · клик — выбрать обложку
        </div>
      </div>
    </div>
  );
}
