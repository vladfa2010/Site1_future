/**
 * Дайджесты: ежедневный (конец дня) и недельный репорт (как в PULSE).
 * Получатели — юзеры с подписками и включённым каналом (настройки по умолчанию: вкл).
 */
import { and, desc, eq, gte, sql, type SQL } from 'drizzle-orm';
import {
  db, users, subscriptions, notificationSettings, articles, articleViews,
  tgBindings,
} from '@newinvest/db';
import { sendEmail, emailEnabled, renderDailyDigest, renderWeeklyReport } from './email.js';
import { sendTelegramMessage, tgEnabled } from './telegram.js';
import { getKimiSettings } from './kimiSettings.js';

const anyChannel = () => emailEnabled() || tgEnabled();

const SITE = () => process.env.PUBLIC_SITE_URL ?? 'http://localhost:5173';

/** Экранирование для Telegram HTML parse_mode (симметрично email-контуру) */
const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

/** TG-дайджест дня: компактный текст со ссылками */
function tgDigestText(items: { type: string; slug: string; title: string }[]): string {
  if (items.length === 0) return 'Сегодня по вашим подпискам новых материалов не вышло.';
  const lines = items.slice(0, 10).map((a) => `• <a href="${SITE()}/${a.type}/${a.slug}">${esc(a.title)}</a>`);
  if (items.length > 10) lines.push(`…и ещё ${items.length - 10}`);
  return `<b>Подборка дня — Инвестиционно.рф</b>\n\n${lines.join('\n')}`;
}

function tgWeeklyText(count: number, top: { type: string; slug: string; title: string }[], subscribed: { type: string; slug: string; title: string }[]): string {
  const lines = [`<b>Итоги недели — Инвестиционно.рф</b>`, ``, `За неделю вышло ${count} материалов.`];
  if (top.length) {
    lines.push('', '<b>Топ недели:</b>');
    top.forEach((a, i) => lines.push(`${i + 1}. <a href="${SITE()}/${a.type}/${a.slug}">${esc(a.title)}</a>`));
  }
  if (subscribed.length) {
    lines.push('', '<b>По вашим подпискам:</b>');
    subscribed.slice(0, 5).forEach((a) => lines.push(`• <a href="${SITE()}/${a.type}/${a.slug}">${esc(a.title)}</a>`));
  }
  return lines.join('\n');
}

const existsIn = (junction: string, fk: string, ids: number[]) =>
  sql`exists(select 1 from ${sql.identifier(junction)} j where j.${sql.identifier('article_id')} = ${sql.identifier('articles')}.${sql.identifier('id')} and j.${sql.identifier(fk)} in (${sql.join(ids.map((id) => sql`${id}`), sql`, `)}))`;

/** Пейволл-условие для конкретного получателя: читаем АКТУАЛЬНЫЙ тариф из БД, не из JWT */
async function accessFor(userId: number): Promise<SQL> {
  const [u] = await db.select({ tariffId: users.tariffId, tariffExpiresAt: users.tariffExpiresAt })
    .from(users).where(eq(users.id, userId)).limit(1);
  const tariffValid = u?.tariffId && (!u.tariffExpiresAt || new Date(u.tariffExpiresAt) > new Date());
  const tariffOk = tariffValid ? sql`${articles.accessTariffId} = ${u!.tariffId}` : sql`false`;
  return sql`(${articles.accessLevel} = 'public' or ${articles.accessLevel} = 'auth' or (${articles.accessLevel} = 'tariff' and ${tariffOk}))`;
}

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

  const access = await accessFor(userId);
  return db
    .select({ type: articles.type, slug: articles.slug, title: articles.title, excerpt: articles.excerpt })
    .from(articles)
    .where(and(eq(articles.status, 'published'), access, gte(articles.publishedAt, since), sql`(${sql.join(ors, sql` or `)})`))
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
  if (!anyChannel()) return { sent: 0, skipped: 'ни RESEND_API_KEY, ни TG_BOT_TOKEN не заданы' };
  let sent = 0;
  for (const user of await recipients('emailDaily')) {
    try {
      const since = user.lastSent ?? new Date(Date.now() - 26 * 3600_000);
      const items = await subscribedArticles(user.id, since);
      if (items.length === 0 && user.lastSent) continue; // пустой день — не спамим (первый раз шлём для проверки)
      // email
      if (emailEnabled()) {
        await sendEmail(user.email, `Инвестиционно.рф — подборка дня (${items.length})`, renderDailyDigest(user.displayName ?? 'инвестор', items));
      }
      // telegram
      const [tg] = await db.select().from(tgBindings).where(eq(tgBindings.userId, user.id)).limit(1);
      if (tg) await sendTelegramMessage(tg.chatId, tgDigestText(items)).catch((e) => console.error('[tg digest]', e.message));
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
  if (!anyChannel()) return { sent: 0, skipped: 'ни RESEND_API_KEY, ни TG_BOT_TOKEN не заданы' };
  const weekAgo = new Date(Date.now() - 7 * 86400_000);
  let sent = 0;

  for (const user of await recipients('emailWeekly')) {
    try {
      const access = await accessFor(user.id);
      const [countRow] = await db.select({ n: sql<number>`count(*)` }).from(articles)
        .where(and(eq(articles.status, 'published'), access, gte(articles.publishedAt, weekAgo)));
      const top = await db
        .select({ type: articles.type, slug: articles.slug, title: articles.title, excerpt: articles.excerpt, views: sql<number>`count(*)` })
        .from(articleViews)
        .innerJoin(articles, eq(articleViews.articleId, articles.id))
        .where(and(gte(articleViews.viewedAt, weekAgo), access))
        .groupBy(articles.id, articles.type, articles.slug, articles.title, articles.excerpt)
        .orderBy(desc(sql`count(*)`))
        .limit(5);
      const subscribed = await subscribedArticles(user.id, weekAgo);
      const summary = await aiSummaryWeek(countRow.n, top, subscribed).catch(() => null);
      if (emailEnabled()) {
        await sendEmail(
          user.email,
          'Инвестиционно.рф — итоги недели',
          renderWeeklyReport(user.displayName ?? 'инвестор', { articlesCount: countRow.n, top, subscribed, summary }),
        );
      }
      const [tg] = await db.select().from(tgBindings).where(eq(tgBindings.userId, user.id)).limit(1);
      if (tg) await sendTelegramMessage(tg.chatId, tgWeeklyText(countRow.n, top, subscribed)).catch((e) => console.error('[tg weekly]', e.message));
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

/** опциональная AI-сводка недели (Moonshot; без ключа — без сводки). Ключ/модель — из настроек админки */
async function aiSummaryWeek(
  count: number,
  top: { title: string }[],
  subscribed: { title: string }[],
): Promise<string | null> {
  const s = await getKimiSettings();
  if (!s.apiKey) return null;
  const prompt = `Сайт инвестиционно.рф, венчурные тренды и идеи. За неделю вышло ${count} материалов. ` +
    `Топ: ${top.map((a) => `«${a.title}»`).join('; ') || '—'}. ` +
    `По подпискам читателя: ${subscribed.slice(0, 8).map((a) => `«${a.title}»`).join('; ') || '—'}. ` +
    'Напиши 2-3 предложения дружелюбной сводки недели для подписчика на русском, без воды и эмодзи.';
  const res = await fetch(`${s.baseUrl}/chat/completions`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${s.apiKey}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ model: s.textModel, messages: [{ role: 'user', content: prompt }], max_tokens: 300 }),
    signal: AbortSignal.timeout(30_000),
  });
  if (!res.ok) throw new Error(`moonshot ${res.status}`);
  const data = (await res.json()) as { choices: { message: { content: string } }[] };
  return data.choices[0]?.message.content.trim() ?? null;
}
