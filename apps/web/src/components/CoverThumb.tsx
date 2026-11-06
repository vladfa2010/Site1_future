/**
 * Вертикальная обложка 3:4 как у донора (324x400): картинка, поверх градиент
 * и заголовок. Fallback — градиентная плашка (принцип 4.3: нет обложки —
 * всё равно аккуратно).
 */
export function CoverThumb({ title, coverUrl, subtitle }: { title: string; coverUrl?: string | null; subtitle?: string }) {
  return (
    <div className="relative aspect-[3/4] w-full overflow-hidden rounded-lg bg-zinc-800">
      {coverUrl && (
        <img
          src={coverUrl}
          alt={title}
          loading="lazy"
          className="absolute inset-0 h-full w-full object-cover"
        />
      )}
      <div className="absolute inset-0 bg-gradient-to-t from-zinc-950 via-zinc-950/30 to-transparent" />
      <div className="absolute inset-x-0 bottom-0 p-4">
        {subtitle && <span className="text-xs uppercase tracking-wide text-[#c9ff2a]">{subtitle}</span>}
        <h3 className="mt-1 font-semibold leading-snug text-zinc-100">{title}</h3>
      </div>
    </div>
  );
}
