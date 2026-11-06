async function get<T>(path: string): Promise<T> {
  const res = await fetch(`/api${path}`);
  if (!res.ok) throw new Error(`${res.status} ${path}`);
  return res.json() as Promise<T>;
}

// Типы зеркалят ответы API (apps/api/src/routes/*)
export interface ArticleListItem {
  id: number;
  type: string;
  slug: string;
  title: string;
  excerpt: string | null;
  publishedAt: string | null;
  coverUrl: string | null;
}

export interface ArticleDetail extends ArticleListItem {
  contentHtml: string;
  thesis: string | null;
  sourceUrl: string | null;
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
    get<{ article: ArticleDetail; coverUrl: string | null; relations: ArticleRelations; stages: string[] }>(`/articles/${type}/${slug}`),
  company: (slug: string) => get<CompanyDetail>(`/companies/${slug}`),
  trend: (slug: string) => get<TrendDetail>(`/trends/${slug}`),
  story: (slug: string) => get<StoryDetail>(`/stories/${slug}`),
  trends: () => get<{ trends: { slug: string; name: string; description: string | null }[] }>('/trends'),
  screener: (params: Record<string, string> = {}) => {
    const qs = new URLSearchParams(Object.entries(params).filter(([, v]) => v)).toString();
    return get<{ ideas: Idea[]; total: number }>(`/screener${qs ? `?${qs}` : ''}`);
  },
};

export interface Idea {
  id: number;
  slug: string;
  title: string;
  excerpt: string | null;
  thesis: string | null;
  publishedAt: string | null;
  coverUrl: string | null;
  phases: string[];
  stages: string[];
  industries: string[];
}
