import { Link } from 'react-router';
import { useAuth } from '../auth';
import { useAuthModal } from '../authModal';
import AuthModal from './AuthModal';

// Админка — отдельное приложение (порт 5174 в dev; в проде — тот же origin, путь /admin)
const ADMIN_URL = import.meta.env.VITE_ADMIN_URL ?? 'http://localhost:5174';

export function Layout({ children }: { children: React.ReactNode }) {
  const { user, logout } = useAuth();
  const { open } = useAuthModal();
  const isAdmin = user?.role === 'admin' || user?.role === 'super_admin';

  const onPropose = () => {
    if (!user) {
      open('register', '/propose'); // регистрация, после — обратно на предложение
      return;
    }
    window.location.assign('/propose');
  };
  return (
    <div className="mx-auto flex min-h-screen max-w-5xl flex-col px-4">
      <header className="flex items-center justify-between border-b border-zinc-800 py-4">
        <Link to="/" className="text-lg font-bold text-zinc-100">
          Инвестиционно<span className="text-orange-500">.рф</span>
        </Link>
        <nav className="flex items-center gap-5 text-sm">
          <Link to="/" className="text-zinc-400">Лента</Link>
          <Link to="/portfolio" className="text-zinc-400">Портфель</Link>
          {user ? (
            <span className="flex items-center gap-3">
              {isAdmin && (
                <a href={ADMIN_URL} className="rounded-full border border-orange-500/50 px-3 py-1 text-orange-400 hover:bg-orange-500/10">
                  Админка
                </a>
              )}
              <span className="text-zinc-300">
                {user.displayName ?? user.email}
                {isAdmin && (
                  <span className="ml-2 rounded-full bg-orange-500/15 px-2 py-0.5 text-xs text-orange-400">{user.role === 'super_admin' ? 'супер-админ' : 'админ'}</span>
                )}
              </span>
              <button onClick={logout} className="text-zinc-500 hover:text-zinc-300">Выйти</button>
            </span>
          ) : (
            <button onClick={() => open('login')} className="rounded-full bg-orange-500 px-4 py-1.5 font-semibold text-zinc-950 hover:bg-orange-400">
              Войти
            </button>
          )}
        </nav>
      </header>
      <main className="flex-1 py-8">{children}</main>
      <AuthModal />
      <footer className="border-t border-zinc-800 py-6">
        <div className="flex flex-col items-center gap-3 text-center">
          <button
            onClick={onPropose}
            className="rounded-full border border-orange-500/50 px-6 py-2.5 text-sm font-semibold text-orange-400 transition-colors hover:bg-orange-500 hover:text-zinc-950"
          >
            ✉ Предложить новость или идею
          </button>
          <p className="text-sm text-zinc-500">Инвестиционно про будущее — тренды, идеи и сделки</p>
        </div>
      </footer>
    </div>
  );
}
