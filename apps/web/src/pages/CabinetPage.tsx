import { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router';
import { useAuth } from '../auth';
import { useAuthModal } from '../authModal';
import { Breadcrumbs } from '../components/Breadcrumbs';
import { ArticleCard } from '../components/ArticleCard';
import { useFavorites } from '../favorites';
import { TelegramConnect } from '../components/TelegramConnect';
import { Avatar, AVATAR_PRESET } from '../components/Avatar';
import type { ArticleListItem } from '../api';

type Tab = 'profile' | 'favorites' | 'feed' | 'subscriptions' | 'tariff' | 'notifications' | 'danger';
const TABS: { id: Tab; label: string }[] = [
  { id: 'profile', label: 'Профиль' }, // ТЗ-05: первый и открытый по умолчанию
  { id: 'favorites', label: 'Избранное' },
  { id: 'feed', label: 'Моя лента' },
  { id: 'subscriptions', label: 'Подписки' },
  { id: 'notifications', label: 'Уведомления' },
  { id: 'tariff', label: 'Тариф' },
  { id: 'danger', label: 'Опасная зона' },
];

const authed = () => ({ Authorization: `Bearer ${localStorage.getItem('token')}`, 'Content-Type': 'application/json' });

interface FavoriteRow {
  entityType: string;
  entityId: number;
  createdAt: string;
  data: Record<string, unknown> & { id: number };
}

export default function CabinetPage() {
  const { user, logout } = useAuth();
  const { open } = useAuthModal();
  const [tab, setTab] = useState<Tab>('profile');
  const [avatarEdit, setAvatarEdit] = useState(false);
  const isAdmin = user?.role === 'admin' || user?.role === 'super_admin';
  const ADMIN_URL = import.meta.env.VITE_ADMIN_URL ?? 'http://localhost:5174';

  if (!user) {
    return (
      <div className="mx-auto max-w-md py-10 text-center">
        <h1 className="text-2xl font-bold">Личный кабинет</h1>
        <p className="mt-3 text-zinc-400">Войдите, чтобы видеть избранное, подписки и персональную ленту.</p>
        <button onClick={() => open('login', '/cabinet')} className="mt-6 rounded-full bg-[#beff00] px-6 py-2.5 font-semibold text-black hover:opacity-85">
          Войти
        </button>
      </div>
    );
  }

  return (
    <div>
      <Breadcrumbs items={[{ label: 'Личный кабинет' }]} />

      {/* Профиль: аватар (edit → модал выбора), имя, выход */}
      <header className="flex items-center gap-4">
        <button
          type="button"
          onClick={() => setAvatarEdit(true)}
          title="Сменить иконку профиля"
          className="group relative shrink-0 rounded-full"
        >
          <Avatar avatar={user.avatar} name={user.displayName} size={64} />
          <span className="absolute inset-0 flex items-center justify-center rounded-full bg-black/60 text-[10px] font-semibold uppercase tracking-wide text-white opacity-0 transition-opacity group-hover:opacity-100">
            edit
          </span>
        </button>
        <div className="min-w-0 flex-1">
          <h1 className="truncate text-2xl font-bold">{user.displayName ?? user.email}</h1>
          <p className="text-sm text-zinc-500">{user.email}</p>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          {isAdmin && (
            <a
              href={`${ADMIN_URL}/?auth=${localStorage.getItem('token') ?? ''}`}
              className="rounded-full border border-[#beff00]/50 px-4 py-2 text-sm text-[#c9ff2a] hover:bg-[#beff00]/10"
            >
              Админка
            </a>
          )}
          <button onClick={logout} className="rounded-full border border-[#2a2a2a] px-4 py-2 text-sm text-zinc-400 hover:border-red-500/50 hover:text-red-400">
            Выйти
          </button>
        </div>
      </header>

      <div className="mt-6 flex flex-wrap gap-2 border-b border-[#2a2a2a] pb-4">
        {TABS.map((t) => (
          <button
            key={t.id}
            onClick={() => setTab(t.id)}
            className={
              t.id === 'danger'
                ? `rounded-full px-4 py-1.5 text-sm font-semibold ${
                    tab === t.id
                      ? 'bg-red-500/90 text-white'
                      : 'bg-[#191919] text-red-400/80 hover:bg-red-500/10 hover:text-red-400'
                  }`
                : `rounded-full px-4 py-1.5 text-sm font-semibold ${
                    tab === t.id ? 'bg-[#beff00] text-black' : 'bg-[#191919] text-zinc-400 hover:text-zinc-200'
                  }`
            }
          >
            {t.label}
          </button>
        ))}
      </div>

      <div className="mt-6">
        {tab === 'profile' && <ProfileTab />}
        {tab === 'favorites' && <FavoritesTab />}
        {tab === 'feed' && <FeedTab />}
        {tab === 'subscriptions' && <SubscriptionsTab />}
        {tab === 'notifications' && <NotificationsTab />}
        {tab === 'tariff' && <TariffTab />}
        {tab === 'danger' && <DeleteAccountBlock />}
      </div>

      {avatarEdit && (
        <AvatarPickerModal current={user.avatar} onClose={() => setAvatarEdit(false)} />
      )}
    </div>
  );
}

/* ---------- Модал выбора иконки профиля ---------- */
function AvatarPickerModal({ current, onClose }: { current?: string | null; onClose: () => void }) {
  const { refresh } = useAuth();
  const [selected, setSelected] = useState(current ?? null);

  const pick = async (emoji: string) => {
    setSelected(emoji);
    await fetch('/api/avatar', { method: 'PUT', headers: authed(), body: JSON.stringify({ avatar: emoji }) });
    refresh();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-zinc-950/80 p-4 backdrop-blur-sm" onClick={onClose}>
      <div
        className="w-full max-w-sm rounded-xl border border-zinc-700 bg-zinc-900 p-5 shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mb-4 flex items-center justify-between">
          <h2 className="font-semibold">Иконка профиля</h2>
          <button onClick={onClose} className="rounded-lg bg-zinc-800 px-3 py-1 text-sm text-zinc-300 hover:bg-zinc-700">✕</button>
        </div>
        <div className="grid grid-cols-5 gap-3">
          {AVATAR_PRESET.map((a) => (
            <button
              key={a.emoji}
              type="button"
              onClick={() => void pick(a.emoji)}
              title="Выбрать иконку"
              className={`flex h-14 w-14 items-center justify-center rounded-full text-2xl transition-transform ${
                selected === a.emoji ? 'ring-2 ring-[#beff00] ring-offset-2 ring-offset-zinc-900' : 'opacity-75 hover:scale-110 hover:opacity-100'
              }`}
              style={{ background: a.bg }}
            >
              {a.emoji}
            </button>
          ))}
        </div>
        <p className="mt-4 text-center text-xs text-zinc-500">Клик — сразу сохраняется</p>
      </div>
    </div>
  );
}

/* ---------- Удаление аккаунта ---------- */
function DeleteAccountBlock() {
  const { logout } = useAuth();
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const destroy = async () => {
    setBusy(true);
    setError(null);
    try {
      const r = await fetch('/api/auth/me', {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${localStorage.getItem('token')}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ password }),
      });
      if (!r.ok) {
        const body = await r.json().catch(() => ({}));
        throw new Error(body.error ?? 'Ошибка удаления');
      }
      logout();
      navigate('/', { replace: true });
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Ошибка удаления');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="mt-12 rounded-lg border border-red-500/30 bg-red-500/5 p-5">
      <h2 className="text-sm font-semibold uppercase tracking-wide text-red-400">Опасная зона</h2>
      {!open ? (
        <div className="mt-3 flex items-center justify-between gap-4">
          <p className="text-sm text-zinc-400">
            Удаление аккаунта необратимо: профиль, избранное и подписки будут удалены. Опубликованные материалы останутся на сайте.
          </p>
          <button onClick={() => setOpen(true)} className="shrink-0 rounded-full border border-red-500/50 px-4 py-2 text-sm font-semibold text-red-400 hover:bg-red-500/10">
            Удалить аккаунт
          </button>
        </div>
      ) : (
        <div className="mt-3 space-y-3">
          <p className="text-sm text-zinc-300">Введите пароль для подтверждения удаления аккаунта:</p>
          <input
            type="password"
            className="input max-w-xs"
            placeholder="Пароль"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            autoFocus
          />
          {error && <p className="text-sm text-red-400">{error}</p>}
          <div className="flex gap-3">
            <button onClick={() => void destroy()} disabled={busy || !password} className="rounded-full bg-red-500 px-5 py-2 text-sm font-bold text-black hover:opacity-85 disabled:opacity-50">
              {busy ? 'Удаляем…' : 'Удалить навсегда'}
            </button>
            <button onClick={() => { setOpen(false); setPassword(''); setError(null); }} className="rounded-full border border-[#2a2a2a] px-5 py-2 text-sm text-zinc-400 hover:text-zinc-200">
              Отмена
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

/* ---------- Профиль: «о себе» (bio) + превью публичной страницы (ТЗ-05) ---------- */
function ProfileTab() {
  const { user, refresh } = useAuth();
  const [bio, setBio] = useState(user?.bio ?? '');
  const [notice, setNotice] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  // считаем по trim()'нутому значению — серверная zod-валидация тоже trim (ревью v2.1 №7)
  const trimmed = bio.trim();
  const over = trimmed.length > 500;
  const unchanged = trimmed === (user?.bio ?? '').trim();

  const save = async () => {
    setBusy(true);
    setNotice(null);
    try {
      const r = await fetch('/api/auth/me', {
        method: 'PATCH',
        headers: authed(),
        body: JSON.stringify({ bio: trimmed }),
      });
      if (!r.ok) throw new Error('Не сохранилось — проверьте текст');
      await refresh(); // bio подтягивается в контекст (паттерн AvatarPickerModal)
      setNotice('Сохранено ✓');
      setTimeout(() => setNotice(null), 2000);
    } catch (err) {
      setNotice(err instanceof Error ? err.message : 'Ошибка сохранения');
    } finally {
      setBusy(false);
    }
  };

  const name = user?.displayName ?? 'Автор';
  const previewBio = trimmed.length > 160 ? `${trimmed.slice(0, 160)}…` : trimmed;

  return (
    <div className="max-w-lg space-y-6">
      <div>
        <label htmlFor="cabinet-bio" className="mb-2 block text-sm font-semibold">
          О себе
        </label>
        <textarea
          id="cabinet-bio"
          value={bio}
          onChange={(e) => setBio(e.target.value)}
          maxLength={500}
          rows={5}
          placeholder="Пара слов о себе — это увидят читатели под вашими материалами"
          className="w-full rounded-lg border border-[#2a2a2a] bg-[#191919] p-3 text-sm text-zinc-200 outline-none focus:border-[#beff00]/60"
        />
        <div className="mt-1 flex items-center justify-between text-xs">
          <span className="text-zinc-600">До 500 символов, пустое = не показываем</span>
          {/* переполнение — красным (ревью v2.1 №7) */}
          <span className={over ? 'font-semibold text-red-400' : 'text-zinc-600'}>
            {trimmed.length}/500
          </span>
        </div>
        {notice && <p className="mt-2 text-sm text-[#c9ff2a]">{notice}</p>}
        <button
          onClick={() => void save()}
          disabled={busy || over || unchanged}
          className="mt-3 rounded-full bg-[#beff00] px-6 py-2 text-sm font-bold text-black hover:opacity-85 disabled:opacity-40"
        >
          {busy ? 'Сохраняем…' : 'Сохранить'}
        </button>
      </div>

      {/* Превью: как автор выглядит публично (ревью v2.1 №1 — страница появится только после первой публикации) */}
      <div className="rounded-xl border border-[#2a2a2a] bg-[#191919] p-5">
        <p className="text-xs font-semibold uppercase tracking-wide text-zinc-500">
          Как это будет выглядеть
        </p>
        <p className="mt-1 text-xs text-zinc-600">
          Ваша публичная страница появится после первой публикации материала.
        </p>
        <div className="mt-4 flex items-start gap-4">
          <Avatar avatar={user?.avatar} name={name} size={48} />
          <div className="min-w-0">
            <p className="font-semibold">{name}</p>
            {previewBio && <p className="mt-1 text-sm text-zinc-400">{previewBio}</p>}
          </div>
        </div>
      </div>
    </div>
  );
}

/* ---------- Избранное ---------- */
function FavoritesTab() {
  const { keys } = useFavorites();
  const [rows, setRows] = useState<FavoriteRow[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    setLoading(true);
    void fetch('/api/favorites', { headers: authed() })
      .then((r) => (r.ok ? r.json() : Promise.reject()))
      .then((d: { favorites: FavoriteRow[] }) => setRows(d.favorites))
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [keys]);

  const articles = rows.filter((r) => r.entityType === 'article') as unknown as { entityId: number; data: ArticleListItem }[];
  const companies = rows.filter((r) => r.entityType === 'company') as unknown as { entityId: number; data: { slug: string; name: string; oneLiner: string | null } }[];
  const trends = rows.filter((r) => r.entityType === 'trend') as unknown as { entityId: number; data: { slug: string; name: string } }[];
  const stories = rows.filter((r) => r.entityType === 'story') as unknown as { entityId: number; data: { slug: string; name: string } }[];

  if (loading) return <p className="text-zinc-400">Загрузка…</p>;
  if (rows.length === 0) {
    return <p className="text-zinc-500">Пока пусто. Нажимайте 🔖 на карточках статей, трендов и компаний — всё соберётся здесь.</p>;
  }

  return (
    <div className="space-y-8">
      {articles.length > 0 && (
        <section>
          <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-zinc-500">Статьи ({articles.length})</h2>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {articles.map((a) => <ArticleCard key={a.entityId} article={a.data} />)}
          </div>
        </section>
      )}
      {companies.length > 0 && (
        <section>
          <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-zinc-500">Компании ({companies.length})</h2>
          <div className="flex flex-wrap gap-2">
            {companies.map((c) => (
              <Link key={c.entityId} to={`/kompaniya/${c.data.slug}`} className="rounded-full border border-[#2a2a2a] bg-[#191919] px-4 py-2 text-sm hover:border-[#beff00]/50">
                🏢 {c.data.name}
              </Link>
            ))}
          </div>
        </section>
      )}
      {trends.length > 0 && (
        <section>
          <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-zinc-500">Тренды ({trends.length})</h2>
          <div className="flex flex-wrap gap-2">
            {trends.map((t) => (
              <Link key={t.entityId} to={`/trend/${t.data.slug}`} className="rounded-full border border-[#2a2a2a] bg-[#191919] px-4 py-2 text-sm hover:border-[#beff00]/50">
                📈 {t.data.name}
              </Link>
            ))}
          </div>
        </section>
      )}
      {stories.length > 0 && (
        <section>
          <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-zinc-500">Сюжеты ({stories.length})</h2>
          <div className="flex flex-wrap gap-2">
            {stories.map((s) => (
              <Link key={s.entityId} to={`/syuzhet/${s.data.slug}`} className="rounded-full border border-[#2a2a2a] bg-[#191919] px-4 py-2 text-sm hover:border-[#beff00]/50">
                ⭐ {s.data.name}
              </Link>
            ))}
          </div>
        </section>
      )}
    </div>
  );
}

/* ---------- Моя лента ---------- */
function FeedTab() {
  const [data, setData] = useState<{ articles: ArticleListItem[]; hint?: string } | null>(null);

  useEffect(() => {
    void fetch('/api/feed', { headers: authed() })
      .then((r) => (r.ok ? r.json() : Promise.reject()))
      .then(setData)
      .catch(() => setData({ articles: [] }));
  }, []);

  if (!data) return <p className="text-zinc-400">Загрузка…</p>;
  if (data.hint === 'empty_subscriptions') {
    return (
      <p className="text-zinc-500">
        Лента пуста — вы ни на что не подписаны. Откройте <Link to="/portfolio" className="text-[#c9ff2a]">скринер</Link>, тренд или карточку
        компании и нажмите «Подписаться» — новые материалы по вашим тикерам, компаниям и трендам будут собираться здесь.
      </p>
    );
  }
  if (data.articles.length === 0) return <p className="text-zinc-500">По вашим подпискам пока нет новых материалов.</p>;
  return (
    <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
      {data.articles.map((a) => <ArticleCard key={a.id} article={a} />)}
    </div>
  );
}

/* ---------- Подписки ---------- */
interface SubRow {
  entityType: string;
  entityId: number;
  data: { title?: string; name?: string; symbol?: string; slug?: string; type?: string } | null;
}

function SubscriptionsTab() {
  const [subs, setSubs] = useState<SubRow[]>([]);
  const [loading, setLoading] = useState(true);

  const load = () => {
    void fetch('/api/subscriptions', { headers: authed() })
      .then((r) => (r.ok ? r.json() : Promise.reject()))
      .then((d: { subscriptions: SubRow[] }) => setSubs(d.subscriptions))
      .catch(() => {})
      .finally(() => setLoading(false));
  };
  useEffect(load, []);

  const remove = async (s: SubRow) => {
    await fetch(`/api/subscriptions/${s.entityType}/${s.entityId}`, { method: 'DELETE', headers: authed() });
    setSubs((prev) => prev.filter((x) => !(x.entityType === s.entityType && x.entityId === s.entityId)));
  };

  const name = (s: SubRow) =>
    s.data?.title ?? s.data?.name ?? s.data?.symbol ?? `${s.entityType} #${s.entityId}`;
  const href = (s: SubRow) =>
    s.entityType === 'article' && s.data?.type && s.data?.slug ? `/${s.data.type}/${s.data.slug}`
    : s.data?.slug ? `/${s.entityType === 'company' ? 'kompaniya' : s.entityType}/${s.data.slug}`
    : null;

  const LABELS: Record<string, string> = { ticker: 'Тикер', company: 'Компания', trend: 'Тренд', industry: 'Индустрия', article: 'Идея' };
  const ICONS: Record<string, string> = { ticker: '💹', company: '🏢', trend: '📈', industry: '🏭', article: '💡' };
  if (loading) return <p className="text-zinc-400">Загрузка…</p>;
  if (subs.length === 0) return <p className="text-zinc-500">Нет подписок. Подписывайтесь на компании, тренды, тикеры, индустрии и идеи — их материалы попадут в «Мою ленту».</p>;

  return (
    <ul className="space-y-2">
      {subs.map((s) => {
        const link = href(s);
        return (
          <li key={`${s.entityType}:${s.entityId}`} className="flex items-center justify-between rounded-lg border border-[#2a2a2a] bg-[#191919] px-4 py-2.5 text-sm">
            <span>
              <span className="mr-2">{ICONS[s.entityType] ?? '•'}</span>
              {link ? (
                <Link to={link} className="font-medium hover:text-[#c9ff2a]">{name(s)}</Link>
              ) : (
                <span className="font-medium">{name(s)}</span>
              )}
              <span className="ml-2 text-xs text-zinc-600">{LABELS[s.entityType]}</span>
            </span>
            <button onClick={() => void remove(s)} className="text-zinc-500 hover:text-red-400">отписаться</button>
          </li>
        );
      })}
    </ul>
  );
}

/* ---------- Уведомления ---------- */
function NotificationsTab() {
  const [settings, setSettings] = useState<{ emailDaily: boolean; emailWeekly: boolean } | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [tg, setTg] = useState<{ connected: boolean; tgUsername: string | null; enabled: boolean } | null>(null);

  const loadTg = () => {
    void fetch('/api/telegram/status', { headers: authed() })
      .then((r) => (r.ok ? r.json() : Promise.reject()))
      .then((d) => setTg({ connected: d.connected, tgUsername: d.tgUsername, enabled: d.enabled !== false }))
      .catch(() => {});
  };

  useEffect(() => {
    void fetch('/api/notification-settings', { headers: authed() })
      .then((r) => (r.ok ? r.json() : Promise.reject()))
      .then((d: { settings: { emailDaily: boolean; emailWeekly: boolean } }) => setSettings(d.settings))
      .catch(() => {});
    loadTg();
  }, []);

  const disconnectTg = async () => {
    await fetch('/api/telegram/disconnect', { method: 'DELETE', headers: authed() });
    loadTg();
  };

  const save = async (patch: Partial<{ emailDaily: boolean; emailWeekly: boolean }>) => {
    const next = { emailDaily: settings?.emailDaily ?? true, emailWeekly: settings?.emailWeekly ?? true, ...patch };
    setSettings(next);
    await fetch('/api/notification-settings', { method: 'PUT', headers: authed(), body: JSON.stringify(next) });
    setNotice('Сохранено ✓');
    setTimeout(() => setNotice(null), 2000);
  };

  if (!settings) return <p className="text-zinc-400">Загрузка…</p>;

  const rows = [
    { key: 'emailDaily' as const, title: 'Подборка дня', desc: 'Каждый вечер в 20:00 — материалы по вашим подпискам за день' },
    { key: 'emailWeekly' as const, title: 'Недельный репорт', desc: 'Итоги недели: сводка, топ материалов, что вышло по подпискам' },
  ];

  return (
    <div className="max-w-lg space-y-3">
      {notice && <p className="text-sm text-[#c9ff2a]">{notice}</p>}
      {rows.map((r) => (
        <label key={r.key} className="flex cursor-pointer items-start justify-between gap-4 rounded-lg border border-[#2a2a2a] bg-[#191919] p-4">
          <span>
            <span className="block text-sm font-semibold">{r.title}</span>
            <span className="mt-1 block text-xs text-zinc-500">{r.desc}</span>
          </span>
          <button
            type="button"
            role="switch"
            aria-checked={settings[r.key]}
            onClick={() => void save({ [r.key]: !settings[r.key] })}
            className={`mt-0.5 h-6 w-11 shrink-0 rounded-full transition-colors ${settings[r.key] ? 'bg-[#beff00]' : 'bg-zinc-700'}`}
          >
            <span className={`block h-5 w-5 rounded-full bg-black transition-transform ${settings[r.key] ? 'translate-x-5' : 'translate-x-0.5'}`} />
          </button>
        </label>
      ))}
      <p className="text-xs text-zinc-600">
        Письма отправляются на <span className="text-zinc-400">ваш email регистрации</span>. Web-push — следующим каналом.
      </p>

      {/* Telegram-контур */}
      {tg && tg.enabled && (
        tg.connected ? (
          <div className="flex items-center justify-between rounded-lg border border-[#229ED9]/30 bg-[#191919] p-4">
            <p className="text-sm">
              <span className="font-semibold text-[#229ED9]">Telegram подключён</span>
              {tg.tgUsername && <span className="text-zinc-500"> @{tg.tgUsername}</span>}
              <span className="block text-xs text-zinc-500">Дайджесты приходят в личку бота. Отключиться можно командой /stop.</span>
            </p>
            <button onClick={() => void disconnectTg()} className="text-sm text-zinc-500 hover:text-red-400">отключить</button>
          </div>
        ) : (
          <TelegramConnect compact />
        )
      )}
    </div>
  );
}

/* ---------- Тариф: планы из БД (модель PULSE) ---------- */
interface Plan {
  id: number;
  slug: string;
  name: string;
  description: string | null;
  priceMonthly: string;
  priceYearly: string;
  yearlyDiscount: number;
  features: Record<string, unknown>;
  isActive: boolean;
  comingSoonLabel: string | null;
}

interface RegistryFeature { id: string; label: string; isActive: boolean }

function TariffTab() {
  const { user } = useAuth();
  const [plans, setPlans] = useState<Plan[]>([]);
  const [features, setFeatures] = useState<RegistryFeature[]>([]);

  useEffect(() => {
    void fetch('/api/tariff-plans')
      .then((r) => (r.ok ? r.json() : Promise.reject()))
      .then((d: { plans: Plan[] }) => setPlans(d.plans.filter((p) => p.isActive)))
      .catch(() => {});
    void fetch('/api/features')
      .then((r) => (r.ok ? r.json() : Promise.reject()))
      .then((d: { features: RegistryFeature[] }) => setFeatures(d.features))
      .catch(() => {});
  }, []);

  const featureLabel = (id: string) => features.find((f) => f.id === id)?.label ?? id;

  const currentId = user?.tariffId ?? null;
  const expires = user?.tariffExpiresAt ? new Date(user.tariffExpiresAt) : null;
  const expired = expires ? expires < new Date() : false;

  return (
    <div className="space-y-4">
      {currentId && !expired && (
        <div className="rounded-lg border border-[#beff00]/40 bg-[#beff00]/5 p-4">
          <p className="text-sm">
            <span className="font-bold text-[#c9ff2a]">Ваш тариф: {user?.tariffName}</span>
            <span className="ml-2 text-xs text-zinc-500">
              {expires ? `до ${expires.toLocaleDateString('ru-RU')}` : 'бессрочно'}
            </span>
          </p>
        </div>
      )}

      <div className="grid gap-4 sm:grid-cols-2">
        {plans.map((p) => {
          const isCurrent = p.id === currentId && !expired;
          return (
            <div key={p.id} className={`rounded-lg border p-5 ${isCurrent ? 'border-[#beff00]/50 bg-[#beff00]/5' : 'border-[#2a2a2a] bg-[#191919]'}`}>
              <div className="flex items-baseline justify-between">
                <h2 className="text-lg font-bold">{p.name}</h2>
                {isCurrent && <span className="rounded-full bg-[#beff00] px-2 py-0.5 text-xs font-bold text-black">ваш</span>}
              </div>
              {p.description && <p className="mt-1 text-sm text-zinc-400">{p.description}</p>}
              <p className="mt-3">
                <span className="text-2xl font-bold">{Number(p.priceMonthly).toLocaleString('ru-RU')} ₽</span>
                <span className="text-sm text-zinc-500">/мес</span>
                {Number(p.priceYearly) > 0 && (
                  <span className="ml-3 text-sm text-zinc-400">
                    или {Number(p.priceYearly).toLocaleString('ru-RU')} ₽/год
                    {p.yearlyDiscount > 0 && <span className="text-[#c9ff2a]"> −{p.yearlyDiscount}%</span>}
                  </span>
                )}
              </p>
              <ul className="mt-3 space-y-1 text-sm text-zinc-400">
                {Object.entries(p.features)
                  .filter(([, v]) => Boolean(v))
                  .map(([k]) => (
                    <li key={k}>✓ {featureLabel(k)}</li>
                  ))}
              </ul>
              <button
                disabled
                className="mt-4 w-full rounded-full bg-[#beff00] py-2 text-sm font-bold text-black opacity-50"
                title="Оплата подключается"
              >
                Оформить — скоро
              </button>
            </div>
          );
        })}
      </div>
      <p className="text-xs text-zinc-600">
        Оплата появится с подключением ЮKassa. История платежей будет собираться здесь.
      </p>
    </div>
  );
}
