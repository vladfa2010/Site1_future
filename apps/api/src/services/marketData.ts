/**
 * Котировки: MOEX ISS (бесплатно, без ключа) для бумаг Московской биржи.
 * Кэш в памяти 15 мин. Источник для нероссийских бумаг — подключим
 * позже (Finam Trade API из PULSE, когда дадим credentials).
 */
import { eq } from 'drizzle-orm';
import { db, tickers } from '@newinvest/db';

export interface ChartPoint {
  date: string; // YYYY-MM-DD
  close: number;
}

const cache = new Map<string, { ts: number; data: ChartPoint[]; currency: string }>();
const CACHE_TTL = 15 * 60_000;

async function moexCandles(symbol: string): Promise<{ points: ChartPoint[]; currency: string } | null> {
  const till = new Date().toISOString().slice(0, 10);
  const from = new Date(Date.now() - 190 * 86400_000).toISOString().slice(0, 10); // ~6 мес
  const url = `https://iss.moex.com/iss/engines/stock/markets/shares/securities/${encodeURIComponent(symbol)}/candles.json?interval=24&from=${from}&till=${till}`;
  const res = await fetch(url, { signal: AbortSignal.timeout(10_000) });
  if (!res.ok) throw new Error(`MOEX ISS: ${res.status}`);
  const json = (await res.json()) as {
    candles: { columns: string[]; data: unknown[][] };
    'candles:currency'?: string;
  };
  const cols = json.candles.columns;
  const iClose = cols.indexOf('close');
  const iBegin = cols.indexOf('begin');
  const points: ChartPoint[] = json.candles.data
    .map((row) => ({ date: String(row[iBegin]).slice(0, 10), close: Number(row[iClose]) }))
    .filter((p) => Number.isFinite(p.close))
    .sort((a, b) => (a.date < b.date ? -1 : 1));
  if (points.length === 0) return null; // бумаги нет на MOEX — не ошибка, просто нет данных
  return { points, currency: 'RUB' };
}

/** Котировки по символу тикера из нашей БД. null — источника нет. */
export async function getChart(symbol: string): Promise<{ points: ChartPoint[]; currency: string } | null> {
  const [t] = await db.select().from(tickers).where(eq(tickers.symbol, symbol)).limit(1);
  if (!t) return null;

  const cached = cache.get(symbol);
  if (cached && Date.now() - cached.ts < CACHE_TTL) {
    return { points: cached.data, currency: cached.currency };
  }

  if (t.exchange === 'MOEX' || t.exchange === null) {
    // null exchange — миграция не заполняла биржу; пробуем MOEX (чужие бумаги → null → 404)
    const result = await moexCandles(t.symbol);
    if (!result) return null;
    cache.set(symbol, { ts: Date.now(), data: result.points, currency: result.currency });
    return result;
  }
  return null; // NASDAQ/NYSE/HKEX — ждём Finam credentials
}
