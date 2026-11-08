import { test } from 'node:test';
import assert from 'node:assert/strict';
import { stripHtml, countWords, calcReadingTime } from './text-utils.js';

const words = (n: number) => Array.from({ length: n }, (_, i) => `слово${i + 1}`).join(' ');

test('stripHtml: вложенные теги и схлопывание пробелов', () => {
  assert.equal(stripHtml('<p>foo <b>bar</b></p>'), 'foo bar');
});

test('stripHtml: пустая строка', () => {
  assert.equal(stripHtml(''), '');
  assert.equal(countWords(''), 0);
});

test('calcReadingTime: пустой контент → 1 (защита max(1, …))', () => {
  assert.equal(calcReadingTime(''), 1);
  assert.equal(calcReadingTime('<p></p>'), 1);
});

test('calcReadingTime: границы округления при wpm=170', () => {
  assert.equal(calcReadingTime(`<p>${words(170)}</p>`), 1); // ровно 170 → 1 мин
  assert.equal(calcReadingTime(`<p>${words(171)}</p>`), 1); // чуть больше → round = 1
  assert.equal(calcReadingTime(`<p>${words(340)}</p>`), 2); // ровно 2 минуты
  assert.equal(calcReadingTime(`<p>${words(100)}</p>`), 1);
});

test('calcReadingTime: кастомный wpm', () => {
  assert.equal(calcReadingTime(words(340), 340), 1);
  assert.equal(calcReadingTime(words(341), 340), 1);
  assert.equal(calcReadingTime(words(680), 340), 2);
});

test('stripHtml: теги удаляются, текст сохраняется', () => {
  assert.equal(stripHtml('<h2>Заголовок</h2><p>Абзац <a href="/x">ссылка</a></p>'), 'Заголовок Абзац ссылка');
  // табличный HTML: числа считаются словами (завышенность зафиксирована в рисках ТЗ)
  assert.equal(countWords(stripHtml('<td>1</td><td>2</td>')), 2);
});

test('stripHtml: HTML-сущности НЕ декодируются (решение ТЗ R1)', () => {
  assert.equal(stripHtml('<p>a&nbsp;b</p>'), 'a&nbsp;b');
  assert.equal(countWords(stripHtml('<p>a&nbsp;b</p>')), 1); // &nbsp; — часть «слова»
});

test('calcReadingTime: длинный текст', () => {
  // 1700 слов ≈ 10 минут при wpm=170
  const html = `<article><p>${words(1700)}</p></article>`;
  assert.equal(calcReadingTime(html), 10);
  assert.equal(calcReadingTime(`<p>${words(8500)}</p>`), 50);
});
