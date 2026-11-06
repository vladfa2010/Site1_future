/**
 * Дайджесты: ежедневный (конец дня) и недельный репорт (как в PULSE).
 * Получатели — юзеры с подписками и включённым каналом (настройки по умолчанию: вкл).
 */
import { and, desc, eq, gte, inArray, sql, type SQL } from 'drizzle-orm';
import {
  db, users, subscriptions, notificationSettings, articles, articleViews, media,
} from '@newinvest/db';
import { sendEmail, emailEnabled, renderDailyDigest, renderWeeklyReport } from './email.js';

const existsIn = (junction: string, fk: string, ids: number[]) =>
  sql`exists(select 1 from ${sql.identifier(junction)} j where j.${sql.identifier('article_id')} = ${sql.identifier('articles')}.${sql.identifier('id')} and j.${sql.identifier(fk)} in (${sql.join(ids.map((id) => sql`${id}`), sql`, `)}))`;

async function subscribedArticles(userId: number, since: Date): Promise<{ type: string; slug: string; title: string; excerpt: string | null }[]> {
  const subs = await db.select().from(subscriptions).where(eq(subscriptions.userId, userId));
  const byType = (t: string) => subs.filter((s) => s.entityType === t).map((s) => s.entityId);
  const ors = [
    existsIn('article_companies', 'company_id', byType('company')),
    existsIn('article_trends', 'trend_id', byType('trend')),
    existsIn('article_industries', 'industry_id', byType('industry')),
    existsIn('article_tickers', 'ticker_id', byType('ticker')),
  ].filter((x): x is SQL => x !== null);
  if (!ors.length) return [];

  return db
    .select({ type: articles.type, slug: articles.slug, title: articles.title, excerpt: articles.excerpt })
    .from(articles)
    .where(and(eq(articles.status, 'published'), gte(articles.publishedAt, since), sql`(${sql.join(ors, sql` or `)})`))
    .orderBy(sql`${articles.publishedAt} desc nulls last`)
    .limit(30);
}

/** канал включён: явно в настройках, либо настроек нет (дефолт — вкл) */
async function recipients(flag: 'emailDaily' | 'emailWeekly'): Promise<{ id: number; email: string; displayName: string | null; lastSent: Date | null }[]> {
  const rows = await db
    .select({
      id: users.id, email: users.email, displayName: users.displayName,
      flagValue: notificationSettings[flag],
      lastDaily: notificationSettings.lastDailySentAt,
      lastWeekly: notificationSettings.lastWeeklySentAt,
    })
    .from(users)
    .innerJoin(subscriptions, eq(subscriptions.userId, users.id))
    .leftJoin(notificationSettings, eq(notificationSettings.userId, users.id));
  const seen = new Map<number, { id: number; email: string; displayName: string | null; lastSent: Date | null }>();
  for (const r of rows) {
    if (r.flagValue === false) continue; // явно выключено
    seen.set(r.id, { id: r.id, email: r.email, displayName: r.displayName, lastSent: flag === 'emailDaily' ? r.lastDaily : r.lastWeekly });
  }
  return [...seen.values()];
}

export async function runDailyDigest(): Promise<{ sent: number; skipped: string | null }> {
  if (!emailEnabled()) return { sent: 0, skipped: 'RESEND_API_KEY/RESEND_FROM не заданы' };
  let sent = 0;
  for (const user of await recipients('emailDaily')) {
    try {
      const since = user.lastSent ?? new Date(Date.now() - 26 * 3600_000);
      const items = await subscribedArticles(user.id, since);
      if (items.length === 0 && user.lastSent) continue; // пустой день — не спамим (первый раз шлём для проверки)
      await sendEmail(user.email, `Инвестиционно.рф — подборка дня (${items.length})`, renderDailyDigest(user.displayName ?? 'инвестор', items));
      await db.insert(notificationSettings)
        .values({ userId: user.id, emailDaily: true, lastDailySentAt: new Date() })
        .onConflictDoUpdate({ target: notificationSettings.userId, set: { lastDailySentAt: new Date() } });
      sent++;
    } catch (e) {
      console.error('[digest daily]', user.email, e);
    }
  }
  return { sent, skipped: null };
}

export async function runWeeklyReport(): Promise<{ sent: number; skipped: string | null }> {
  if (!emailEnabled()) return { sent: 0, skipped: 'RESEND_API_KEY/RESEND_FROM не заданы' };
  const weekAgo = new Date(Date.now() - 7 * 86400_000);
  let sent = 0;

  for (const user of await recipients('emailWeekly')) {
    try {
      const [countRow] = await db.select({ n: sql<number>`count(*)` }).from(articles)
        .where(and(eq(articles.status, 'published'), gte(articles.publishedAt, weekAgo)));
      const top = await db
        .select({ type: articles.type, slug: articles.slug, title: articles.title, excerpt: articles.excerpt, views: sql<number>`count(*)` })
        .from(articleViews)
        .innerJoin(articles, eq(articleViews.articleId, articles.id))
        .where(gte(articleViews.viewedAt, weekAgo))
        .groupBy(articles.id, articles.type, articles.slug, articles.title, articles.excerpt)
        .orderBy(desc(sql`count(*)`))
        .limit(5);
      const subscribed = await subscribedArticles(user.id, weekAgo);
      const summary = await aiSummaryWeek(countRow.n, top, subscribed).catch(() => null);
      await sendEmail(
        user.email,
        'Инвестиционно.рф — итоги недели',
        renderWeeklyReport(user.displayName ?? 'инвестор', { articlesCount: countRow.n, top, subscribed, summary }),
      );
      await db.insert(notificationSettings)
        .values({ userId: user.id, emailWeekly: true, lastWeeklySentAt: new Date() })
        .onConflictDoUpdate({ target: notificationSettings.userId, set: { lastWeeklySentAt: new Date() } });
      sent++;
    } catch (e) {
      console.error('[weekly]', user.email, e);
    }
  }
  return { sent, skipped: null };
}

/** опциональная AI-сводка недели (Moonshot; без ключа — без сводки) */
async function aiSummaryWeek(
  count: number,
  top: { title: string }[],
  subscribed: { title: string }[],
): Promise<string | null> {
  const key = process.env.MOONSHOT_API_KEY;
  if (!key) return null;
  const prompt = `Сайт инвестиционно.рф, венчурные тренды и идеи. За неделю вышло ${count} материалов. ` +
    `Топ: ${top.map((a) => `«${a.title}»`).join('; ') || '—'}. ` +
    `По подпискам читателя: ${subscribed.slice(0, 8).map((a) => `«${a.title}»`).join('; ') || '—'}. ` +
    'Напиши 2-3 предложения дружелюбной сводки недели для подписчика на русском, без воды и эмодзи.';
  const res = await fetch(`${process.env.MOONSHOT_BASE_URL ?? 'https://api.moonshot.ai/v1'}/chat/completions`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ model: process.env.MOONSHOT_TEXT_MODEL ?? 'moonshot-v1-8k', messages: [{ role: 'user', content: prompt }], max_tokens: 300 }),
    signal: AbortSignal.timeout(30_000),
  });
  if (!res.ok) throw new Error(`moonshot ${res.status}`);
  const data = (await res.json()) as { choices: { message: { content: string } }[] };
  return data.choices[0]?.message.content.trim() ?? null;
}
