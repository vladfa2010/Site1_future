import { useEffect, useRef, useState } from 'react';
import { useAuth } from '../auth';
import { useAuthModal } from '../authModal';

/**
 * Виджет подключения Telegram-бота (механика как в PULSE, deep-link вариант):
 * кнопка → deep-link t.me/<bot>?start=<code> → юзер жмёт Start →
 * фронт поллит /api/telegram/status, пока не connected (таймаут 2 мин).
 * Показываем залогиненным и неподключённым; без TG_BOT_TOKEN сервер вернёт enabled:false.
 */
const POLL_MS = 5000;
const TIMEOUT_MS = 2 * 60_000;

interface TgStatus { connected: boolean; chatId: string | null; tgUsername: string | null; enabled?: boolean }

const authed = () => ({ Authorization: `Bearer ${localStorage.getItem('token')}` });

export function useTelegramStatus() {
  const { user } = useAuth();
  const [status, setStatus] = useState<TgStatus | null>(null);

  const refresh = () => {
    if (!user) return;
    void fetch('/api/telegram/status', { headers: authed() })
      .then((r) => (r.ok ? r.json() : Promise.reject()))
      .then((s: TgStatus) => setStatus({ ...s, enabled: s.enabled ?? true }))
      .catch(() => setStatus({ connected: false, chatId: null, tgUsername: null, enabled: true }));
  };

  useEffect(refresh, [user]); // eslint-disable-line react-hooks/exhaustive-deps
  return { status, refresh };
}

export function TelegramConnect({ compact = false }: { compact?: boolean }) {
  const { user } = useAuth();
  const { open } = useAuthModal();
  const { status, refresh } = useTelegramStatus();
  const [connecting, setConnecting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => () => {
    if (timerRef.current) clearInterval(timerRef.current);
    if (timeoutRef.current) clearTimeout(timeoutRef.current);
  }, []);

  if (!user) return null;
  if (status && (status.connected || status.enabled === false)) return null;

  const connect = async () => {
    setError(null);
    setConnecting(true);
    try {
      const r = await fetch('/api/telegram/link', { method: 'POST', headers: { ...authed(), 'Content-Type': 'application/json' } });
      const data = (await r.json()) as { deepLink?: string; error?: string };
      if (!r.ok || !data.deepLink) throw new Error(data.error ?? 'Не удалось получить ссылку');
      window.open(data.deepLink, '_blank');
      // поллим статус, пока бот не привяжет
      timerRef.current = setInterval(refresh, POLL_MS);
      timeoutRef.current = setTimeout(() => {
        if (timerRef.current) clearInterval(timerRef.current);
        setConnecting(false);
        setError('Таймаут подключения. Откройте бота и нажмите Start, затем обновите страницу.');
      }, TIMEOUT_MS);
    } catch (e) {
      setConnecting(false);
      setError(e instanceof Error ? e.message : 'Ошибка подключения');
    }
  };

  useEffect(() => {
    if (status?.connected && timerRef.current) {
      clearInterval(timerRef.current);
      setConnecting(false);
    }
  }, [status?.connected]);

  if (compact) {
    return (
      <div className="rounded-lg border border-[#2a2a2a] bg-[#191919] p-4">
        <h3 className="text-sm font-semibold">Telegram-бот</h3>
        <p className="mt-1 text-xs text-zinc-500">Дайджесты по подпискам — прямо в мессенджере.</p>
        {error && <p className="mt-2 text-xs text-red-400">{error}</p>}
        <button onClick={() => void connect()} disabled={connecting} className="mt-3 rounded-full bg-[#229ED9] px-4 py-2 text-xs font-bold text-white hover:opacity-90 disabled:opacity-50">
          {connecting ? 'Ожидаем подтверждения…' : 'Подключить бота'}
        </button>
      </div>
    );
  }

  return (
    <section className="rounded-2xl border border-[#229ED9]/25 bg-[#191919] p-6">
      <div className="flex flex-col items-start gap-5 sm:flex-row sm:items-center">
        <div className="flex h-14 w-14 shrink-0 items-center justify-center rounded-2xl bg-[#229ED9]/15">
          <svg viewBox="0 0 24 24" fill="#229ED9" className="h-7 w-7"><path d="M11.944 0A12 12 0 0 0 0 12a12 12 0 0 0 12 12 12 12 0 0 0 12-12A12 12 0 0 0 12 0a12 12 0 0 0-.056 0zm4.962 7.224c.1-.002.321.023.465.14a.506.506 0 0 1 .171.325c.016.093.036.306.02.472-.18 1.898-.962 6.502-1.36 8.627-.168.9-.499 1.201-.82 1.23-.696.065-1.225-.46-1.9-.902-1.056-.693-1.653-1.124-2.678-1.8-1.185-.78-.417-1.21.258-1.91.177-.184 3.247-2.977 3.307-3.23.007-.032.014-.15-.056-.212s-.174-.041-.249-.024c-.106.024-1.793 1.14-5.061 3.345-.48.33-.913.49-1.302.48-.428-.008-1.252-.241-1.865-.44-.752-.245-1.349-.374-1.297-.789.027-.216.325-.437.893-.663 3.498-1.524 5.83-2.529 6.998-3.014 3.332-1.386 4.025-1.627 4.476-1.635z" /></svg>
        </div>
        <div className="min-w-0 flex-1">
          <h3 className="text-lg font-bold">Дайджесты в Telegram</h3>
          <p className="mt-1 text-sm text-zinc-400">
            Подборка дня и итоги недели по вашим подпискам — в личке бота. Одно нажатие «Start» — и готово.
          </p>
          {error && <p className="mt-2 text-sm text-red-400">{error}</p>}
        </div>
        <button
          onClick={() => (user ? void connect() : open('login', '/'))}
          disabled={connecting}
          className="shrink-0 rounded-full bg-[#229ED9] px-6 py-2.5 text-sm font-bold text-white transition-opacity hover:opacity-90 disabled:opacity-50"
        >
          {connecting ? 'Ожидаем подтверждения…' : 'Подключить бота'}
        </button>
      </div>
    </section>
  );
}

export { TelegramConnect as TelegramConnectBanner };
