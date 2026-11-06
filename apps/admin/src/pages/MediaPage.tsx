import { useEffect, useRef, useState } from 'react';
import { api } from '../api';

interface MediaItem { id: number; filePath: string; alt: string | null; sourceUrl: string | null; createdAt: string }

export default function MediaPage() {
  const [items, setItems] = useState<MediaItem[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  const load = async () => setItems((await api<{ media: MediaItem[] }>('/media')).media);
  useEffect(() => { void load().catch(() => setError('Ошибка загрузки')); }, []);

  const upload = async (file: File) => {
    setBusy(true); setError(null); setNotice(null);
    try {
      const fd = new FormData();
      fd.append('file', file);
      const res = await fetch('/api/media/upload', {
        method: 'POST',
        headers: { Authorization: `Bearer ${localStorage.getItem('token')}` },
        body: fd,
      });
      const body = await res.json();
      if (!res.ok) throw new Error(JSON.stringify(body));
      setNotice('Загружено ✓');
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Ошибка загрузки');
    } finally {
      setBusy(false);
      if (fileRef.current) fileRef.current.value = '';
    }
  };

  const src = (m: MediaItem) => (m.filePath.startsWith('/') ? `${window.location.origin}${m.filePath}` : m.filePath);

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-bold">Медиатека</h1>
        <span className="flex items-center gap-3">
          <input
            ref={fileRef}
            type="file"
            accept="image/jpeg,image/png,image/webp,image/svg+xml"
            className="hidden"
            onChange={(e) => e.target.files?.[0] && void upload(e.target.files[0])}
          />
          <button className="btn" disabled={busy} onClick={() => fileRef.current?.click()}>
            {busy ? 'Загружаем…' : '+ Загрузить'}
          </button>
        </span>
      </div>
      {notice && <p className="rounded-lg bg-green-500/10 px-3 py-2 text-sm text-green-400">{notice}</p>}
      {error && <p className="rounded-lg bg-red-500/10 px-3 py-2 text-sm text-red-400">{error}</p>}

      <div className="grid grid-cols-3 gap-3 sm:grid-cols-5 lg:grid-cols-8">
        {items.map((m) => (
          <figure key={m.id} className="group relative">
            <img src={src(m)} alt={m.alt ?? ''} loading="lazy" className="aspect-square w-full rounded-lg border border-zinc-800 object-cover" />
            <figcaption className="absolute inset-x-0 bottom-0 truncate rounded-b-lg bg-zinc-950/80 px-2 py-1 text-[10px] text-zinc-400 opacity-0 transition-opacity group-hover:opacity-100">
              #{m.id} · {m.sourceUrl ?? ''}
            </figcaption>
          </figure>
        ))}
      </div>
      {items.length === 0 && <p className="text-sm text-zinc-500">Пусто. Сгенерируйте обложку в редакторе статьи или загрузите файл.</p>}
    </div>
  );
}
