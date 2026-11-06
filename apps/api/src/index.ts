import express from 'express';
import path from 'node:path';
import { config } from './config.js';
import { securityHeaders, corsAllowlist, apiLimiter, loginLimiter, registerLimiter, generateLimiter } from './middleware/security.js';
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

// В production запрет на дефолтный секрет — fail fast
if (process.env.NODE_ENV === 'production' && config.jwtSecret === 'dev-secret-change-me') {
  throw new Error('JWT_SECRET не задан (production). Остановка.');
}

const app = express();

// безопасность: заголовки + CORS-allowlist + лимиты
app.use(securityHeaders);
app.use(corsAllowlist(config.corsOrigins));
app.use('/api/', apiLimiter);
app.use('/api/auth/login', loginLimiter);
app.use('/api/auth/register', registerLimiter);
app.use('/api/media/generate', generateLimiter);

app.use(express.json({ limit: '2mb' }));

// загруженные/сгенерированные файлы (обложки)
app.use('/uploads', express.static(path.resolve(config.uploadDir)));

app.get('/api/health', (_req, res) => {
  res.json({ ok: true, service: 'newinvest-api' });
});

app.use('/api/auth', authRouter);
app.use('/api', bindingsRouter); // ПЕРЕД articlesRouter: пути /articles/:id/...
app.use('/api/articles', articlesRouter);
app.use('/api', entitiesRouter);   // /companies /tickers /industries /trends
app.use('/api', storiesRouter);    // /stories
app.use('/api', screenerRouter);   // /screener /deal-phases /deal-stages
app.use('/api', mediaRouter);      // /media/generate /media/upload /media
app.use('/api', adminRouter);      // /users /redirects /stats
app.use('/api', marketRouter);     // /market/chart
app.use('/api', cabinetRouter);    // /favorites /subscriptions /feed (auth)

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
});
