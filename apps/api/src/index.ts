import express from 'express';
import path from 'node:path';
import cron from 'node-cron';
import { config } from './config.js';
import { securityHeaders, corsAllowlist, apiLimiter, loginLimiter, registerLimiter, generateLimiter, generateTextLimiter, telegramLinkLimiter, searchLimiter, renderLimiter } from './middleware/security.js';
import { runDailyDigest, runWeeklyReport } from './services/digest.js';
import { runViewsBump } from './services/viewsBump.js';
import { startTelegramPolling } from './services/telegram.js';
import { renderRouter } from './routes/render.js';
import { seoRouter } from './routes/seo.js';
import { authRouter } from './routes/auth.js';
import { articlesRouter } from './routes/articles.js';
import { authorsRouter } from './routes/authors.js';
import { entitiesRouter } from './routes/entities.js';
import { storiesRouter } from './routes/stories.js';
import { bindingsRouter } from './routes/bindings.js';
import { engagementRouter } from './routes/engagement.js';
import { screenerRouter } from './routes/screener.js';
import { mediaRouter } from './routes/media.js';
import { adminRouter } from './routes/admin.js';
import { marketRouter } from './routes/market.js';
import { cabinetRouter } from './routes/cabinet.js';
import { featuresRouter } from './routes/features.js';
import { adminPlansRouter } from './routes/adminPlans.js';
import { searchRouter } from './routes/search.js';
import { kimiSettingsRouter } from './routes/kimiSettings.js';
import { metricsRouter } from './routes/metrics.js';
import { trendingRouter } from './routes/trending.js';

// В production запрет на дефолтный секрет — fail fast
if (process.env.NODE_ENV === 'production' && config.jwtSecret === 'dev-secret-change-me') {
  throw new Error('JWT_SECRET не задан (production). Остановка.');
}

const app = express();
app.disable('x-powered-by'); // фингерпринт (аудит 2026-11-08)

// Доверяем X-Forwarded-For ТОЛЬКО от внутренних сетей (Caddy/vite-proxy в Docker и dev).
// Без этого за прокси rate limit склеивает всех клиентов в один IP (DoS, аудит 2026-11-08);
// с trust proxy=1 аноним напрямую мог бы подделать X-Forwarded-For — поэтому scoped.
app.set('trust proxy', ['loopback', 'linklocal', 'uniquelocal']);

// безопасность: заголовки + CORS-allowlist + лимиты
app.use(securityHeaders);
app.use(corsAllowlist(config.corsOrigins));
app.use('/api/', apiLimiter);
app.use('/api/auth/login', loginLimiter);
app.use('/api/auth/register', registerLimiter);
app.use('/api/media/generate', generateLimiter);
app.use('/api/media/generate-text', generateTextLimiter);
app.use('/api/telegram/link', telegramLinkLimiter);
app.use('/api/search', searchLimiter);
// ТЗ-10: bot-рендер — вне /api/-лимитеров, со своим лёгким лимитом
app.use('/render', renderLimiter);

app.use(express.json({ limit: '2mb' }));

// загруженные/сгенерированные файлы (обложки)
app.use('/uploads', express.static(path.resolve(config.uploadDir)));

app.get('/api/health', (_req, res) => {
  res.json({ ok: true, service: 'newinvest-api' });
});

app.use('/api/auth', authRouter);
app.use('/api', bindingsRouter); // ПЕРЕД articlesRouter: пути /articles/:id/...
app.use('/api', engagementRouter); // ТЗ-04: /articles/:id/like|share — ПЕРЕД articlesRouter (тот же конфликт :id vs :type)
app.use('/api/articles', articlesRouter);
app.use('/api/authors', authorsRouter); // ТЗ-05: публичный профиль автора (ПЕРЕД cabinet: у него router-wide auth)
app.use('/api/search', searchRouter);
app.use('/api', kimiSettingsRouter); // /admin/kimi-settings — ПЕРЕД cabinet (у него router-wide auth)
app.use('/api', metricsRouter);      // /admin/metrics/* — ПЕРЕД cabinet
app.use('/api/trending', trendingRouter); // ТЗ-07: публичный топ просмотров, без guard'ов
app.use('/api', entitiesRouter);   // /companies /tickers /industries /trends
app.use('/api', storiesRouter);    // /stories
app.use('/api', screenerRouter);   // /screener /deal-phases /deal-stages
app.use('/api', mediaRouter);      // /media/generate /media/upload /media
app.use('/api', adminRouter);      // /users /redirects /stats
app.use('/api', marketRouter);     // /market/chart
app.use('/api', featuresRouter);   // /features + /admin/features (ПЕРЕД cabinet: у него router-wide auth)
app.use('/api/admin/plans', adminPlansRouter); // админка тарифов (новая модель subscription_plans)
app.use('/api', cabinetRouter);    // /favorites /subscriptions /feed (auth) — ПОСЛЕДНИЙ: router.use(authRequired)

// ТЗ-10: bot-рендер + sitemap/robots — ПЕРЕД 404-хэндлером и вне /api/ (Caddy шлёт сюда напрямую)
app.use('/render', renderRouter);
app.use(seoRouter);

app.use((_req, res) => {
  res.status(404).json({ error: 'not found' });
});

// Единый обработчик ошибок: НЕ leak'им внутренние детали клиенту
app.use((err: Error, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
  console.error('[api error]', err.message);
  res.status(500).json({ error: 'internal' });
});

app.listen(config.port, () => {
  console.log(`API: http://localhost:${config.port}`);
  // Дайджесты: ежедневно 20:00, недельный репорт — воскресенье 20:00
  cron.schedule('0 20 * * *', () => {
    void runDailyDigest().then((r) => console.log('[cron] daily digest:', r)).catch((e) => console.error('[cron] daily', e));
  });
  cron.schedule('0 20 * * 0', () => {
    void runWeeklyReport().then((r) => console.log('[cron] weekly report:', r)).catch((e) => console.error('[cron] weekly', e));
  });
  // ТЗ-03: автодокрутка просмотров — раз в час на 7-й минуте (не :00/:30 — не совпадает с дайджестами)
  cron.schedule('7 * * * *', () => {
    void runViewsBump().then((r) => console.log(`[cron] views bump: ${r.processed}`)).catch((e) => console.error('[cron] views bump', e));
  });
  if (!process.env.RESEND_API_KEY) {
    console.log('[notifications] RESEND_API_KEY не задан — email-дайджесты отключены');
  }
  startTelegramPolling(); // no-op без TG_BOT_TOKEN
});
