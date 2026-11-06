import { Link } from 'react-router';

export function Layout({ children }: { children: React.ReactNode }) {
  return (
    <div className="mx-auto flex min-h-screen max-w-5xl flex-col px-4">
      <header className="flex items-center justify-between border-b border-zinc-800 py-4">
        <Link to="/" className="text-lg font-bold text-zinc-100">
          Инвестиционно<span className="text-orange-500">.рф</span>
        </Link>
        <nav className="flex gap-5 text-sm">
          <Link to="/" className="text-zinc-400">Лента</Link>
          <Link to="/portfolio" className="text-zinc-400">Портфель</Link>
        </nav>
      </header>
      <main className="flex-1 py-8">{children}</main>
      <footer className="border-t border-zinc-800 py-6 text-sm text-zinc-500">
        Инвестиционно про будущее — тренды, идеи и сделки
      </footer>
    </div>
  );
}
