/**
 * Датовые утилиты bot-рендера (utils/html.ts) — ветки, не покрытые seo.test.ts:
 *  - toW3CDate принимает Date | string: pg возвращает timestamp СТРОКОЙ,
 *    и эта ветка — рабочий путь для <lastmod> в sitemap;
 *  - formatRuDate — русская дата для <body> («8 ноября 2026»), считается по UTC.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';

import { toW3CDate, formatRuDate } from '../src/utils/html.js';

test('toW3CDate: строка из pg парсится как дата, миллисекунды срезаны', () => {
  // явный оффсет — детерминировано независимо от TZ машины прогона
  assert.equal(toW3CDate('2026-11-08T12:00:00.123+05:00'), '2026-11-08T07:00:00Z');
  assert.equal(toW3CDate('2026-11-08T12:00:00.123Z'), '2026-11-08T12:00:00Z');
  // формат pg «YYYY-MM-DD HH:MM:SS.mmm» (без оффсета) парсится как локальное время
  const pgExpected = new Date('2026-11-08 12:00:00.123').toISOString().replace(/\.\d{3}Z$/, 'Z');
  assert.equal(toW3CDate('2026-11-08 12:00:00.123'), pgExpected);
});

test('toW3CDate: невалидная строка → RangeError Invalid time value (явно, без молчаливого мусора)', () => {
  assert.throws(() => toW3CDate('not-a-date'), RangeError);
});

test('formatRuDate: русские названия месяцев, день без ведущего нуля, по UTC', () => {
  assert.equal(formatRuDate(new Date('2026-11-08T12:00:00Z')), '8 ноября 2026');
  assert.equal(formatRuDate(new Date('2026-01-01T00:00:00Z')), '1 января 2026');
  assert.equal(formatRuDate(new Date('2024-02-29T23:59:59Z')), '29 февраля 2024');
  // граница: 31 декабря 23:xx UTC должно остаться 31 декабря (UTC, не локаль)
  assert.equal(formatRuDate(new Date('2026-12-31T23:30:00Z')), '31 декабря 2026');
});
