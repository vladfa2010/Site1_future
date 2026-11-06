import { useEffect, useState } from 'react';

interface Props {
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  debounceMs?: number;
}

/** Поле поиска над списками админки. Дебаунсит ввод, чтобы не дёргать API на каждый символ. */
export default function SearchInput({ value, onChange, placeholder = 'Поиск…', debounceMs = 300 }: Props) {
  const [draft, setDraft] = useState(value);

  useEffect(() => {
    const t = setTimeout(() => onChange(draft.trim()), debounceMs);
    return () => clearTimeout(t);
  }, [draft]); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <div className="relative">
      <svg className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-zinc-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
        <circle cx="11" cy="11" r="7" /><path strokeLinecap="round" d="m20 20-3.5-3.5" />
      </svg>
      <input
        className="input w-72 pl-9"
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        placeholder={placeholder}
      />
      {draft && (
        <button
          className="absolute right-2 top-1/2 -translate-y-1/2 text-zinc-500 hover:text-zinc-300"
          onClick={() => setDraft('')}
          title="Очистить"
        >✕</button>
      )}
    </div>
  );
}

/** Клиентская фильтрация строк: ищет подстроку (case-insensitive) по указанным полям */
export function filterRows<T>(rows: T[], q: string, fields: (keyof T)[]): T[] {
  const needle = q.trim().toLowerCase();
  if (!needle) return rows;
  return rows.filter((r) =>
    fields.some((f) => String(r[f] ?? '').toLowerCase().includes(needle)),
  );
}
