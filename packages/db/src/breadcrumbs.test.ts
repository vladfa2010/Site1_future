import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildBreadcrumbList, serializeJsonLd } from './breadcrumbs.js';

const ORIGIN = 'https://example.com';

test('buildBreadcrumbList: позиции с 1, последний элемент БЕЗ item', () => {
  const list = buildBreadcrumbList(
    [
      { label: 'Главная', to: '/' },
      { label: 'Новость', to: '/novost' },
      { label: 'Полный заголовок материала' },
    ],
    ORIGIN,
  );
  assert.equal(list['@context'], 'https://schema.org');
  assert.equal(list['@type'], 'BreadcrumbList');
  assert.equal(list.itemListElement.length, 3);
  assert.deepEqual(list.itemListElement.map((e) => e.position), [1, 2, 3]);
  assert.equal(list.itemListElement[0].item, `${ORIGIN}/`);
  assert.equal(list.itemListElement[1].item, `${ORIGIN}/novost`);
  // последний — только name, ключа item нет (правка ревью v2.1 №4)
  assert.equal(list.itemListElement[2].name, 'Полный заголовок материала');
  assert.ok(!('item' in list.itemListElement[2]));
});

test('buildBreadcrumbList: абсолютный URL собирается из origin + to', () => {
  const list = buildBreadcrumbList(
    [{ label: 'Главная', to: '/' }, { label: 'Идея', to: '/ideya' }, { label: 'X' }],
    'https://xn--b1aghca0aeahc1am7c.xn--p1ai',
  );
  assert.equal(list.itemListElement[0].item, 'https://xn--b1aghca0aeahc1am7c.xn--p1ai/');
  assert.equal(list.itemListElement[1].item, 'https://xn--b1aghca0aeahc1am7c.xn--p1ai/ideya');
});

test('buildBreadcrumbList: непоследний без to (Тренды/Сюжеты) — тоже без item', () => {
  const list = buildBreadcrumbList(
    [{ label: 'Главная', to: '/' }, { label: 'Тренды' }, { label: 'ИИ в медицине', to: '/trend/ai-medicina' }],
    ORIGIN,
  );
  assert.ok(!('item' in list.itemListElement[1])); // «Тренды» — непоследний без to
  // последний — без item даже при наличии to (правка ревью v2.1 №4)
  assert.ok(!('item' in list.itemListElement[2]));
  // trailing slash у origin не дублируется
  const withSlash = buildBreadcrumbList([{ label: 'Главная', to: '/' }, { label: 'X' }], `${ORIGIN}/`);
  assert.equal(withSlash.itemListElement[0].item, `${ORIGIN}/`);
});

test('serializeJsonLd: глобальное экранирование "<" → \\u003c (двойное тоже)', () => {
  const json = serializeJsonLd({ name: 'a<b</script><script>alert(1)</script>' });
  assert.ok(!json.includes('<'));
  assert.ok(json.includes('\\u003c'));
  // оба '<' экранированы, '</script>' в тексте не прорывается
  assert.equal((json.match(/\\u003c/g) ?? []).length, 4);
  // результат — валидный JSON, парсится обратно в исходные символы
  assert.equal(JSON.parse(json).name, 'a<b</script><script>alert(1)</script>');
});

test('serializeJsonLd: экранирование U+2028/U+2029', () => {
  const json = serializeJsonLd({ name: 'a\u2028b\u2029c' });
  assert.ok(!json.includes('\u2028'));
  assert.ok(!json.includes('\u2029'));
  assert.equal(JSON.parse(json).name, 'a\u2028b\u2029c');
});

test('serializeJsonLd(buildBreadcrumbList(...)): полный цикл, JSON валиден', () => {
  const obj = buildBreadcrumbList(
    [{ label: 'Главная', to: '/' }, { label: 'Компания «<А&B>»' }],
    ORIGIN,
  );
  const roundtrip = JSON.parse(serializeJsonLd(obj));
  assert.deepEqual(roundtrip, obj);
});
