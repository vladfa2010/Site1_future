import { useState } from 'react';

/**
 * Кнопка «уд.» с модальным подтверждением — единый паттерн удаления
 * для всех списков админки. Удаление необратимо, поэтому два клика:
 * «уд.» → модал с подтверждением.
 */
interface Props {
  /** Что удаляем — подставляется в заголовок модала («Удалить {label}?») */
  label: string;
  /** Колбэк удаления: кидает ApiError при неудаче — текст ошибки покажем в модале */
  onDelete: () => Promise<unknown>;
  /** После успешного удаления (закрыть модал и перечитать список) */
  onDeleted?: () => void;
}

export default function ConfirmDelete({ label, onDelete, onDeleted }: Props) {
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const confirm = async () => {
    setBusy(true);
    setError(null);
    try {
      await onDelete();
      setOpen(false);
      onDeleted?.();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Ошибка удаления');
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
      <button
        type="button"
        onClick={() => { setError(null); setOpen(true); }}
        className="text-red-400 hover:text-red-300 hover:underline"
      >
        уд.
      </button>
      {open && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 px-4"
          onClick={() => !busy && setOpen(false)}
        >
          <div className="w-full max-w-md rounded-xl border border-zinc-800 bg-zinc-900 p-5" onClick={(e) => e.stopPropagation()}>
            <h3 className="font-semibold">Удалить {label}?</h3>
            <p className="mt-2 text-sm text-zinc-400">
              Действие необратимо: запись и связанные привязки будут удалены без возможности восстановления.
            </p>
            {error && <p className="toast-inline mt-2 rounded-lg bg-red-500/10 px-3 py-2 text-sm text-red-400">{error}</p>}
            <div className="mt-4 flex justify-end gap-3">
              <button className="btn-secondary" onClick={() => setOpen(false)} disabled={busy}>Отмена</button>
              <button
                className="rounded-lg bg-red-500 px-4 py-2 text-sm font-semibold text-white disabled:opacity-50"
                onClick={() => void confirm()}
                disabled={busy}
              >
                {busy ? 'Удаление…' : 'Удалить'}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
