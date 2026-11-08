import { useEffect, useState } from 'react';
import { Link } from 'react-router';
import { useAuth } from '../auth';
import { useAuthModal } from '../authModal';
import { ArticleCard } from '../components/ArticleCard';
import type { ArticleListItem } from '../api';

const authed = () => ({ Authorization: `Bearer ${localStorage.getItem('token')}` });

/** Персональная лента: материалы по подпискам (тикеры, компании, тренды, индустрии, идеи) */
export default function FeedPage() {
  const { user } = useAuth();
  const { open } = useAuthModal();
  const [data, setData] = useState<{ articles: ArticleListItem[]; hint?: string } | null>(null);

  useEffect(() => {
    if (!user) return;
    void fetch('/api/feed', { headers: authed() })
      .then((r) => (r.ok ? r.json() : Promise.reject()))
      .then(setData)
      .catch(() => setData({ articles: [] }));
  }, [user]);

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold">Моя лента</h1>

      {!user && (
        <div className="card space-y-3 p-6 text-center">
          <p className="text-zinc-400">
            Лента — это персональная подборка материалов по вашим подпискам: тикерам, компаниям, трендам и идеям.
          </p>
          <button
            onClick={() => open('login', '/feed')}
            className="rounded-full bg-[#beff00] px-6 py-2 font-semibold text-zinc-950 hover:bg-[#c9ff2a]"
          >
            Войти, чтобы открыть ленту
          </button>
        </div>
      )}

      {user && !data && <p className="text-zinc-400">Загрузка…</p>}

      {user && data?.hint === 'empty_subscriptions' && (
        <p className="text-zinc-500">
          Лента пуста — вы ни на что не подписаны. Откройте{' '}
          <Link to="/portfolio" className="text-[#c9ff2a]">скринер</Link>, тренд или карточку
          компании и нажмите «Подписаться» — новые материалы по вашим тикерам, компаниям и трендам будут собираться здесь.
        </p>
      )}

      {user && data && data.articles.length === 0 && data.hint !== 'empty_subscriptions' && (
        <p className="text-zinc-500">По вашим подпискам пока нет новых материалов.</p>
      )}

      {user && data && data.articles.length > 0 && (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {data.articles.map((a) => <ArticleCard key={a.id} article={a} />)}
        </div>
      )}
    </div>
  );
}
