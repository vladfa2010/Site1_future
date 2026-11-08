/**
 * GET /render?path=<url-path> — внутренний эндпоинт bot-рендера (ТЗ-10 §6.1).
 *
 * Отдаёт готовый HTML для поисковых/соцботов. Доступ:
 * - production: ТОЛЬКО с заголовком X-Bot-Render: 1 (его ставит Caddy в
 *   handle @bots) — иначе 404. Защита от «человеческого» обхода /render
 *   как обхода пейволла через текст.
 * - dev (NODE_ENV !== 'production'): заголовок не требуется — прямые проверки
 *   через localhost:4000/render?path=... работают без Caddy.
 *
 * Первым шагом — серверные 301 из таблицы redirects (WP-миграция): бот,
 * пришедший по старому URL, получает настоящий 301 и вес страницы передаётся.
 * Неподдерживаемые/непубличные пути → 404 (боту не отдаём SPA-скелет с 200).
 *
 * UA не ограничивает доступ (решает заголовок), но логируется с классом
 * бота — наблюдаемость (§6.1 «UA-детект внутри API»).
 */
import { Router } from 'express';
import { renderPath, siteOrigin } from '../services/botRender.js';
import { botClass } from '../services/botUa.js';

export const renderRouter = Router();

renderRouter.get('/', async (req, res) => {
  // защита заголовком: в prod /render без X-Bot-Render не существует
  if (process.env.NODE_ENV === 'production' && req.headers['x-bot-render'] !== '1') {
    res.status(404).json({ error: 'not found' });
    return;
  }

  const rawPath = typeof req.query.path === 'string' ? req.query.path : '';
  if (!rawPath) {
    res.status(404).json({ error: 'not found' });
    return;
  }

  const ua = req.headers['user-agent'];
  const cls = botClass(ua);
  console.log(`[bot-render] ${cls ?? 'unknown'} "${ua ?? ''}" path=${rawPath}`);

  const origin = siteOrigin(req.headers.host);
  try {
    const result = await renderPath(rawPath, origin);
    if (result.status === 404) {
      res.status(404).json({ error: 'not found' });
      return;
    }
    if (result.status !== 200) {
      // серверные 301 из redirects: только заголовок, без тела (§6.1)
      res.redirect(result.status, result.location);
      return;
    }
    res.status(200).type('text/html; charset=utf-8').send(result.html);
  } catch (e) {
    // Express 4 не ловит async-ошибки — без catch упавший рендер ронял бы весь API
    console.error('[bot-render]', e);
    res.status(500).json({ error: 'internal' });
  }
});
