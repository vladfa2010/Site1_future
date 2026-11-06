import { Lock } from 'lucide-react';
import { Link } from 'react-router';
import { useAuth } from '../auth';
import { useAuthModal } from '../authModal';

/**
 * Пейволл-экран: материал требует входа или тарифа.
 * API отдаёт 403 {access: 'auth'|'tariff'}.
 */
export function Paywall({ access, title }: { access: 'auth' | 'tariff'; title: string }) {
  const { user } = useAuth();
  const { open } = useAuthModal();

  return (
    <div className="mx-auto max-w-md py-10 text-center">
      <Lock size={40} className="mx-auto text-[#beff00]" />
      <h1 className="mt-4 text-2xl font-bold">{title}</h1>
      {access === 'auth' ? (
        <>
          <p className="mt-3 text-zinc-400">Этот материал доступен только зарегистрированным пользователям.</p>
          <button
            onClick={() => open('login', window.location.pathname)}
            className="mt-6 rounded-full bg-[#beff00] px-6 py-2.5 font-semibold text-black hover:opacity-85"
          >
            Войти или зарегистрироваться
          </button>
        </>
      ) : (
        <>
          <p className="mt-3 text-zinc-400">
            Этот материал — для участников {user ? 'закрытого тарифа' : 'закрытого тарифа. Войдите, чтобы проверить доступ'}.
          </p>
          {user ? (
            <Link to="/cabinet" className="mt-6 inline-block rounded-full bg-[#beff00] px-6 py-2.5 font-semibold text-black hover:opacity-85">
              Мой тариф
            </Link>
          ) : (
            <button
              onClick={() => open('login', window.location.pathname)}
              className="mt-6 rounded-full bg-[#beff00] px-6 py-2.5 font-semibold text-black hover:opacity-85"
            >
              Войти
            </button>
          )}
        </>
      )}
    </div>
  );
}
