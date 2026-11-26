/**
 * ТЗ-защита от вечных зависаний (2026-11-26): rejected promise в async-роуте
 * должна уходить в error-middleware → 500, а не молчать вечно.
 * Импорт патча — побочный эффект (самовыполняющийся модуль).
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import express from 'express';
import '../src/middleware/asyncHandler.js';

async function withServer(fn: (port: number) => Promise<void>): Promise<void> {
  const app = express();
  app.use(express.json());
  app.get('/boom', async () => {
    throw new Error('async boom');
  });
  app.get('/ok', async (_req, res) => {
    res.json({ ok: true });
  });
  app.use((_req, res) => {
    res.status(404).json({ error: 'not found' });
  });
  app.use((err: Error, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
    res.status(500).json({ error: 'internal', message: err.message });
  });
  const server = await new Promise<ReturnType<typeof app.listen>>((resolve) => {
    const s = app.listen(0, () => resolve(s));
  });
  const port = (server.address() as { port: number }).port;
  try {
    await fn(port);
  } finally {
    await new Promise<void>((resolve) => server.close(() => resolve()));
  }
}

test('async-ошибка в роуте → 500 из error-middleware (не зависание)', async () => {
  await withServer(async (port) => {
    const res = await fetch(`http://127.0.0.1:${port}/boom`);
    assert.equal(res.status, 500);
    const body = (await res.json()) as { error: string; message: string };
    assert.equal(body.error, 'internal');
    assert.equal(body.message, 'async boom');
  });
});

test('async-роут без ошибки работает штатно', async () => {
  await withServer(async (port) => {
    const res = await fetch(`http://127.0.0.1:${port}/ok`);
    assert.equal(res.status, 200);
    assert.deepEqual(await res.json(), { ok: true });
  });
});
