import { useEffect, useRef, useState } from 'react';
import { api } from '../api';

export interface EntityOption { id: number; name: string }

interface Props {
  label: string;
  options: EntityOption[];          // полный словарь
  selectedIds: number[];
  onToggle: (id: number) => void;
  onCreated: (option: EntityOption) => void; // после создания на сервере
  createEndpoint: string;           // '/companies' | '/tickers' | ...
  placeholder?: string;
  /** преобразует ввод в тело создания; вернуть null = ввод невалиден */
  buildCreateBody: (raw: string) => Record<string, unknown> | null;
  /** как показать опцию в списке (напр. тикер: символ · компания) */
  renderOption?: (o: EntityOption) => string;
  /** доп. валидация ввода для подсказки (напр. тикер — латиница) */
  validate?: (raw: string) => string | null;
}

/** Транслит в стиле донора (как slugify в редакторе статей) */
export function slugifyRu(s: string): string {
  const map: Record<string, string> = {
    а: 'a', б: 'b', в: 'v', г: 'g', д: 'd', е: 'e', ё: 'e', ж: 'zh', з: 'z', и: 'i', й: 'j',
    к: 'k', л: 'l', м: 'm', н: 'n', о: 'o', п: 'p', р: 'r', с: 's', т: 't', у: 'u', ф: 'f',
    х: 'h', ц: 'c', ч: 'ch', ш: 'sh', щ: 'shh', ъ: '', ы: 'y', ь: '', э: 'e', ю: 'ju', я: 'ja',
  };
  return s.toLowerCase().split('').map((ch) => map[ch] ?? ch).join('')
    .replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 60);
}

/**
 * Облако тегов с автодополнением:
 * - печатаем → дроплист из существующих (клик/Enter — привязать)
 * - точного совпадения нет → Enter создаёт сущность на сервере и привязывает
 */
export default function EntityCloud({
  label, options, selectedIds, onToggle, onCreated, createEndpoint,
  placeholder = 'Начните вводить — подскажем из базы, Enter — создать новое',
  buildCreateBody, renderOption, validate,
}: Props) {
  const [query, setQuery] = useState('');
  const [open, setOpen] = useState(false);
  const [highlight, setHighlight] = useState(0);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const boxRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const q = query.trim().toLowerCase();
  const matches = q
    ? options.filter((o) => o.name.toLowerCase().includes(q)).slice(0, 8)
    : [];
  // уже привязанные показываем в конце списка подсказок пометкой, но не исключаем —
  // пользователь может хотеть перейти к ним; клик по привязанному снимет привязку (как чип)
  const exactExists = q && options.some((o) => o.name.toLowerCase() === q);

  useEffect(() => {
    const onDoc = (e: MouseEvent) => {
      if (boxRef.current && !boxRef.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', onDoc);
    return () => document.removeEventListener('mousedown', onDoc);
  }, []);

  const create = async () => {
    const raw = query.trim();
    if (!raw || busy) return;
    const validationError = validate?.(raw);
    if (validationError) { setError(validationError); return; }
    const body = buildCreateBody(raw);
    if (!body) return;
    setBusy(true);
    setError(null);
    try {
      // у всех create-эндпоинтов ответ содержит сущность с id + name/symbol
      const res = await api<Record<string, { id: number; name?: string; symbol?: string }>>(createEndpoint, {
        method: 'POST',
        body: JSON.stringify(body),
      });
      const entity = Object.values(res)[0];
      const option: EntityOption = { id: entity.id, name: entity.name ?? entity.symbol ?? raw };
      onCreated(option);
      setQuery('');
      setOpen(false);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Ошибка создания');
    } finally {
      setBusy(false);
    }
  };

  const onKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'ArrowDown') { e.preventDefault(); setOpen(true); setHighlight((h) => Math.min(h + 1, matches.length - 1)); }
    else if (e.key === 'ArrowUp') { e.preventDefault(); setHighlight((h) => Math.max(h - 1, 0)); }
    else if (e.key === 'Enter') {
      e.preventDefault();
      if (open && matches[highlight] && !exactExists) {
        onToggle(matches[highlight].id);
        setQuery('');
        setOpen(false);
      } else if (open && matches[highlight] && exactExists) {
        // точное совпадение есть, но подсвечен другой пункт — привязываем подсвеченный
        onToggle(matches[highlight].id);
        setQuery('');
        setOpen(false);
      } else if (!exactExists && q) {
        void create();
      } else if (matches.length > 0) {
        onToggle(matches[0].id);
        setQuery('');
        setOpen(false);
      }
    } else if (e.key === 'Escape') {
      setOpen(false);
    }
  };

  const selected = options.filter((o) => selectedIds.includes(o.id));

  return (
    <div ref={boxRef} className="relative">
      <span className="label">{label}</span>

      {/* Облако: привязанные чипсы */}
      <div className="mb-1.5 flex flex-wrap gap-1.5">
        {selected.map((o) => (
          <button
            key={o.id}
            type="button"
            onClick={() => onToggle(o.id)}
            title="Нажмите, чтобы отвязать"
            className="rounded-full bg-[#beff00]/15 px-2.5 py-1 text-xs text-[#beff00] hover:bg-red-500/15 hover:text-red-400"
          >
            {renderOption ? renderOption(o) : o.name} ✕
          </button>
        ))}
        {selected.length === 0 && <span className="text-xs text-zinc-600">не привязано</span>}
      </div>

      {/* Поле ввода с дроплистом */}
      <div className="relative">
        <input
          ref={inputRef}
          className="input w-full py-1.5 text-sm"
          placeholder={placeholder}
          value={query}
          onChange={(e) => { setQuery(e.target.value); setOpen(true); setHighlight(0); setError(null); }}
          onFocus={() => setOpen(true)}
          onKeyDown={onKeyDown}
        />
        {busy && <span className="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-zinc-500">создаём…</span>}

        {open && q.length > 0 && (
          <div className="absolute z-30 mt-1 w-full overflow-hidden rounded-lg border border-zinc-700 bg-zinc-900 shadow-xl">
            {matches.map((o, i) => {
              const bound = selectedIds.includes(o.id);
              return (
                <button
                  key={o.id}
                  type="button"
                  onMouseEnter={() => setHighlight(i)}
                  onClick={() => { onToggle(o.id); setQuery(''); setOpen(false); inputRef.current?.focus(); }}
                  className={`flex w-full items-center justify-between px-3 py-2 text-left text-sm ${i === highlight ? 'bg-zinc-800' : ''}`}
                >
                  <span className={bound ? 'text-[#beff00]' : 'text-zinc-300'}>
                    {renderOption ? renderOption(o) : o.name}
                  </span>
                  <span className="text-xs text-zinc-600">{bound ? 'привязано ✓' : ''}</span>
                </button>
              );
            })}

            {!exactExists && matches.length > 0 && (
              <div className="border-t border-zinc-800 px-3 py-1.5 text-xs text-zinc-600">
                совпадений: {matches.length}{options.length > 8 ? ` (из ${options.length})` : ''} · Enter — создать «{query.trim()}»
              </div>
            )}
            {matches.length === 0 && (
              <div className="px-3 py-2 text-sm text-zinc-500">
                Не найдено. <span className="text-[#beff00]">Enter — создать «{query.trim()}»</span>
              </div>
            )}
          </div>
        )}
      </div>

      {error && <p className="mt-1 text-xs text-red-400">{error}</p>}
    </div>
  );
}
