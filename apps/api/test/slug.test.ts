/**
 * Утилиты slug (apps/api/src/utils/slug.ts):
 *  - slugify — транслитерация заголовка в slug (стиль донора: й→j, щ→shh,
 *    ю→ju, я→ja; дубли — суффиксом -2, -3, это uniqueSlug с БД, здесь не тестируем);
 *  - plainTextToHtml — текст пользователя → безопасный HTML (только абзацы),
 *    экранирование < > обязательно: это единственная защита от XSS в комментариях.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';

import { slugify, plainTextToHtml } from '../src/utils/slug.js';

// ---------- slugify ----------

test('slugify: русский заголовок → транслит в стиле донора', () => {
  // реальный slug из репозитория: cand_jadernye-kosmicheskie-dvigateli-shans
  assert.equal(slugify('Ядерные космические двигатели: шанс'), 'jadernye-kosmicheskie-dvigateli-shans');
  assert.equal(slugify('Спутники'), 'sputniki');
});

test('slugify: специфика карты (й→j, щ→shh, ю→ju, я→ja, ё→e)', () => {
  assert.equal(slugify('Й'), 'j');
  assert.equal(slugify('Щ'), 'shh');
  assert.equal(slugify('Ю'), 'ju');
  assert.equal(slugify('Я'), 'ja');
  assert.equal(slugify('ёлка'), 'elka'); // ё → e
  assert.equal(slugify('бъём'), 'bem');  // ъ/ь → пусто
});

test('slugify: пробелы и знаки препинания схлопываются в один дефис', () => {
  assert.equal(slugify('SpaceX 2: новый запуск!'), 'spacex-2-novyj-zapusk');
  assert.equal(slugify('a & b'), 'a-b');
  assert.equal(slugify('  обрезка  краёв  '), 'obrezka-kraev'); // ё → e
});

test('slugify: длина не более 80 символов', () => {
  const long = slugify('Очень длинный заголовок '.repeat(20));
  assert.ok(long.length <= 80, `длина ${long.length} > 80`);
  assert.ok(long.length > 0);
});

test('slugify: только символы без букв/цифр → пустая строка', () => {
  assert.equal(slugify('!!!'), '');
  assert.equal(slugify(''), '');
});

// ---------- plainTextToHtml ----------

test('plainTextToHtml: абзацы по пустой строке; одиночный \\n остаётся внутри абзаца', () => {
  // порядок замен в коде: сначала \\n → <br>, затем < > экранируются —
  // внутриабзацный перенос показывается как литеральный текст (зафиксировано как есть)
  assert.equal(
    plainTextToHtml('Первый абзац\nсо строкой\n\nВторой абзац'),
    '<p>Первый абзац&lt;br&gt;со строкой</p><p>Второй абзац</p>',
  );
  assert.equal(plainTextToHtml('Один абзац'), '<p>Один абзац</p>');
});

test('plainTextToHtml: < и > экранируются (защита от XSS-инъекции тегов)', () => {
  assert.equal(
    plainTextToHtml('<script>alert(1)</script>'),
    '<p>&lt;script&gt;alert(1)&lt;/script&gt;</p>',
  );
  assert.equal(plainTextToHtml('a < b > c'), '<p>a &lt; b &gt; c</p>');
});

test('plainTextToHtml: пустой ввод и только пробелы → пустая строка', () => {
  assert.equal(plainTextToHtml(''), '');
  assert.equal(plainTextToHtml('  \n\n  '), '');
});
