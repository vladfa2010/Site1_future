import { Link } from 'react-router';
import { useAuth } from '../auth';
import { useAuthModal } from '../authModal';
import AuthModal from './AuthModal';
import { Avatar } from './Avatar';
import { TrendingTicker } from './TrendingTicker';

export function Layout({ children }: { children: React.ReactNode }) {
  const { user } = useAuth();
  const { open } = useAuthModal();

  const onPropose = () => {
    if (!user) {
      open('register', '/propose'); // регистрация, после — обратно на предложение
      return;
    }
    window.location.assign('/propose');
  };
  return (
    <div className="mx-auto flex min-h-screen max-w-5xl flex-col px-4">
      <header className="flex items-center justify-between border-b border-[#2a2a2a] py-4">
        <Link to="/" className="text-lg font-bold text-zinc-100">
          Инвестиционно<span className="text-[#beff00]">.рф</span>
        </Link>
        <nav className="flex items-center gap-5 text-sm">
          <Link to="/search" title="Поиск" className="text-zinc-400 hover:text-[#beff00]">
            <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <circle cx="11" cy="11" r="7" /><path strokeLinecap="round" d="m20 20-3.5-3.5" />
            </svg>
          </Link>
          <Link to="/feed" className="text-zinc-400">Лента</Link>
          <Link to="/portfolio" className="text-zinc-400">Стартапы</Link>
          <Link to="/pricing" className="text-zinc-400">Тарифы</Link>
          {user ? (
            /* круглый аватар → кабинет («Выйти» живёт там) */
            <Link to="/cabinet" title="Личный кабинет" className="transition-transform hover:scale-105">
              <Avatar avatar={user.avatar} name={user.displayName} size={34} />
            </Link>
          ) : (
            <button onClick={() => open('login')} className="rounded-full bg-[#beff00] px-4 py-1.5 font-semibold text-zinc-950 hover:bg-[#c9ff2a]">
              Войти
            </button>
          )}
        </nav>
      </header>
      <TrendingTicker />
      <main className="flex-1 py-8">{children}</main>
      <AuthModal />
      <footer className="mt-12 border-t border-[#2a2a2a] bg-black">
        {/* CTA — предложить материал */}
        <div className="border-b border-[#2a2a2a] py-8 text-center">
          <button
            onClick={onPropose}
            className="rounded-full bg-[#beff00] px-8 py-3 text-sm font-bold text-black transition-opacity hover:opacity-85"
          >
            ✉ Предложить новость или идею
          </button>
        </div>

        {/* Колонки — как у донора */}
        <div className="mx-auto grid max-w-5xl gap-8 px-4 py-10 sm:grid-cols-2 lg:grid-cols-4">
          <div>
            <h3 className="mb-3 text-sm font-semibold uppercase tracking-wide text-zinc-400">Начни здесь</h3>
            <ul className="space-y-2 text-sm">
              <li><Link to="/o-nas" className="text-zinc-500 hover:text-[#c9ff2a]">О нас</Link></li>
              <li><Link to="/zachem" className="text-zinc-500 hover:text-[#c9ff2a]">Зачем?</Link></li>
              <li><Link to="/smysl" className="text-zinc-500 hover:text-[#c9ff2a]">Смысл?</Link></li>
              <li><Link to="/missiya" className="text-zinc-500 hover:text-[#c9ff2a]">Миссия?</Link></li>
              <li><Link to="/propose" className="text-zinc-500 hover:text-[#c9ff2a]">Предложить материал</Link></li>
            </ul>
          </div>
          <div>
            <h3 className="mb-3 text-sm font-semibold uppercase tracking-wide text-zinc-400">Тренды</h3>
            <ul className="space-y-2 text-sm">
              {[
                ['iskusstvennyj-intellekt', 'Искусственный интеллект'],
                ['roboty', 'Роботы'],
                ['kosmos', 'Космос'],
                ['bespilotnyj-transport', 'Беспилотный транспорт'],
                ['ocifrovka-fizicheskih-aktivov', 'Оцифровка физических активов'],
                ['big-data', 'Big Data'],
              ].map(([slug, name]) => (
                <li key={slug}><Link to={`/trend/${slug}`} className="text-zinc-500 hover:text-[#c9ff2a]">{name}</Link></li>
              ))}
            </ul>
          </div>
          <div>
            <h3 className="mb-3 text-sm font-semibold uppercase tracking-wide text-zinc-400">Компании</h3>
            <ul className="space-y-2 text-sm">
              {[
                ['yandex', 'Яндекс'],
                ['spacex', 'SpaceX'],
                ['tesla', 'Tesla'],
                ['openai', 'OpenAI'],
                ['polymarket', 'Polymarket'],
                ['kalshi', 'Kalshi'],
              ].map(([slug, name]) => (
                <li key={slug}><Link to={`/kompaniya/${slug}`} className="text-zinc-500 hover:text-[#c9ff2a]">{name}</Link></li>
              ))}
            </ul>
          </div>
          <div>
            <h3 className="mb-3 text-sm font-semibold uppercase tracking-wide text-zinc-400">Соцсети</h3>
            <ul className="space-y-2 text-sm">
              <li><a href="https://t.me/insidetraderu" target="_blank" rel="noreferrer" className="text-zinc-500 hover:text-[#c9ff2a]">Telegram</a></li>
              <li><a href="https://vk.com/inside_trade" target="_blank" rel="noreferrer" className="text-zinc-500 hover:text-[#c9ff2a]">VKontakte</a></li>
              <li><a href="https://youtube.com/@insidetraderu" target="_blank" rel="noreferrer" className="text-zinc-500 hover:text-[#c9ff2a]">Youtube</a></li>
              <li><a href="https://dzen.ru/id/5b5ee9d51a66a400a9961a66" target="_blank" rel="noreferrer" className="text-zinc-500 hover:text-[#c9ff2a]">Dzen</a></li>
            </ul>
            <h3 className="mt-6 mb-3 text-sm font-semibold uppercase tracking-wide text-zinc-400">Контакты</h3>
            <a href="mailto:invest@inside-trade.ru" className="text-sm text-zinc-500 hover:text-[#c9ff2a]">invest@inside-trade.ru</a>
          </div>
        </div>

        {/* Legal + дисклеймер — как у донора */}
        <div className="border-t border-[#2a2a2a]">
          <div className="mx-auto flex max-w-5xl flex-wrap items-center justify-between gap-3 px-4 py-5">
            <p className="flex gap-4 text-xs text-zinc-600">
              <Link to="/privacy" className="hover:text-[#c9ff2a]">Политика конфиденциальности</Link>
              <Link to="/terms" className="hover:text-[#c9ff2a]">Публичная оферта</Link>
            </p>
            <p className="text-xs text-zinc-600">Инвестиционно про будущее — тренды, идеи и сделки</p>
          </div>
          <p className="border-t border-[#2a2a2a] py-4 text-center text-xs text-zinc-500">
            Любой материал на сайте не является индивидуальной инвестиционной рекомендацией
          </p>
        </div>
      </footer>
    </div>
  );
}
