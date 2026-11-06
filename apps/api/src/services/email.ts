/**
 * Email-уведомления через Resend (как в PULSE, EMAIL.md).
 * Без RESEND_API_KEY — фича выключена (cron логирует и пропускает).
 * Публичный URL сайта: env PUBLIC_SITE_URL (для ссылок в письмах).
 */

const RESEND_URL = 'https://api.resend.com/emails';

export function emailEnabled(): boolean {
  return Boolean(process.env.RESEND_API_KEY && process.env.RESEND_FROM);
}

export async function sendEmail(to: string, subject: string, html: string): Promise<void> {
  const res = await fetch(RESEND_URL, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${process.env.RESEND_API_KEY}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      from: process.env.RESEND_FROM, // "Инвестиционно.рф <noreply@домен>"
      to,
      subject,
      html,
    }),
  });
  if (!res.ok) {
    const body = await res.text();
    throw new Error(`Resend ${res.status}: ${body.slice(0, 200)}`);
  }
}

const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

const TYPE_LABELS: Record<string, string> = {
  novost: 'Новость', ideya: 'Идея', sobytie: 'Событие', analitika: 'Аналитика', interesnoe: 'Интересное',
};

const SHELL = (title: string, body: string) => `<!doctype html>
<html><body style="margin:0;padding:0;background:#000000;font-family:Arial,Helvetica,sans-serif;">
<div style="max-width:560px;margin:0 auto;padding:24px;">
  <div style="margin-bottom:20px;">
    <span style="font-size:18px;font-weight:bold;color:#ffffff;">Инвестиционно<span style="color:#beff00;">.рф</span></span>
  </div>
  <h1 style="font-size:20px;color:#ffffff;margin:0 0 16px;">${esc(title)}</h1>
  ${body}
  <hr style="border:none;border-top:1px solid #2a2a2a;margin:24px 0 12px;">
  <p style="font-size:11px;color:#6b7280;line-height:1.5;">
    Вы получили это письмо, потому что подписаны на уведомления.
    Настроить или отключить можно в <a href="${process.env.PUBLIC_SITE_URL ?? 'http://localhost:5173'}/cabinet" style="color:#c9ff2a;">личном кабинете</a>.<br>
    Любой материал на сайте не является индивидуальной инвестиционной рекомендацией.
  </p>
</div>
</body></html>`;

const articleRow = (a: { type: string; slug: string; title: string; excerpt: string | null }, site: string) => `
  <div style="margin-bottom:14px;">
    <span style="font-size:11px;color:#beff00;text-transform:uppercase;">${TYPE_LABELS[a.type] ?? a.type}</span>
    <a href="${site}/${a.type}/${a.slug}" style="display:block;color:#ffffff;font-size:15px;font-weight:bold;text-decoration:none;margin-top:2px;">${esc(a.title)}</a>
    ${a.excerpt ? `<span style="font-size:13px;color:#9ca3af;">${esc(a.excerpt.slice(0, 120))}…</span>` : ''}
  </div>`;

export function renderDailyDigest(name: string, articles: { type: string; slug: string; title: string; excerpt: string | null }[]): string {
  const site = process.env.PUBLIC_SITE_URL ?? 'http://localhost:5173';
  const body = articles.length === 0
    ? '<p style="color:#9ca3af;">Сегодня по вашим подпискам новых материалов не вышло.</p>'
    : articles.map((a) => articleRow(a, site)).join('');
  return SHELL(`Добрый вечер, ${esc(name)}! Подборка дня`, body);
}

export function renderWeeklyReport(
  name: string,
  week: {
    articlesCount: number;
    top: { type: string; slug: string; title: string; excerpt: string | null; views: number }[];
    subscribed: { type: string; slug: string; title: string; excerpt: string | null }[];
    summary: string | null;
  },
): string {
  const site = process.env.PUBLIC_SITE_URL ?? 'http://localhost:5173';
  const parts: string[] = [];
  if (week.summary) {
    parts.push(`<div style="background:#191919;border:1px solid #2a2a2a;border-radius:8px;padding:14px;margin-bottom:18px;">
      <span style="font-size:11px;color:#beff00;text-transform:uppercase;">Сводка недели</span>
      <p style="font-size:14px;color:#e5e7eb;line-height:1.6;margin:6px 0 0;">${esc(week.summary).replace(/\n/g, '<br>')}</p>
    </div>`);
  }
  parts.push(`<p style="color:#9ca3af;font-size:14px;">За неделю вышло <b style="color:#ffffff;">${week.articlesCount}</b> материалов.</p>`);
  if (week.top.length) {
    parts.push(`<h2 style="font-size:15px;color:#ffffff;margin:18px 0 10px;">Топ недели по просмотрам</h2>`);
    parts.push(week.top.map((a) => articleRow(a, site).replace('</div>', `<span style="font-size:11px;color:#6b7280;"> · ${a.views} просмотров</span></div>`)).join(''));
  }
  if (week.subscribed.length) {
    parts.push(`<h2 style="font-size:15px;color:#ffffff;margin:18px 0 10px;">По вашим подпискам</h2>`);
    parts.push(week.subscribed.map((a) => articleRow(a, site)).join(''));
  }
  return SHELL(`Неделя на Инвестиционно.рф: итоги для вас, ${esc(name)}`, parts.join(''));
}
