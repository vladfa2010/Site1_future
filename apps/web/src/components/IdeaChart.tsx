import { useEffect, useState } from 'react';

interface Point { date: string; close: number }

/**
 * График котировок (SVG, без зависимостей) для карточки идеи.
 * Показываем только при наличии данных (принцип 4.3).
 */
export function IdeaChart({ symbol }: { symbol: string }) {
  const [data, setData] = useState<{ points: Point[]; currency: string } | null>(null);
  const [error, setError] = useState(false);

  useEffect(() => {
    setData(null);
    setError(false);
    fetch(`/api/market/chart?symbol=${encodeURIComponent(symbol)}`)
      .then((r) => (r.ok ? r.json() : Promise.reject()))
      .then(setData)
      .catch(() => setError(true));
  }, [symbol]);

  if (error) return null; // нет источника — не показываем блок

  const W = 640;
  const H = 180;
  const PAD = { l: 8, r: 56, t: 12, b: 20 };

  if (!data || data.points.length < 2) {
    return <div className="h-[180px] animate-pulse rounded-lg bg-zinc-900" />;
  }

  const pts = data.points;
  const min = Math.min(...pts.map((p) => p.close));
  const max = Math.max(...pts.map((p) => p.close));
  const range = max - min || 1;
  const iw = W - PAD.l - PAD.r;
  const ih = H - PAD.t - PAD.b;
  const xy = pts.map((p, i) => ({
    x: PAD.l + (i / (pts.length - 1)) * iw,
    y: PAD.t + ih - ((p.close - min) / range) * ih,
  }));
  const line = xy.map((p) => `${p.x.toFixed(1)},${p.y.toFixed(1)}`).join(' ');
  const area = `${PAD.l},${PAD.t + ih} ${line} ${PAD.l + iw},${PAD.t + ih}`;
  const up = pts[pts.length - 1].close >= pts[0].close;
  const color = up ? '#34D399' : '#EF4444';
  const fmt = (v: number) => v.toLocaleString('ru-RU', { maximumFractionDigits: 1 });

  return (
    <section>
      <div className="mb-2 flex items-baseline justify-between">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-zinc-500">
          {symbol} · 6 мес
        </h2>
        <span className="text-sm text-zinc-400">
          {fmt(pts[pts.length - 1].close)} {data.currency}
          <span className={up ? ' text-emerald-400' : ' text-red-400'}>
            {' '}
            ({up ? '+' : ''}
            {(((pts[pts.length - 1].close - pts[0].close) / pts[0].close) * 100).toFixed(1)}%)
          </span>
        </span>
      </div>
      <svg viewBox={`0 0 ${W} ${H}`} className="w-full rounded-lg border border-zinc-800 bg-zinc-900" role="img" aria-label={`График ${symbol}`}>
        <defs>
          <linearGradient id={`g-${symbol}`} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={color} stopOpacity="0.25" />
            <stop offset="100%" stopColor={color} stopOpacity="0" />
          </linearGradient>
        </defs>
        {[0, 0.5, 1].map((f) => (
          <line key={f} x1={PAD.l} x2={PAD.l + iw} y1={PAD.t + ih * f} y2={PAD.t + ih * f} stroke="#27272a" strokeWidth="1" />
        ))}
        <polygon points={area} fill={`url(#g-${symbol})`} />
        <polyline points={line} fill="none" stroke={color} strokeWidth="2" strokeLinejoin="round" />
        <text x={W - PAD.r + 8} y={PAD.t + 8} fontSize="11" fill="#71717a">{fmt(max)}</text>
        <text x={W - PAD.r + 8} y={PAD.t + ih} fontSize="11" fill="#71717a">{fmt(min)}</text>
        <text x={PAD.l} y={H - 6} fontSize="10" fill="#52525b">{pts[0].date}</text>
        <text x={PAD.l + iw} y={H - 6} fontSize="10" fill="#52525b" textAnchor="end">{pts[pts.length - 1].date}</text>
      </svg>
    </section>
  );
}
