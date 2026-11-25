/**
 * siteOrigin (services/botRender.ts) — выбор публичного origin для canonical/OG/sitemap.
 * Аудит 2026-11-14: Host-заголовку НЕ доверяем (host-header poisoning) — принимаем
 * только хост PUBLIC_SITE_URL и loopback (dev); всё прочее → канонический origin из env.
 * Тесты манипулируют process.env — исходные значения восстанавливаются после прогона.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';

import { siteOrigin } from '../src/services/botRender.js';

const ENV_KEYS = ['PUBLIC_SITE_URL', 'PORT'] as const;
const saved: Record<string, string | undefined> = {};
for (const k of ENV_KEYS) saved[k] = process.env[k];
function setEnv(patch: Partial<Record<(typeof ENV_KEYS)[number], string>>) {
  for (const k of ENV_KEYS) {
    if (k in patch) process.env[k] = patch[k];
    else delete process.env[k];
  }
}
test.after(() => {
  for (const k of ENV_KEYS) {
    if (saved[k] === undefined) delete process.env[k];
    else process.env[k] = saved[k];
  }
});

test('siteOrigin: пустой/отсутствующий Host → канонический origin из env', () => {
  setEnv({ PUBLIC_SITE_URL: 'https://xn--b1aghca0aeahc1am7c.xn--p1ai' });
  assert.equal(siteOrigin(undefined), 'https://xn--b1aghca0aeahc1am7c.xn--p1ai');
  assert.equal(siteOrigin(''), 'https://xn--b1aghca0aeahc1am7c.xn--p1ai');
  assert.equal(siteOrigin('   '), 'https://xn--b1aghca0aeahc1am7c.xn--p1ai');
});

test('siteOrigin: Host равен хосту PUBLIC_SITE_URL — принимается (регистронезависимо)', () => {
  setEnv({ PUBLIC_SITE_URL: 'https://example.com' });
  assert.equal(siteOrigin('example.com'), 'https://example.com');
  assert.equal(siteOrigin('EXAMPLE.COM'), 'https://example.com');
});

test('siteOrigin: trailing slash у PUBLIC_SITE_URL не попадает в origin', () => {
  setEnv({ PUBLIC_SITE_URL: 'https://example.com/' });
  assert.equal(siteOrigin('example.com'), 'https://example.com');
});

test('siteOrigin: чужой Host (host-header poisoning) → канонический origin, НЕ чужой', () => {
  setEnv({ PUBLIC_SITE_URL: 'https://example.com' });
  assert.equal(siteOrigin('evil-attacker.ru'), 'https://example.com');
  assert.equal(siteOrigin('example.com.evil.ru'), 'https://example.com');
});

test('siteOrigin: loopback-хосты принимаются как dev-origin', () => {
  setEnv({ PUBLIC_SITE_URL: 'https://example.com' });
  assert.equal(siteOrigin('localhost'), 'http://localhost');
  assert.equal(siteOrigin('127.0.0.1'), 'http://127.0.0.1');
});

test('siteOrigin: без env — fallback на localhost с учётом PORT', () => {
  setEnv({ PORT: '4000' });
  assert.equal(siteOrigin(undefined), 'http://localhost:4000');
  assert.equal(siteOrigin('localhost'), 'http://localhost');
  setEnv({});
  assert.equal(siteOrigin(undefined), 'http://localhost:4000'); // PORT уже удалён — дефолт 4000
});
