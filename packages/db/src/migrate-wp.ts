/**
 * Миграция контента с донорского сайта (WordPress) через REST API.
 *
 * Тянет: статьи всех CPT (текстом), термины (компании/тикеры/индустрии/тренды/
 * фазы сделки), обложки (URL). Выводит связи графа по совместной встречаемости:
 * тикер→компания, компания→индустрия, компания→тренд, тренд→индустрия.
 *
 * Идемпотентен: повторный запуск обновляет по (type, slug) / slug.
 * Запуск: npm run migrate:wp -w @newinvest/db  (WP_BASE_URL в env или дефолт)
 */
import 'dotenv/config';
import { db } from './index.js';
import { stripHtml } from './text-utils.js';
import {
  articles, companies, tickers, industries, trends,
  dealPhases, dealStages,
  companyIndustries, companyTrends, trendIndustries,
  articleCompanies, articleTickers, articleIndustries, articleTrends,
  articleDealPhases, articleDealStages, media,
} from './schema.js';
import { eq, inArray, sql } from 'drizzle-orm';

const WP = process.env.WP_BASE_URL ?? 'https://xn--b1aghca0aeahc1am7c.xn--p1ai';
const TYPE_MAP: Record<string, string> = {
  novost: 'novost',
  sobytie: 'sobytie',
  analitika: 'analitika',
  interesnoe: 'interesnoe',
  post: 'ideya', // «Записи» на доноре = идеи
};

interface WpTerm { id: number; slug: string; name: string; description: string; }
interface WpPost {
  id: number; type: string; slug: string; date: string; status: string;
  title: { rendered: string };
  content: { rendered: string };
  excerpt: { rendered: string };
  featured_media: number;
  link: string;
  [taxonomy: string]: unknown;
}

async function wpGet<T>(path: string): Promise<T> {
  const res = await fetch(`${WP}/wp-json/wp/v2/${path}`);
  if (!res.ok) throw new Error(`WP ${res.status}: ${path}`);
  return res.json() as Promise<T>;
}

async function wpAll<T>(endpoint: string, params: Record<string, string> = {}): Promise<T[]> {
  const out: T[] = [];
  for (let page = 1; ; page++) {
    const qs = new URLSearchParams({ ...params, per_page: '100', page: String(page) });
    const batch = await wpGet<T[]>(`${endpoint}?${qs}`);
    out.push(...batch);
    if (batch.length < 100) break;
  }
  return out;
}

async function main() {
  console.log(`Донор: ${WP}`);

  // ---------- 1. Термины → сущности ----------
  console.log('1. Термины (компании/тикеры/индустрии/тренды/фазы)...');
  const [wpCompanies, wpTickers, wpIndustries, wpTrends, wpPhases, wpStages] = await Promise.all([
    wpAll<WpTerm>('kompaniya'), wpAll<WpTerm>('tiker'), wpAll<WpTerm>('industriya'),
    wpAll<WpTerm>('trend'), wpAll<WpTerm>('etapy-sdelki'), wpAll<WpTerm>('stadiya-sdelki'),
  ]);

  const upsertBySlug = async (table: any, rows: object[]) => {
    for (const r of rows) {
      await db.insert(table).values(r).onConflictDoUpdate({
        target: (table as any).slug,
        set: Object.fromEntries(Object.keys(r).filter((k) => k !== 'slug').map((k) => [k, (r as any)[k]])),
      });
    }
  };

  await upsertBySlug(companies, wpCompanies.map((t) => ({ slug: t.slug, name: t.name, description: t.description || null })));
  await upsertBySlug(tickers, wpTickers.map((t) => ({ slug: t.slug, symbol: t.name.toUpperCase(), name: t.name })));
  await upsertBySlug(industries, wpIndustries.map((t) => ({ slug: t.slug, name: t.name, description: t.description || null })));
  await upsertBySlug(trends, wpTrends.map((t) => ({ slug: t.slug, name: t.name, description: t.description || null })));
  await upsertBySlug(dealPhases, wpPhases.map((t) => ({ slug: t.slug, name: t.name })));
  await upsertBySlug(dealStages, wpStages.map((t, i) => ({ slug: t.slug, name: t.name, sortOrder: i })));

  const idMap = {
    company: new Map(wpCompanies.map((t) => [t.id, t.slug])),
    ticker: new Map(wpTickers.map((t) => [t.id, t.slug])),
    industry: new Map(wpIndustries.map((t) => [t.id, t.slug])),
    trend: new Map(wpTrends.map((t) => [t.id, t.slug])),
    phase: new Map(wpPhases.map((t) => [t.id, t.slug])),
    stage: new Map(wpStages.map((t) => [t.id, t.slug])),
  };

  const loadSlugs = async (table: any) =>
    new Map((await db.select({ id: (table as any).id, slug: (table as any).slug }).from(table)).map((r: any) => [r.slug, r.id]));
  const [companyIds, tickerIds, industryIds, trendIds, phaseIds, stageIds] = await Promise.all([
    loadSlugs(companies), loadSlugs(tickers), loadSlugs(industries), loadSlugs(trends), loadSlugs(dealPhases), loadSlugs(dealStages),
  ]);

  // ---------- 2. Статьи + привязки ----------
  console.log('2. Статьи (все CPT)...');
  const allPosts: WpPost[] = [];
  const FIELDS = 'id,type,slug,date,status,title,content,excerpt,featured_media,link,kompaniya,tiker,industriya,trend,etapy-sdelki,stadiya-sdelki';
  for (const [wpType] of Object.entries(TYPE_MAP)) {
    const endpoint = wpType === 'post' ? 'posts' : wpType; // базовый endpoint «Записей» — /posts
    const posts = await wpAll<WpPost>(endpoint, { _fields: FIELDS });
    allPosts.push(...posts);
    console.log(`   ${wpType}: ${posts.length}`);
  }

  // CPT-карточки компаний и лендинги трендов — сливаем в description сущностей
  const wpCompanyPages = await wpAll<WpPost>('kompaniya-p', { _fields: 'id,slug,content,title' });
  const wpTrendPages = await wpAll<WpPost>('trends', { _fields: 'id,slug,content,title' });
  for (const p of [...wpCompanyPages, ...wpTrendPages]) {
    if (!p.content?.rendered) {
      console.log(`   пропуск карточки без контента: ${p.slug}`);
      continue;
    }
    const table = (wpCompanyPages as WpPost[]).includes(p) ? companies : trends;
    await db.update(table).set({ description: sql`COALESCE(${table.description}, '') || ${'\n\n' + p.content.rendered}` }).where(eq((table as any).slug, p.slug));
  }
  console.log(`   слито карточек: kompaniya-p=${wpCompanyPages.length}, trends=${wpTrendPages.length}`);

  // Обложки: пакетно по уникальным media id
  const mediaIds = [...new Set(allPosts.map((p) => p.featured_media).filter((v) => v > 0))];
  const mediaMap = new Map<number, string>();
  for (let i = 0; i < mediaIds.length; i += 100) {
    const chunk = mediaIds.slice(i, i + 100);
    const items = await wpGet<{ id: number; source_url: string }[]>(`media?include=${chunk.join(',')}&per_page=100`);
    for (const m of items) mediaMap.set(m.id, m.source_url);
  }

  // Совместная встречаемость для вывода цепочек графа
  const cooc = { tickerCompany: new Map<string, Map<string, number>>(), companyIndustry: new Map<string, Map<string, number>>(), companyTrend: new Map<string, Map<string, number>>() };
  const bump = (map: Map<string, Map<string, number>>, a: string, b: string) => {
    if (!map.has(a)) map.set(a, new Map());
    const inner = map.get(a)!;
    inner.set(b, (inner.get(b) ?? 0) + 1);
  };

  const relInserts: Promise<unknown>[] = [];
  let inserted = 0;
  for (const p of allPosts) {
    const type = TYPE_MAP[p.type];
    if (!type) continue;
    if (!p.title?.rendered || !p.content?.rendered) {
      console.log(`   пропуск поста без title/content: ${p.type}/${p.slug} (id=${p.id})`);
      continue;
    }
    const coverUrl = mediaMap.get(p.featured_media);
    let coverMediaId: number | null = null;
    if (coverUrl) {
      const [m] = await db.insert(media).values({ filePath: coverUrl, sourceUrl: coverUrl }).onConflictDoNothing().returning({ id: media.id });
      coverMediaId = m?.id ?? null;
    }

    const [row] = await db.insert(articles).values({
      type, slug: p.slug,
      title: p.title.rendered.trim(),
      contentHtml: p.content.rendered,
      excerpt: stripHtml(p.excerpt?.rendered ?? '').slice(0, 500) || null,
      coverMediaId,
      status: p.status === 'publish' ? 'published' : 'draft',
      publishedAt: p.status === 'publish' ? new Date(p.date) : null,
      oldWpId: p.id, oldWpType: p.type,
    }).onConflictDoUpdate({
      target: [articles.type, articles.slug],
      set: { title: p.title.rendered.trim(), contentHtml: p.content.rendered, publishedAt: new Date(p.date) },
    }).returning({ id: articles.id });
    inserted++;

    // WP-поля таксономий называются иначе, чем ключи idMap
    const WP_FIELD: Record<string, string> = {
      company: 'kompaniya', ticker: 'tiker', industry: 'industriya',
      trend: 'trend', phase: 'etapy-sdelki', stage: 'stadiya-sdelki',
    };
    const ids = (tax: keyof typeof idMap, map: Map<string, number>) =>
      ((p[WP_FIELD[tax]] as number[] | undefined) ?? [])
        .map((tid) => idMap[tax].get(tid))
        .filter((s): s is string => !!s)
        .map((s) => map.get(s))
        .filter((v): v is number => !!v);

    const rels = {
      company: ids('company', companyIds),
      ticker: ids('ticker', tickerIds),
      industry: ids('industry', industryIds),
      trend: ids('trend', trendIds),
      phase: ids('phase', phaseIds),
      stage: ids('stage', stageIds),
    };

    for (const cid of rels.company) {
      relInserts.push(db.insert(articleCompanies).values({ articleId: row.id, companyId: cid }).onConflictDoNothing());
      for (const iid of rels.industry) {
        bump(cooc.companyIndustry, String(cid), String(iid));
        relInserts.push(db.insert(articleIndustries).values({ articleId: row.id, industryId: iid }).onConflictDoNothing());
      }
      for (const tid of rels.trend) {
        bump(cooc.companyTrend, String(cid), String(tid));
        relInserts.push(db.insert(articleTrends).values({ articleId: row.id, trendId: tid }).onConflictDoNothing());
      }
    }
    for (const tid of rels.ticker) {
      relInserts.push(db.insert(articleTickers).values({ articleId: row.id, tickerId: tid }).onConflictDoNothing());
      for (const cid of rels.company) bump(cooc.tickerCompany, String(tid), String(cid));
    }
    for (const pid of rels.phase) relInserts.push(db.insert(articleDealPhases).values({ articleId: row.id, phaseId: pid }).onConflictDoNothing());
    for (const sid of rels.stage) relInserts.push(db.insert(articleDealStages).values({ articleId: row.id, stageId: sid }).onConflictDoNothing());
  }
  await Promise.all(relInserts);
  console.log(`   статей обработано: ${inserted}`);

  // ---------- 3. Вывод цепочек графа ----------
  console.log('3. Вывод цепочек (тикер→компания, компания→индустрия/тренд)...');
  const best = (map: Map<string, Map<string, number>>) =>
    [...map.entries()].map(([a, inner]) => [a, [...inner.entries()].sort((x, y) => y[1] - x[1])[0]] as const);

  for (const [tSlug, cid] of best(cooc.tickerCompany)) {
    await db.update(tickers).set({ companyId: Number(cid[0]) }).where(eq(tickers.id, Number(tSlug)));
  }
  const ci = best(cooc.companyIndustry).map(([c, [i]]) => ({ companyId: Number(c), industryId: Number(i) }));
  if (ci.length) await db.insert(companyIndustries).values(ci).onConflictDoNothing();
  const ct = best(cooc.companyTrend).map(([c, [t]]) => ({ companyId: Number(c), trendId: Number(t) }));
  if (ct.length) await db.insert(companyTrends).values(ct).onConflictDoNothing();

  // ---------- 4. Статистика ----------
  const count = async (t: any) => (await db.select({ n: sql<number>`count(*)` }).from(t))[0].n;
  console.log('\n=== МИГРАЦИЯ ЗАВЕРШЕНА ===');
  console.log(`статьи: ${await count(articles)} | компании: ${await count(companies)} | тикеры: ${await count(tickers)}`);
  console.log(`индустрии: ${await count(industries)} | тренды: ${await count(trends)} | раунды: 0 (новые)`);
  process.exit(0);
}

main().catch((e) => {
  console.error('Ошибка миграции:', e.cause?.detail ?? e.cause?.message ?? e.message);
  console.error(e.stack?.split('\n').slice(0, 6).join('\n'));
  process.exit(1);
});
