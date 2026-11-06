import { NavLink, Link } from 'react-router';
import { useAuth } from '../auth';

const NAV = [
  { to: '/articles', label: 'Статьи' },
  { to: '/companies', label: 'Компании' },
  { to: '/trends', label: 'Тренды' },
  { to: '/dictionaries', label: 'Индустрии и тикеры' },
];

export function Layout({ children }: { children: React.ReactNode }) {
  const { user, logout } = useAuth();
  return (
    <div className="flex min-h-screen">
      <aside className="w-56 shrink-0 border-r border-zinc-200 bg-white">
        <div className="border-b border-zinc-200 px-4 py-4">
          <Link to="/" className="font-bold">Инвестиционно.рф</Link>
          <div className="text-xs text-zinc-500">админка</div>
        </div>
        <nav className="space-y-1 p-3">
          {NAV.map((n) => (
            <NavLink
              key={n.to}
              to={n.to}
              className={({ isActive }) =>
                `block rounded-lg px-3 py-2 text-sm ${isActive ? 'bg-orange-50 font-semibold text-orange-600' : 'text-zinc-600 hover:bg-zinc-100'}`
              }
            >
              {n.label}
            </NavLink>
          ))}
        </nav>
      </aside>
      <div className="flex min-w-0 flex-1 flex-col">
        <header className="flex items-center justify-between border-b border-zinc-200 bg-white px-6 py-3">
          <span />
          <span className="flex items-center gap-3 text-sm">
            <span className="text-zinc-600">{user?.displayName ?? user?.email}</span>
            <button onClick={logout} className="text-zinc-400 hover:text-zinc-600">Выйти</button>
          </span>
        </header>
        <main className="flex-1 overflow-y-auto p-6">{children}</main>
      </div>
    </div>
  );
}
