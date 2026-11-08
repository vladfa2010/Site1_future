async function get<T>(path: string): Promise<T> {
  const res = await fetch(`/api${path}`);
  if (!res.ok) {
    const body = await res.json().catch(() => null);
    // статус и тело ошибки нужны фронту (пейволл 403 и др.)
    throw Object.assign(new Error(`${res.status} ${path}`), { status: res.status, body });
  }
  return res.json() as Promise<T>;
}

/** Аутентифицированные мутации (ТЗ-04: like/unlike/share) — токен из localStorage (паттерн favorites.tsx) */
async function send<T>(path: string, method: 'PUT' | 'DELETE' | 'POST', body?: unknown): Promise<T> {
  const token = localStorage.getItem('token');
  const res = await fetch(`/api${path}`, {
    method,
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });
  if (!res.ok) {
    const errBody = await res.json().catch(() => null);
    throw Object.assign(new Error(`${res.status} ${path}`), { status: res.status, body: errBody });
  }
  return res.json() as Promise<T>;
}

/** Каналы шеринга — финальный список закрепит ТЗ-02 (lib/share.ts); пока тип и метод тут (решение ТЗ-04) */
export type ShareChannel = 'telegram' | 'vk' | 'whatsapp' | 'copylink' | 'native_share' | 'unknown';

// Типы зеркалят ответы API (apps/api/src/routes/*)
export interface ArticleListItem {
  id: number;
  type: string;
  slug: string;
  title: string;
  excerpt: string | null;
  publishedAt: string | null;
  coverUrl: string | null;
  videoUrl?: string | null;
  readingTime?: number | null; // ТЗ-09: минуты чтения, null = не рассчитано
  viewsCount?: number; // ТЗ-03: виртуальный счётчик (реальные + seed + докрутка); undefined — бейдж не рендерится
  likesCount?: number; // ТЗ-04: лайки (счётчик виден всем)
  sharesCount?: number; // ТЗ-04: клики «поделиться» (считаем факт нажатия)
  liked?: boolean; // ТЗ-04: лайкнул ли текущий юзер (анониму — false)
}

export interface ArticleDetail extends ArticleListItem {
  contentHtml: string;
  thesis: string | null;
  sourceUrl: string | null;
  videoUrl: string | null;
  status: string;
}

export interface ArticleRelations {
  companies: { slug: string; name: string }[];
  trends: { slug: string; name: string }[];
  tickers: { symbol: string; exchange: string | null }[];
}

export interface FundingRound {
  id: number;
  stage: string | null;
  date: string | null;
  amount: string | null;
  currency: string | null;
  postMoneyValuation: string | null;
  investors: string[] | null;
  sourceUrl: string;
}

export interface CompanyDetail {
  company: {
    id: number;
    slug: string;
    name: string;
    oneLiner: string | null;
    description: string | null;
    website: string | null;
    country: string | null;
    foundedYear: number | null;
  };
  tickers: { symbol: string; exchange: string | null }[];
  industries: { slug: string; name: string }[];
  articles: ArticleListItem[];
  fundingRounds: FundingRound[];
}

export interface TrendDetail {
  trend: { id: number; slug: string; name: string; description: string | null };
  articles: ArticleListItem[];
}

export interface StoryDetail {
  story: { id: number; slug: string; name: string; description: string | null };
  articles: (ArticleListItem & { isPrimary: boolean })[];
}

export const api = {
  articles: (type?: string) =>
    get<{ articles: ArticleListItem[] }>(`/articles${type ? `?type=${type}` : ''}`),
  article: (type: string, slug: string) =>
    get<{ article: ArticleDetail; viewsCount: number; coverUrl: string | null; likesCount: number; sharesCount: number; liked: boolean; relations: ArticleRelations; stages: string[] }>(`/articles/${type}/${slug}`),
  company: (slug: string) => get<CompanyDetail>(`/companies/${slug}`),
  trend: (slug: string) => get<TrendDetail>(`/trends/${slug}`),
  story: (slug: string) => get<StoryDetail>(`/stories/${slug}`),
  ideaEvents: (articleId: number, type = 'sobytie') =>
    get<{ events: ArticleListItem[] }>(`/articles/${articleId}/events?type=${type}`),
  trends: () => get<{ trends: { slug: string; name: string; description: string | null }[] }>('/trends'),
  screener: (params: Record<string, string> = {}) => {
    const qs = new URLSearchParams(Object.entries(params).filter(([, v]) => v)).toString();
    return get<{ ideas: Idea[]; total: number }>(`/screener${qs ? `?${qs}` : ''}`);
  },
  // лента по типу (для каруселей «все …» на странице идеи)
  byType: (type: string, limit = 10) =>
    get<{ articles: ArticleListItem[] }>(`/articles?type=${type}&limit=${limit}`),
  // ТЗ-04: вовлечение — ответы отдают актуальный серверный счётчик (клиент подтягивает его после оптимистичного апдейта)
  like: (articleId: number) =>
    send<{ ok: boolean; liked: boolean; likesCount: number }>(`/articles/${articleId}/like`, 'PUT'),
  unlike: (articleId: number) =>
    send<{ ok: boolean; liked: boolean; likesCount: number }>(`/articles/${articleId}/like`, 'DELETE'),
  share: (articleId: number, channel: string) =>
    send<{ ok: boolean; sharesCount: number }>(`/articles/${articleId}/share`, 'POST', { channel }),
};

export interface Idea {
  id: number;
  slug: string;
  title: string;
  excerpt: string | null;
  thesis: string | null;
  publishedAt: string | null;
  coverUrl: string | null;
  readingTime?: number | null; // ТЗ-09: минуты чтения (показываем в карточке при >= 2)
  viewsCount?: number; // ТЗ-03: виртуальный счётчик
  likesCount?: number; // ТЗ-04: счётчики вовлечения (liked нет — скринер публичный)
  sharesCount?: number;
  phases: string[];
  stages: string[];
  industries: string[];
  companies: string[];
  trends: string[];
  fundingStage: string | null; // стадия последнего раунда (из funding_rounds)
}
