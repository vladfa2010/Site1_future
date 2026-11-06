import type { FundingRound } from '../api';

/**
 * Таблица раундов (питчбук-лайт).
 * Принцип 4.3: компонент используется ТОЛЬКО когда раунды есть —
 * родитель не рендерит ни заголовка, ни пустой таблицы.
 */
export function RoundsTable({ rounds }: { rounds: FundingRound[] }) {
  return (
    <section>
      <h2 className="mb-3 text-xl font-bold">Раунды и оценки</h2>
      <div className="overflow-x-auto rounded-lg border border-zinc-800">
        <table className="w-full text-sm">
          <thead className="bg-zinc-900 text-left text-zinc-400">
            <tr>
              <th className="p-3">Дата</th>
              <th className="p-3">Раунд</th>
              <th className="p-3">Сумма</th>
              <th className="p-3">Оценка (post-money)</th>
              <th className="p-3">Инвесторы</th>
              <th className="p-3">Источник</th>
            </tr>
          </thead>
          <tbody>
            {rounds.map((r) => (
              <tr key={r.id} className="border-t border-zinc-800">
                <td className="p-3 whitespace-nowrap">{r.date ?? '—'}</td>
                <td className="p-3">{r.stage ?? '—'}</td>
                <td className="p-3">
                  {r.amount ? `${Number(r.amount).toLocaleString('ru-RU')} ${r.currency ?? ''}` : '—'}
                </td>
                <td className="p-3">{r.postMoneyValuation ? Number(r.postMoneyValuation).toLocaleString('ru-RU') : '—'}</td>
                <td className="p-3">{r.investors?.join(', ')}</td>
                <td className="p-3">
                  <a href={r.sourceUrl} target="_blank" rel="noreferrer" className="text-xs">
                    ссылка
                  </a>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}
