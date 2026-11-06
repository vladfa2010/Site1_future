import express from 'express';
import cors from 'cors';
import { config } from './config.js';
import { authRouter } from './routes/auth.js';
import { articlesRouter } from './routes/articles.js';
import { entitiesRouter } from './routes/entities.js';
import { storiesRouter } from './routes/stories.js';
import { bindingsRouter } from './routes/bindings.js';

const app = express();

app.use(cors());
app.use(express.json({ limit: '2mb' }));

app.get('/api/health', (_req, res) => {
  res.json({ ok: true, service: 'newinvest-api' });
});

app.use('/api/auth', authRouter);
app.use('/api', bindingsRouter); // ПЕРЕД articlesRouter: пути /articles/:id/...
app.use('/api/articles', articlesRouter);
app.use('/api', entitiesRouter);   // /companies /tickers /industries /trends
app.use('/api', storiesRouter);    // /stories

app.use((_req, res) => {
  res.status(404).json({ error: 'not found' });
});

// Единый обработчик ошибок
app.use((err: Error, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
  console.error('[api error]', err.message);
  res.status(500).json({ error: 'internal', message: err.message });
});

app.listen(config.port, () => {
  console.log(`API: http://localhost:${config.port}`);
});
