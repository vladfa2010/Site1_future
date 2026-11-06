/**
 * Telegram-контур (механика как в PULSE, deep-link вариант):
 * - юзер жмёт «Подключить» → GET /api/telegram/link → deep-link t.me/<bot>?start=<code>
 * - бот ловит /start <code> (long polling) → привязка chat_id ↔ user_id
 * - фронт поллит GET /api/telegram/status, пока не connected
 * - дайджесты шлём sendMessage в ЛС бота
 * Без TG_BOT_TOKEN фича выключена (graceful).
 */
import { and, eq, isNull, gt } from 'drizzle-orm';
import { randomBytes } from 'node:crypto';
import { db, tgBindings, tgLinkCodes, users } from '@newinvest/db';

const API = 'https://api.telegram.org';

export function tgEnabled(): boolean {
  return Boolean(process.env.TG_BOT_TOKEN);
}

async function tgCall<T>(method: string, body: Record<string, unknown>): Promise<T> {
  const res = await fetch(`${API}/bot${process.env.TG_BOT_TOKEN}/${method}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  const data = (await res.json()) as { ok: boolean; result: T; description?: string };
  if (!data.ok) throw new Error(`TG ${method}: ${data.description ?? res.status}`);
  return data.result;
}

export const sendTelegramMessage = (chatId: string, text: string) =>
  tgCall('sendMessage', { chat_id: chatId, text, parse_mode: 'HTML', disable_web_page_preview: true });

// ---------- привязка ----------

export async function createLinkCode(userId: number): Promise<string | null> {
  if (!tgEnabled()) return null;
  const code = randomBytes(8).toString('hex');
  await db.insert(tgLinkCodes).values({
    code,
    userId,
    expiresAt: new Date(Date.now() + 10 * 60_000),
  });
  const me = await tgCall<{ username: string }>('getMe', {}).catch(() => null);
  const username = process.env.TG_BOT_USERNAME ?? me?.username;
  return username ? `https://t.me/${username}?start=${code}` : null;
}

export async function tgStatus(userId: number): Promise<{ connected: boolean; chatId: string | null; tgUsername: string | null }> {
  const [row] = await db.select().from(tgBindings).where(eq(tgBindings.userId, userId)).limit(1);
  return { connected: Boolean(row), chatId: row?.chatId ?? null, tgUsername: row?.tgUsername ?? null };
}

export async function disconnect(userId: number): Promise<void> {
  await db.delete(tgBindings).where(eq(tgBindings.userId, userId));
}

// ---------- long polling бота ----------

let offset = 0;
let polling = false;

async function handleUpdate(update: {
  message?: { chat: { id: number }; from?: { username?: string }; text?: string };
}) {
  const msg = update.message;
  if (!msg?.text) return;
  const chatId = String(msg.chat.id);

  if (msg.text.startsWith('/start')) {
    const code = msg.text.split(/\s+/)[1] ?? '';
    const [link] = await db.select().from(tgLinkCodes)
      .where(and(eq(tgLinkCodes.code, code), isNull(tgLinkCodes.usedAt), gt(tgLinkCodes.expiresAt, new Date())))
      .limit(1);
    if (!link) {
      await sendTelegramMessage(chatId, 'Привет! Это бот Инвестиционно.рф. Чтобы получать дайджесты, подключите бота в личном кабинете на сайте.').catch(() => {});
      return;
    }
    await db.insert(tgBindings)
      .values({ userId: link.userId, chatId, tgUsername: msg.from?.username ?? null })
      .onConflictDoUpdate({ target: tgBindings.userId, set: { chatId, tgUsername: msg.from?.username ?? null } });
    await db.update(tgLinkCodes).set({ usedAt: new Date() }).where(eq(tgLinkCodes.code, code));
    const [user] = await db.select({ displayName: users.displayName }).from(users).where(eq(users.id, link.userId)).limit(1);
    await sendTelegramMessage(chatId, `✅ Подключено! ${user?.displayName ?? 'Добро пожаловать'}, дайджесты по вашим подпискам будут приходить сюда. Отключиться: команда /stop или в кабинете на сайте.`).catch(() => {});
    return;
  }

  if (msg.text.startsWith('/stop')) {
    await db.delete(tgBindings).where(eq(tgBindings.chatId, chatId));
    await sendTelegramMessage(chatId, 'Отключено. Возвращайтесь!').catch(() => {});
  }
}

export function startTelegramPolling(): void {
  if (!tgEnabled() || polling) return;
  polling = true;
  console.log('[tg] bot polling started');
  const tick = async () => {
    try {
      const updates = await tgCall<{ update_id: number; message?: { chat: { id: number }; from?: { username?: string }; text?: string } }[]>('getUpdates', {
        offset,
        timeout: 30,
      });
      for (const u of updates) {
        offset = u.update_id + 1;
        await handleUpdate(u).catch((e) => console.error('[tg] update error:', e.message));
      }
    } catch (e) {
      console.error('[tg] polling error:', (e as Error).message);
      await new Promise((r) => setTimeout(r, 5000));
    }
    if (polling) void tick();
  };
  void tick();
}
