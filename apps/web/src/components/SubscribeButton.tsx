import { Bell } from 'lucide-react';
import { useState } from 'react';
import { useAuth } from '../auth';
import { useAuthModal } from '../authModal';

/**
 * Подписка на сущность (тикер/компания/тренд/индустрию) —
 * материалы по ней попадают в «Мою ленту» кабинета.
 */
export function SubscribeButton({ entityType, entityId, label }: { entityType: string; entityId: number; label?: string }) {
  const { user } = useAuth();
  const { open } = useAuthModal();
  const [subscribed, setSubscribed] = useState<boolean | null>(null);

  // лениво проверяем состояние подписки
  if (subscribed === null && user) {
    void fetch('/api/subscriptions', { headers: { Authorization: `Bearer ${localStorage.getItem('token')}` } })
      .then((r) => (r.ok ? r.json() : Promise.reject()))
      .then((d: { subscriptions: { entityType: string; entityId: number }[] }) =>
        setSubscribed(d.subscriptions.some((s) => s.entityType === entityType && s.entityId === entityId)),
      )
      .catch(() => setSubscribed(false));
  }

  const toggle = async () => {
    if (!user) {
      open('login', window.location.pathname);
      return;
    }
    const next = !subscribed;
    setSubscribed(next);
    const token = localStorage.getItem('token');
    try {
      if (next) {
        // PUT /api/subscriptions (тело) — путь НЕ с path-параметрами
        await fetch('/api/subscriptions', {
          method: 'PUT',
          headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
          body: JSON.stringify({ entityType, entityId }),
        });
      } else {
        await fetch(`/api/subscriptions/${entityType}/${entityId}`, {
          method: 'DELETE',
          headers: { Authorization: `Bearer ${token}` },
        });
      }
    } catch {
      setSubscribed(!next);
    }
  };

  return (
    <button
      type="button"
      onClick={(e) => {
        e.preventDefault();
        void toggle();
      }}
      className={`flex items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-semibold transition-colors ${
        subscribed ? 'bg-[#beff00] text-black' : 'border border-[#2a2a2a] text-zinc-300 hover:border-[#beff00]/50 hover:text-[#c9ff2a]'
      }`}
    >
      <Bell size={13} fill={subscribed ? 'currentColor' : 'none'} />
      {subscribed ? 'Вы подписаны' : (label ?? 'Подписаться')}
    </button>
  );
}
