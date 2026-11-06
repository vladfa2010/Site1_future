/**
 * Аватар: пресет из 10 иконок (эмодзи на градиенте) — без загрузки картинок.
 * Храним в users.avatar эмодзи; фон — по индексу в пресете.
 */
export const AVATAR_PRESET: { emoji: string; bg: string }[] = [
  { emoji: '🚀', bg: 'linear-gradient(135deg,#f97316,#be123c)' },
  { emoji: '🤖', bg: 'linear-gradient(135deg,#06b6d4,#3b82f6)' },
  { emoji: '🧠', bg: 'linear-gradient(135deg,#a855f7,#6d28d9)' },
  { emoji: '🛰️', bg: 'linear-gradient(135deg,#64748b,#0f172a)' },
  { emoji: '⚡', bg: 'linear-gradient(135deg,#eab308,#ca8a04)' },
  { emoji: '🦅', bg: 'linear-gradient(135deg,#0ea5e9,#1e40af)' },
  { emoji: '🐂', bg: 'linear-gradient(135deg,#22c55e,#15803d)' },
  { emoji: '🌌', bg: 'linear-gradient(135deg,#6366f1,#312e81)' },
  { emoji: '💎', bg: 'linear-gradient(135deg,#14b8a6,#0f766e)' },
  { emoji: '🔬', bg: 'linear-gradient(135deg,#ec4899,#9d174d)' },
];

export function avatarBg(emoji: string | null | undefined): string {
  const found = AVATAR_PRESET.find((a) => a.emoji === emoji);
  return found?.bg ?? 'linear-gradient(135deg,#3f3f46,#18181b)';
}

export function Avatar({ avatar, name, size = 32 }: { avatar?: string | null; name?: string | null; size?: number }) {
  return (
    <span
      className="inline-flex shrink-0 items-center justify-center rounded-full"
      style={{
        width: size,
        height: size,
        background: avatarBg(avatar),
        fontSize: size * 0.55,
        lineHeight: 1,
      }}
      title={name ?? ''}
    >
      {avatar ?? (name ? name.slice(0, 1).toUpperCase() : '👤')}
    </span>
  );
}
