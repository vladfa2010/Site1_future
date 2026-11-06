import { NavLink, Link } from 'react-router';
import { useAuth } from '../auth';

// Сайт — отдельное приложение (в dev :5173; в проде — тот же origin)
const SITE_URL = import.meta.env.VITE_SITE_URL ?? 'http://localhost:5173';

const NAV = [
  { to: '/articles', label: 'Статьи' },
  { to: '/stories', label: 'Сюжеты' },
  { to: '/companies', label: 'Компании' },
  { to: '/trends', label: 'Тренды' },
  { to: '/industries', label: 'Индустрии' },
  { to: '/tickers', label: 'Тикеры' },
  { to: '/media', label: 'Медиатека' },
  { to: '/redirects', label: 'Редиректы' },
  { to: '/users', label: 'Пользователи' },
  { to: '/tariffs', label: 'Тарифы' },
  { to: '/features', label: 'Фичи' },
  { to: '/stats', label: 'Аналитика' },
];

export function Layout({ children }: { children: React.ReactNode }) {
  const { user, logout } = useAuth();
  return (
    <div className="flex min-h-screen">
      <aside className="w-56 shrink-0 border-r border-zinc-800 bg-zinc-900">
        <div className="border-b border-zinc-800 px-4 py-4">
          <Link to="/" className="font-bold">Инвестиционно.рф</Link>
          <div className="text-xs text-zinc-500">админка</div>
        </div>
        <nav className="space-y-1 p-3">
          {NAV.map((n) => (
            <NavLink
              key={n.to}
              to={n.to}
              className={({ isActive }) =>
                `block rounded-lg px-3 py-2 text-sm ${isActive ? 'bg-orange-500/10 font-semibold text-orange-400' : 'text-zinc-400 hover:bg-zinc-800'}`
              }
            >
              {n.label}
            </NavLink>
          ))}
        </nav>
      </aside>
      <div className="flex min-w-0 flex-1 flex-col">
        <header className="flex items-center justify-between border-b border-zinc-800 bg-zinc-900 px-6 py-3">
          <a href={SITE_URL} target="_blank" rel="noreferrer" className="text-sm text-zinc-400 hover:text-orange-400">
            ← На сайт
          </a>
          <span className="flex items-center gap-3 text-sm">
            <span className="text-zinc-400">{user?.displayName ?? user?.email}</span>
            <button onClick={logout} className="text-zinc-500 hover:text-zinc-300">Выйти</button>
          </span>
        </header>
        <main className="flex-1 overflow-y-auto p-6">{children}</main>
      </div>
    </div>
  );
}
