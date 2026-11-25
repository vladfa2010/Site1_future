/**
 * Определение формата растра по магическим байтам (utils/imageSniff.ts).
 * Аудит 2026-11-14: content-type заголовку НЕ доверяем (подделывается) — формат
 * определяется только по сигнатуре файла; SVG (active content) сюда не проходит.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';

import { sniffImageFormat, mimeFor, extFor } from '../src/utils/imageSniff.js';

test('sniffImageFormat: PNG по сигнатуре ‰PNG', () => {
  // реальная PNG-сигнатура: 89 50 4E 47 0D 0A 1A 0A
  const png = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 0]);
  assert.equal(sniffImageFormat(png), 'png');
});

test('sniffImageFormat: JPEG по FF D8 FF', () => {
  const jpg = Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10, 0x4a, 0x46, 0x49, 0x46]);
  assert.equal(sniffImageFormat(jpg), 'jpg');
});

test('sniffImageFormat: WebP по RIFF…WEBP', () => {
  const buf = Buffer.alloc(16);
  buf.write('RIFF', 0, 'ascii');
  buf.write('WEBP', 8, 'ascii');
  assert.equal(sniffImageFormat(buf), 'webp');
});

test('sniffImageFormat: SVG/текст/мусор/пусто → null (не растр — не раздаём)', () => {
  assert.equal(sniffImageFormat(Buffer.from('<svg xmlns="http://www.w3.org/2000/svg"></svg>')), null);
  assert.equal(sniffImageFormat(Buffer.from('plain text')), null);
  assert.equal(sniffImageFormat(Buffer.from([0x00, 0x01, 0x02])), null);
  assert.equal(sniffImageFormat(Buffer.alloc(0)), null);
});

test('sniffImageFormat: RIFF без WEBP — не webp', () => {
  const buf = Buffer.alloc(16);
  buf.write('RIFF', 0, 'ascii');
  buf.write('WAVE', 8, 'ascii');
  assert.equal(sniffImageFormat(buf), null);
});

test('mimeFor/extFor: jpg → image/jpeg (не image/jpg)', () => {
  assert.equal(mimeFor('jpg'), 'image/jpeg');
  assert.equal(mimeFor('png'), 'image/png');
  assert.equal(mimeFor('webp'), 'image/webp');
  assert.equal(extFor('jpg'), 'jpg');
  assert.equal(extFor('webp'), 'webp');
});
