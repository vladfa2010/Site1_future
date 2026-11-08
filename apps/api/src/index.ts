import express from 'express';
import path from 'node:path';
import cron from 'node-cron';
import { config } from './config.js';
import { securityHeaders, corsAllowlist, apiLimiter, loginLimiter, registerLimiter, generateLimiter, generateTextLimiter, telegramLinkLimiter, searchLimiter } from './middleware/security.js';
import { runDailyDigest, runWeeklyReport } from './services/digest.js';
import { startTelegramPolling } from './services/telegram.js';
import { authRouter } from './routes/auth.js';
import { articlesRouter } from './routes/articles.js';
import { entitiesRouter } from './routes/entities.js';
import { storiesRouter } from './routes/stories.js';
import { bindingsRouter } from './routes/bindings.js';
import { screenerRouter } from './routes/screener.js';
import { mediaRouter } from './routes/media.js';
import { adminRouter } from './routes/admin.js';
import { marketRouter } from './routes/market.js';
import { cabinetRouter } from './routes/cabinet.js';
import { featuresRouter } from './routes/features.js';
import { searchRouter } from './routes/search.js';
import { kimiSettingsRouter } from './routes/kimiSettings.js';

// В production запрет на дефолтный секрет — fail fast
if (process.env.NODE_ENV === 'production' && config.jwtSecret === 'dev-secret-change-me') {
  throw new Error('JWT_SECRET не задан (production). Остановка.');
}

const app = express();

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

app.use(express.json({ limit: '2mb' }));

// загруженные/сгенерированные файлы (обложки)
app.use('/uploads', express.static(path.resolve(config.uploadDir)));

app.get('/api/health', (_req, res) => {
  res.json({ ok: true, service: 'newinvest-api' });
});

app.use('/api/auth', authRouter);
app.use('/api', bindingsRouter); // ПЕРЕД articlesRouter: пути /articles/:id/...
app.use('/api/articles', articlesRouter);
app.use('/api/search', searchRouter);
app.use('/api', kimiSettingsRouter); // /admin/kimi-settings — ПЕРЕД cabinet (у него router-wide auth)
app.use('/api', entitiesRouter);   // /companies /tickers /industries /trends
app.use('/api', storiesRouter);    // /stories
app.use('/api', screenerRouter);   // /screener /deal-phases /deal-stages
app.use('/api', mediaRouter);      // /media/generate /media/upload /media
app.use('/api', adminRouter);      // /users /redirects /stats
app.use('/api', marketRouter);     // /market/chart
app.use('/api', featuresRouter);   // /features + /admin/features (ПЕРЕД cabinet: у него router-wide auth)
app.use('/api', cabinetRouter);    // /favorites /subscriptions /feed (auth) — ПОСЛЕДНИЙ: router.use(authRequired)

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
  if (!process.env.RESEND_API_KEY) {
    console.log('[notifications] RESEND_API_KEY не задан — email-дайджесты отключены');
  }
  startTelegramPolling(); // no-op без TG_BOT_TOKEN
});
