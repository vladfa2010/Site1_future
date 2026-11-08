/**
 * SVG-графики без зависимостей: столбчатая диаграмма + линия.
 * Данные — series [{label, value}], опционально вторая линия (cumulative).
 */
export function BarChart({
  series,
  color = '#beff00',
  height = 140,
  line,
  lineColor = '#c9ff2a',
}: {
  series: { label: string; value: number }[];
  color?: string;
  height?: number;
  line?: number[];
  lineColor?: string;
}) {
  if (series.length === 0) return <p className="text-sm text-zinc-600">Нет данных за период.</p>;
  const max = Math.max(1, ...series.map((s) => s.value), ...(line ?? [0]));
  const w = 100 / series.length;
  const pts = (line ?? []).map((v, i) => `${(i + 0.5) * w},${height - (v / max) * (height - 16)}`).join(' ');

  return (
    <div>
      <svg viewBox={`0 0 100 ${height}`} preserveAspectRatio="none" className="w-full" style={{ height }}>
        {/* сетка */}
        {[0.25, 0.5, 0.75, 1].map((f) => (
          <line key={f} x1="0" x2="100" y1={height - f * (height - 16)} y2={height - f * (height - 16)} stroke="#27272a" strokeWidth="0.2" />
        ))}
        {series.map((s, i) => (
          <rect
            key={i}
            x={i * w + w * 0.15}
            y={height - (s.value / max) * (height - 16)}
            width={w * 0.7}
            height={(s.value / max) * (height - 16)}
            fill={color}
            opacity="0.75"
            rx="0.6"
          >
            <title>{`${s.label}: ${s.value}`}</title>
          </rect>
        ))}
        {line && <polyline points={pts} fill="none" stroke={lineColor} strokeWidth="0.5" opacity="0.9" />}
      </svg>
      <div className="mt-1 flex justify-between text-[10px] text-zinc-600">
        <span>{series[0].label}</span>
        <span>{series[series.length - 1].label}</span>
      </div>
    </div>
  );
}

/** Когортный retention — таблица-теплокарта */
export function RetentionTable({ cohorts, weeks }: {
  cohorts: { cohort: string; users: number; retention: number[] }[];
  weeks: string[];
}) {
  if (cohorts.length === 0) return <p className="text-sm text-zinc-600">Мало данных — нужно минимум неделя регистраций.</p>;
  const cellColor = (v: number) =>
    v === 0 ? 'bg-zinc-800/50 text-zinc-600'
    : v < 20 ? 'bg-[#beff00]/10 text-[#c9ff2a]'
    : v < 40 ? 'bg-[#beff00]/25 text-[#d6ff5c]'
    : 'bg-[#beff00]/45 text-zinc-950 font-semibold';
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-zinc-800 text-left text-xs text-zinc-500">
            <th className="th">Когорта (неделя)</th>
            <th className="th">Юзеров</th>
            {weeks.map((w) => <th key={w} className="th text-center">{w}</th>)}
          </tr>
        </thead>
        <tbody>
          {cohorts.map((c) => (
            <tr key={c.cohort} className="border-b border-zinc-800/50">
              <td className="td whitespace-nowrap text-zinc-400">{c.cohort}</td>
              <td className="td font-semibold">{c.users}</td>
              {c.retention.map((v, i) => (
                <td key={i} className="p-1 text-center">
                  <span className={`inline-block min-w-[44px] rounded px-1.5 py-1 text-xs ${cellColor(v)}`}>{v}%</span>
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
      <p className="mt-2 text-xs text-zinc-600">
        W0 — вернулись в неделю регистрации, W1 — через неделю и т.д. Доля когорты, совершившая просмотр.
      </p>
    </div>
  );
}
