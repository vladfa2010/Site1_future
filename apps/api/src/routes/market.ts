/**
 * Котировки для графика на карточке идеи.
 * GET /api/market/chart?symbol=SBER — публично, кэш 15 мин.
 */
import { Router } from 'express';
import { getChart } from '../services/marketData.js';

export const marketRouter = Router();

marketRouter.get('/market/chart', async (req, res) => {
  const symbol = String(req.query.symbol ?? '').toUpperCase().trim();
  if (!symbol || symbol.length > 20) {
    res.status(400).json({ error: 'symbol required' });
    return;
  }
  try {
    const chart = await getChart(symbol);
    if (!chart) {
      res.status(404).json({ error: 'no data source for this symbol' });
      return;
    }
    res.json({ symbol, currency: chart.currency, points: chart.points });
  } catch (e) {
    res.status(502).json({ error: 'market data unavailable' });
    console.error('[market]', e);
  }
});
