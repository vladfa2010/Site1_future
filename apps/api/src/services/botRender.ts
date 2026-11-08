/**
 * Серверный bot-рендер (ТЗ-10, вариант C).
 *
 * Лёгкий HTML-шаблон из БД для поисковых/соцботов: title, description,
 * OG/Twitter, JSON-LD (NewsArticle + BreadcrumbList по контракту ТЗ-01),
 * обрезанный текст статьи. Обычные пользователи по-прежнему получают SPA —
 * маршрутизацию по UA делает Caddy (rewrite → /render?path=... с X-Bot-Render: 1).
 *
 * КЛЮЧЕВЫЕ ПРАВИЛА:
 * - ВСЕ строки из БД экранируются (escapeHtml/escapeAttr) — XSS здесь катастрофа.
 * - Пейволл (accessLevel != public) → тизер: метаданные + excerpt, НЕ отдаём
 *   100 слов текста (одинаково для всех, обход /render не даёт текста).
 * - BreadcrumbList генерируется через buildBreadcrumbList/serializeJsonLd из
 *   '@newinvest/db/breadcrumbs' — ИДЕНТИЧНО контракту ТЗ-01 (правка ревью v2.1 №2:
 *   для ВСЕХ типов страниц, последний элемент без item).
 * - JSON-LD — одним JSON.stringify + защита '</script'/U+2028/29 (serializeJsonLd).
 * - Кэш в памяти процесса, TTL 15 мин; инвалидация при публикации/правке.
 */
import { and, desc, eq, sql } from 'drizzle-orm';
import {
  db, articles, media, users, metaFields, companies, trends, stories, redirects,
  ARTICLE_TYPES, type ArticleType,
} from '@newinvest/db';
import {
  buildBreadcrumbList, serializeJsonLd,
  type BreadcrumbCrumb,
} from '@newinvest/db/breadcrumbs';
import {
  escapeHtml, escapeAttr, htmlToText, truncateChars,
  absoluteUrl, formatRuDate,
} from '../utils/html.js';

const RENDER_TTL_MS = 15 * 60 * 1000;
const BODY_WORDS = 100; // первые ~100 слов текста (не 300 — не выдаём текст бесплатно)
const FEED_LINKS = 8; // внутренние ссылки в лентах для краулинга (§6.2: 5–10)

// ---------- Кэш рендера (путь → HTML) ----------
const renderCache = new Map<string, { html: string; expiresAt: number }>();

/** Инвалидация кэша рендера: конкретный путь (path без query) или весь кэш */
export function invalidateRenderCache(path?: string): void {
  if (path === undefined) {
    renderCache.clear();
    return;
  }
  renderCache.delete(normalizePath(path) ?? path);
}

// ---------- Кэш redirects (oldPath → newPath/httpCode), ревью v2.1 №5 ----------
let redirectsCache: { map: Map<string, { newPath: string; httpCode: number }>; expiresAt: number } | null = null;
const REDIRECTS_TTL_MS = 15 * 60 * 1000;

async function lookupRedirect(path: string): Promise<{ newPath: string; httpCode: number } | null> {
  if (!redirectsCache || redirectsCache.expiresAt < Date.now()) {
    const rows = await db.select().from(redirects);
    const map = new Map(rows.map((r) => [normalizePath(r.oldPath) ?? r.oldPath, { newPath: r.newPath, httpCode: r.httpCode }]));
    redirectsCache = { map, expiresAt: Date.now() + REDIRECTS_TTL_MS };
  }
  return redirectsCache.map.get(path) ?? null;
}

/** Инвалидация при POST/DELETE /api/redirects (routes/admin.ts) */
export function invalidateRedirectsCache(): void {
  redirectsCache = null;
}

// ---------- Результат рендера ----------
export type RenderResult =
  | { status: 301 | 302 | 307 | 308; location: string }
  | { status: 404 }
  | { status: 200; html: string };

/** Нормализация пути: без query/hash, слеш в конце отрезан (как RedirectHandler.tsx) */
export function normalizePath(raw: string): string | null {
  let p = raw.split('?')[0].split('#')[0].trim();
  if (!p.startsWith('/')) return null;
  if (p.length > 1) p = p.replace(/\/+$/, '');
  return p === '' ? '/' : p;
}

/** Публичный origin: PUBLIC_SITE_URL, fallback — Host заголовка запроса */
export function siteOrigin(hostHeader: string | undefined): string {
  const env = process.env.PUBLIC_SITE_URL?.trim();
  if (env) return env.replace(/\/+$/, '');
  const host = (hostHeader ?? `localhost:${process.env.PORT ?? 4000}`).trim();
  return `http://${host}`.replace(/\/+$/, '');
}

// ---------- Рубрики и статические страницы (маппинг-источник текстов — здесь) ----------
export const RUBRIC_NAMES: Record<ArticleType, string> = {
  novost: 'Новости',
  sobytie: 'События',
  analitika: 'Аналитика',
  interesnoe: 'Интересное',
  ideya: 'Идеи',
  video: 'Видео',
};

const SITE_TITLE = 'Инвестиционно.рф';
const SITE_TAGLINE = 'Инвестиционно про будущее';
const SITE_DESCRIPTION = 'Тренды, идеи и сделки, которые меняют мир';

/** Статические страницы (зеркало App.tsx; title/description — источник для ботов) */
const STATIC_PAGES: Record<string, { title: string; description: string }> = {
  '/o-nas': { title: 'О нас', description: 'Команда амбассадоров будущего: более 20 лет инвестиционного опыта, открытый портфель и поиск идей, которые изменят мир.' },
  '/zachem': { title: 'Зачем?', description: 'Зачем мы собираем необычные инвестиционные идеи и что может изменить мир в ближайшем будущем.' },
  '/smysl': { title: 'Для кого?', description: 'Платформа для тех, кто не хочет отдавать анализ будущих изменений в чужие руки, но не имеет времени за всем уследить.' },
  '/missiya': { title: 'Миссия?', description: 'Быть на самом острие технологичного прогресса и участвовать в трендах, которые меняют уклад цивилизации.' },
  '/kak-tut-vsyo-ustroeno': { title: 'Как тут всё устроено', description: 'Пайплайн, портфель, архив сделок и тренды — как устроена платформа Инвестиционно.рф.' },
  '/portfel-kak-ispolzovat': { title: 'Как пользоваться разделом «Портфель»', description: 'Как устроен открытый портфель сделок сообщества: статусы, выходы и выводы.' },
  '/paypleyn-kak-ispolzovat': { title: 'Как пользоваться разделом «Пайплайн»', description: 'Пайплайн — последовательность шагов поиска инвестиционной возможности: от идеи до сделки.' },
  '/arhiv-sdelok-kak-ispolzovat-razdel': { title: 'Как пользоваться «Архивом сделок»', description: 'Архив — каждая идея или закрытая сделка с результатом и выводами для будущих решений.' },
  '/trendy-chto-ehto-takoe': { title: 'Тренды: что это такое', description: 'Что такое тренды на Инвестиционно.рф и как инвестировать в технологические волны.' },
  '/portfolio': { title: 'Портфель', description: 'Открытый портфель сделок сообщества Инвестиционно.рф: компании, статусы и результаты.' },
  '/propose': { title: 'Предложить идею', description: 'Предложите свою инвестиционную идею или стартап сообществу Инвестиционно.рф.' },
  '/privacy': { title: 'Политика конфиденциальности', description: 'Политика обработки персональных данных платформы Инвестиционно.рф.' },
  '/terms': { title: 'Условия использования', description: 'Условия использования платформы Инвестиционно.рф. Материалы не являются индивидуальной инвестиционной рекомендацией.' },
  '/pricing': { title: 'Тарифы', description: 'Тарифные планы Инвестиционно.рф: доступ к закрытым материалам и возможностям сообщества.' },
};

// Ботам не отдаём служебные/персональные страницы — честный 404 вместо SPA-200
const NOINDEX_PATHS = new Set(['/cabinet', '/login', '/register', '/search', '/feed']);

// ---------- Данные страницы ----------
interface PageData {
  title: string;
  description: string;
  ogType: 'article' | 'website' | 'profile';
  canonicalPath: string;
  /** абсолютный URL обложки или null (нет обложки → og:image не рендерится) */
  image: string | null;
  h1: string;
  /** HTML-фрагмент <body> (внутрь уже НЕ экранированным приходит — строится с экранированием) */
  body: string;
  /** JSON-LD объекты (BreadcrumbList — всегда, по контракту ТЗ-01) */
  jsonLd: unknown[];
}

// ---------- Шаблон ----------
function renderHtml(page: PageData, origin: string): string {
  const canonical = origin + page.canonicalPath;
  const e = escapeHtml;
  const a = escapeAttr;

  const meta: string[] = [
    `<meta name="description" content="${a(page.description)}">`,
    `<link rel="canonical" href="${a(canonical)}">`,
    `<meta property="og:title" content="${a(page.title)}">`,
    `<meta property="og:description" content="${a(page.description)}">`,
    `<meta property="og:type" content="${page.ogType}">`,
    `<meta property="og:url" content="${a(canonical)}">`,
  ];
  // пустые секции не рендерятся (принцип 4.3): без обложки — без og:image
  if (page.image) {
    meta.push(`<meta property="og:image" content="${a(page.image)}">`);
    meta.push(`<meta name="twitter:image" content="${a(page.image)}">`);
  }
  meta.push(
    `<meta property="og:site_name" content="${SITE_TITLE}">`,
    `<meta property="og:locale" content="ru_RU">`,
    // фиксировано шаблоном ТЗ-10 §6.2 (не зависит от наличия обложки)
    `<meta name="twitter:card" content="summary_large_image">`,
    `<meta name="twitter:title" content="${a(page.title)}">`,
    `<meta name="twitter:description" content="${a(page.description)}">`,
  );

  const jsonLdBlocks = page.jsonLd
    .map((obj) => `<script type="application/ld+json">${serializeJsonLd(obj)}</script>`)
    .join('\n  ');

  return `<!doctype html>
<html lang="ru">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>${e(page.title)} — ${SITE_TITLE}</title>
  ${meta.join('\n  ')}
  ${jsonLdBlocks}
</head>
<body>
  <article>
${page.body}
  </article>
  <noscript>Для полной версии сайта включите JavaScript.</noscript>
</body>
</html>
`;
}

/** BreadcrumbList по контракту ТЗ-01: ИМПОРТ buildBreadcrumbList (не копия кода) */
function breadcrumbJsonLd(crumbs: BreadcrumbCrumb[], origin: string) {
  return buildBreadcrumbList(crumbs, origin);
}

function crumbNav(crumbs: BreadcrumbCrumb[]): string {
  const parts = [`<a href="/">Главная</a>`];
  for (const c of crumbs.slice(1)) {
    if (c.to) parts.push(`<a href="${escapeAttr(c.to)}">${escapeHtml(c.label)}</a>`);
    else parts.push(`<span>${escapeHtml(c.label)}</span>`);
  }
  return `<nav aria-label="breadcrumb">${parts.join(' / ')}</nav>`;
}

/** Внутренние ссылки для краулинга: только http(s)/корневые, никаких javascript: */
function safeHref(url: string): string | null {
  if (/^https?:\/\//i.test(url) || url.startsWith('/')) return url;
  return null;
}

function articleLink(type: string, slug: string, title: string): string | null {
  const href = safeHref(`/${type}/${encodeURIComponent(slug).replace(/%2F/gi, '')}`);
  if (!href) return null;
  return `<li><a href="${escapeAttr(href)}">${escapeHtml(title)}</a></li>`;
}

// ---------- Строители страниц ----------

async function buildArticlePage(type: ArticleType, slug: string, origin: string): Promise<PageData | null> {
  const [row] = await db
    .select({
      article: articles,
      coverUrl: media.filePath,
      authorName: users.displayName,
    })
    .from(articles)
    .leftJoin(media, eq(articles.coverMediaId, media.id))
    .leftJoin(users, eq(articles.authorId, users.id))
    .where(and(eq(articles.type, type), eq(articles.slug, slug), eq(articles.status, 'published')))
    .limit(1);
  if (!row) return null;

  const article = row.article;
  const [meta] = await db
    .select({ value: metaFields.value })
    .from(metaFields)
    .where(and(
      eq(metaFields.ownerType, 'article'),
      eq(metaFields.ownerId, article.id),
      eq(metaFields.key, 'meta_description'),
    ))
    .limit(1);

  const textParagraphs = article.accessLevel === 'public' ? htmlToText(article.contentHtml, BODY_WORDS) : [];
  const plainText = textParagraphs.join(' ');
  const rubric = RUBRIC_NAMES[type];
  // description-фолбэк (ТЗ-10 §6.1): excerpt → meta_description → первые ~160 символов текста
  const description =
    (article.excerpt && article.excerpt.trim()) ||
    (meta?.value && meta.value.trim()) ||
    truncateChars(plainText || article.title, 160);
  const cover = row.coverUrl ? absoluteUrl(row.coverUrl, origin) : null;
  const authorName = row.authorName?.trim() || 'Редакция';
  const publishedAt = article.publishedAt ?? article.createdAt;
  const isPaywalled = article.accessLevel !== 'public';

  const crumbs: BreadcrumbCrumb[] = [
    { label: 'Главная', to: '/' },
    { label: rubric, to: `/${type}` },
    { label: article.title },
  ];

  const newsArticle = {
    '@context': 'https://schema.org',
    '@type': 'NewsArticle',
    headline: article.title,
    description,
    ...(cover ? { image: [cover] } : {}),
    datePublished: publishedAt.toISOString(),
    dateModified: article.updatedAt.toISOString(),
    author: { '@type': 'Person', name: authorName },
    publisher: { '@type': 'Organization', name: SITE_TITLE, url: origin },
  };

  const body = [
    crumbNav(crumbs),
    `<h1>${escapeHtml(article.title)}</h1>`,
    `<p><time datetime="${escapeAttr(publishedAt.toISOString())}">${formatRuDate(publishedAt)}</time> · ${escapeHtml(authorName)}</p>`,
    article.excerpt ? `<p><strong>${escapeHtml(article.excerpt)}</strong></p>` : '',
    // пейволл: тизер без 100 слов (НЕ отдаём текст бесплатно — обход /render бессмыслен)
    isPaywalled
      ? `<p>Полная версия доступна по подписке.</p>`
      : textParagraphs.map((p) => `<p>${escapeHtml(p)}</p>`).join('\n    '),
    `<p><a href="${escapeAttr(origin + `/${type}/${slug}`)}">Открыть полную версию</a></p>`,
  ].filter(Boolean).join('\n    ');

  return {
    title: article.title,
    description,
    ogType: 'article',
    canonicalPath: `/${type}/${slug}`,
    image: cover,
    h1: article.title,
    body,
    jsonLd: [newsArticle, breadcrumbJsonLd(crumbs, origin)],
  };
}

/** Шаблоны entity-страниц (правка ревью v2.1 №8): website/profile, не article */
async function buildCompanyPage(slug: string, origin: string): Promise<PageData | null> {
  const [row] = await db
    .select({
      company: companies,
      logoUrl: media.filePath,
    })
    .from(companies)
    .leftJoin(media, eq(companies.logoMediaId, media.id))
    .where(eq(companies.slug, slug))
    .limit(1);
  if (!row) return null;
  const c = row.company;
  const text = c.description ? htmlToText(c.description, BODY_WORDS) : [];
  const description = truncateChars(c.oneLiner ?? text.join(' ') ?? '', 160) || c.name;
  const image = row.logoUrl ? absoluteUrl(row.logoUrl, origin) : null;

  const crumbs: BreadcrumbCrumb[] = [
    { label: 'Главная', to: '/' },
    { label: 'Компании' }, // индексной страницы нет — name-only допустим (контракт ТЗ-01)
    { label: c.name },
  ];
  const organization = {
    '@context': 'https://schema.org',
    '@type': 'Organization',
    name: c.name,
    description,
    url: origin + `/kompaniya/${slug}`,
    ...(image ? { logo: image, image: [image] } : {}),
  };
  const body = [
    crumbNav(crumbs),
    `<h1>${escapeHtml(c.name)}</h1>`,
    c.oneLiner ? `<p><strong>${escapeHtml(c.oneLiner)}</strong></p>` : '',
    text.map((p) => `<p>${escapeHtml(p)}</p>`).join('\n    '),
    `<p><a href="${escapeAttr(origin + `/kompaniya/${slug}`)}">Открыть полную версию</a></p>`,
  ].filter(Boolean).join('\n    ');

  return {
    title: c.name,
    description,
    ogType: 'profile',
    canonicalPath: `/kompaniya/${slug}`,
    image,
    h1: c.name,
    body,
    jsonLd: [organization, breadcrumbJsonLd(crumbs, origin)],
  };
}

async function buildTrendPage(slug: string, origin: string): Promise<PageData | null> {
  const [row] = await db
    .select({ trend: trends, coverUrl: media.filePath })
    .from(trends)
    .leftJoin(media, eq(trends.coverMediaId, media.id))
    .where(eq(trends.slug, slug))
    .limit(1);
  if (!row) return null;
  const t = row.trend;
  const text = t.description ? htmlToText(t.description, BODY_WORDS) : [];
  const description = truncateChars(text.join(' '), 160) || t.name;
  const image = row.coverUrl ? absoluteUrl(row.coverUrl, origin) : null;

  const crumbs: BreadcrumbCrumb[] = [
    { label: 'Главная', to: '/' },
    { label: 'Тренды' },
    { label: t.name },
  ];
  const body = [
    crumbNav(crumbs),
    `<h1>${escapeHtml(t.name)}</h1>`,
    text.map((p) => `<p>${escapeHtml(p)}</p>`).join('\n    '),
    `<p><a href="${escapeAttr(origin + `/trend/${slug}`)}">Открыть полную версию</a></p>`,
  ].filter(Boolean).join('\n    ');

  return {
    title: t.name,
    description,
    ogType: 'website',
    canonicalPath: `/trend/${slug}`,
    image,
    h1: t.name,
    body,
    jsonLd: [breadcrumbJsonLd(crumbs, origin)],
  };
}

async function buildStoryPage(slug: string, origin: string): Promise<PageData | null> {
  const [row] = await db
    .select({ story: stories, coverUrl: media.filePath })
    .from(stories)
    .leftJoin(media, eq(stories.coverMediaId, media.id))
    .where(eq(stories.slug, slug))
    .limit(1);
  if (!row) return null;
  const s = row.story;
  const text = s.description ? htmlToText(s.description, BODY_WORDS) : [];
  const description = truncateChars(text.join(' '), 160) || s.name;
  const image = row.coverUrl ? absoluteUrl(row.coverUrl, origin) : null;

  const crumbs: BreadcrumbCrumb[] = [
    { label: 'Главная', to: '/' },
    { label: 'Сюжеты' },
    { label: s.name },
  ];
  const body = [
    crumbNav(crumbs),
    `<h1>${escapeHtml(s.name)}</h1>`,
    text.map((p) => `<p>${escapeHtml(p)}</p>`).join('\n    '),
    `<p><a href="${escapeAttr(origin + `/syuzhet/${slug}`)}">Открыть полную версию</a></p>`,
  ].filter(Boolean).join('\n    ');

  return {
    title: s.name,
    description,
    ogType: 'website',
    canonicalPath: `/syuzhet/${slug}`,
    image,
    h1: s.name,
    body,
    jsonLd: [breadcrumbJsonLd(crumbs, origin)],
  };
}

async function recentArticleLinks(type: ArticleType | undefined, limit: number): Promise<string[]> {
  const conditions = [eq(articles.status, 'published'), eq(articles.accessLevel, 'public')];
  if (type) conditions.push(eq(articles.type, type));
  const rows = await db
    .select({ type: articles.type, slug: articles.slug, title: articles.title })
    .from(articles)
    .where(and(...conditions))
    .orderBy(desc(sql`coalesce(${articles.publishedAt}, ${articles.createdAt})`))
    .limit(limit);
  return rows
    .map((r) => articleLink(r.type, r.slug, r.title))
    .filter((s): s is string => s !== null);
}

async function buildFeedPage(type: ArticleType, origin: string): Promise<PageData> {
  const rubric = RUBRIC_NAMES[type];
  const links = await recentArticleLinks(type, FEED_LINKS);
  const crumbs: BreadcrumbCrumb[] = [
    { label: 'Главная', to: '/' },
    { label: rubric },
  ];
  const description = `${rubric} на ${SITE_TITLE}: ${SITE_DESCRIPTION.toLowerCase()}`;
  const body = [
    crumbNav(crumbs),
    `<h1>${escapeHtml(rubric)}</h1>`,
    `<ul>${links.join('\n      ')}</ul>`,
  ].join('\n    ');
  return {
    title: rubric,
    description,
    ogType: 'website',
    canonicalPath: `/${type}`,
    image: null,
    h1: rubric,
    body,
    jsonLd: [breadcrumbJsonLd(crumbs, origin)],
  };
}

async function buildHomePage(origin: string): Promise<PageData> {
  const links = await recentArticleLinks(undefined, FEED_LINKS);
  const crumbs: BreadcrumbCrumb[] = [{ label: 'Главная', to: '/' }];
  const body = [
    `<h1>${escapeHtml(`${SITE_TITLE} — ${SITE_TAGLINE}`)}</h1>`,
    `<p>${escapeHtml(SITE_DESCRIPTION)}</p>`,
    `<ul>${links.join('\n      ')}</ul>`,
  ].join('\n    ');
  return {
    title: `${SITE_TITLE} — ${SITE_TAGLINE}`,
    description: SITE_DESCRIPTION,
    ogType: 'website',
    canonicalPath: '/',
    image: null,
    h1: SITE_TITLE,
    body,
    jsonLd: [breadcrumbJsonLd(crumbs, origin)],
  };
}

function buildStaticPage(path: string, origin: string): PageData {
  const page = STATIC_PAGES[path];
  const crumbs: BreadcrumbCrumb[] = [
    { label: 'Главная', to: '/' },
    { label: page.title },
  ];
  const body = [
    crumbNav(crumbs),
    `<h1>${escapeHtml(page.title)}</h1>`,
    `<p>${escapeHtml(page.description)}</p>`,
    `<p><a href="${escapeAttr(origin + path)}">Открыть полную версию</a></p>`,
  ].join('\n    ');
  return {
    title: page.title,
    description: page.description,
    ogType: 'website',
    canonicalPath: path,
    image: null,
    h1: page.title,
    body,
    jsonLd: [breadcrumbJsonLd(crumbs, origin)],
  };
}

// ---------- Классификация пути (зеркало роутов App.tsx) ----------
async function buildPage(path: string, origin: string): Promise<PageData | null> {
  if (path === '/') return buildHomePage(origin);
  // служебные/персональные страницы ботам не рендерим — честный 404 (§6.1 «всё остальное»)
  if (NOINDEX_PATHS.has(path)) return null;

  const staticPage = STATIC_PAGES[path];
  if (staticPage) return buildStaticPage(path, origin);

  let m = path.match(/^\/(kompaniya|trend|syuzhet)\/([^/]+)$/);
  if (m) {
    const [, kind, slug] = m;
    // валидация slug (ревью v2.1 №4): сегмент без '/' — дальше экранирование и safeHref
    if (!slug || slug.length > 200) return null;
    if (kind === 'kompaniya') return buildCompanyPage(slug, origin);
    if (kind === 'trend') return buildTrendPage(slug, origin);
    return buildStoryPage(slug, origin);
  }

  m = path.match(/^\/([a-z]+)\/([^/]+)$/);
  if (m && (ARTICLE_TYPES as readonly string[]).includes(m[1]!)) {
    const type = m[1] as ArticleType;
    const slug = m[2]!;
    if (slug.length > 200) return null;
    return buildArticlePage(type, slug, origin);
  }

  m = path.match(/^\/([a-z]+)$/);
  if (m && (ARTICLE_TYPES as readonly string[]).includes(m[1]!)) {
    return buildFeedPage(m[1] as ArticleType, origin);
  }

  return null;
}

/**
 * Точка входа рендера: нормализация → серверные 301 из redirects → кэш →
 * классификация пути → шаблон. 301/404 в кэш НЕ пишем (ТЗ-10 §6.1).
 */
export async function renderPath(rawPath: string, origin: string): Promise<RenderResult> {
  const path = normalizePath(rawPath);
  if (!path) return { status: 404 };

  const redirect = await lookupRedirect(path);
  if (redirect) {
    const code = ([301, 302, 307, 308] as const).includes(redirect.httpCode as 301 | 302 | 307 | 308)
      ? (redirect.httpCode as 301 | 302 | 307 | 308)
      : 301;
    return { status: code, location: origin + redirect.newPath };
  }

  const hit = renderCache.get(path);
  if (hit && hit.expiresAt > Date.now()) {
    return { status: 200, html: hit.html };
  }

  const page = await buildPage(path, origin);
  if (!page) return { status: 404 };

  const html = renderHtml(page, origin);
  renderCache.set(path, { html, expiresAt: Date.now() + RENDER_TTL_MS });
  return { status: 200, html };
}
