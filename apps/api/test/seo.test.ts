/**
 * ТЗ-10 §8 п.10: автотесты bot-render/sitemap — чистые функции (без БД):
 * экранирование, UA-детект, JSON-LD-защита, контракт BreadcrumbList ТЗ-01.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';

import {
  escapeHtml, escapeAttr, escapeXml, htmlToText, truncateChars,
  absoluteUrl, encodePathSegment, toW3CDate,
} from '../src/utils/html.js';
import { botClass, BOT_UA_PATTERN_SOURCE, BOT_UA_ALTERNATIVES } from '../src/services/botUa.js';
import { buildBreadcrumbList, serializeJsonLd } from '@newinvest/db/breadcrumbs';
import { buildSitemapXml } from '../src/routes/seo.js';
import { normalizePath } from '../src/services/botRender.js';

test('escapeHtml экранирует все опасные символы', () => {
  assert.equal(escapeHtml(`<script>"'&`), '&lt;script&gt;&quot;&#39;&amp;');
  assert.equal(escapeHtml('обычный текст'), 'обычный текст');
});

test('escapeAttr == escapeHtml (атрибуты в двойных кавычках)', () => {
  assert.equal(escapeAttr('a" onmouseover="x'), escapeHtml('a" onmouseover="x'));
});

test('escapeXml для sitemap', () => {
  assert.equal(escapeXml('a&b<c>'), 'a&amp;b&lt;c&gt;');
});

test('htmlToText: теги → пробелы, абзацы сохранены, лимит слов', () => {
  const html = '<p>Первый абзац из трёх слов.</p><p>Второй абзац тоже здесь.</p><p>Третий не влезает.</p>';
  assert.deepEqual(htmlToText(html, 7), ['Первый абзац из трёх слов.', 'Второй абзац']);
  assert.deepEqual(htmlToText('<br><p>x</p>', 5), ['x']);
  assert.deepEqual(htmlToText('', 5), []);
});

test('truncateChars ~160 для description-фолбэка', () => {
  const long = 'а'.repeat(200);
  assert.equal(truncateChars(long, 160).length, 160);
  assert.equal(truncateChars('коротко', 160), 'коротко');
});

test('absoluteUrl: http — как есть, путь — origin+path, javascript:/data: → null', () => {
  assert.equal(absoluteUrl('https://img.example/x.png', 'https://site.ru'), 'https://img.example/x.png');
  assert.equal(absoluteUrl('/uploads/x.png', 'https://site.ru'), 'https://site.ru/uploads/x.png');
  assert.equal(absoluteUrl('javascript:alert(1)', 'https://site.ru'), null);
  assert.equal(absoluteUrl('data:text/html,x', 'https://site.ru'), null);
});

test('encodePathSegment: латиница/дефис как есть, кириллица — percent-encoding (ревью v2.1 №4)', () => {
  assert.equal(encodePathSegment('spacex-ipo-2'), 'spacex-ipo-2');
  // «о» кириллическая (как в slug мигрированных статей)
  assert.equal(encodePathSegment('ipо-spacex'), 'ip%D0%BE-spacex');
  assert.equal(encodePathSegment('a/b'), 'a%2Fb'); // слэш не просачивается
});

test('toW3CDate: ISO без миллисекунд', () => {
  assert.match(toW3CDate(new Date('2026-11-08T12:00:00.123Z')), /^2026-11-08T12:00:00Z$/);
});

// ---------- UA-детект (зеркало Caddy-регекспа, ревью v2.1 №6: RU-боты) ----------
const BOTS = [
  'Mozilla/5.0 (compatible; Googlebot/2.1; +http://www.google.com/bot.html)',
  'Mozilla/5.0 (compatible; YandexBot/3.0; +http://yandex.com/bots)',
  'YandexAccessibility/2.0',
  'DuckDuckBot/1.1; (+http://duckduckgo.com/duckduckbot.html)',
  'Mozilla/5.0 (compatible; bingbot/2.0; +http://www.bing.com/bingbot.htm)',
  'Mozilla/5.0 (compatible; Yahoo! Slurp; http://help.yahoo.com/help/us/ysearch/slurp)',
  'TelegramBot (like TwitterBot)',
  'vkShare',
  'facebookexternalhit/1.1 (+http://www.facebook.com/externalhit_uatext.php)',
  'twitterbot/1.0',
  'SeznamBot/4.0',
  'Mozilla/5.0 (compatible; Mail.RU_Bot/2.0; +http://go.mail.ru/help/robots)',
  'Mozilla/5.0 (compatible; Exabot/3.0 (BiggerBetter); +http://www.exabot.com/go/robot.html)',
  'Baiduspider+(+http://www.baidu.com/search/spider.htm)',
];
const HUMANS = [
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0 Safari/537.36',
  'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) Safari/604.1',
  'PostmanRuntime/7.32.3',
  '',
];

test('botClass: все известные боты распознаются (регистронезависимо)', () => {
  for (const ua of BOTS) {
    assert.ok(botClass(ua), `не распознан: ${ua}`);
    assert.ok(botClass(ua.toLowerCase()), `не распознан в lowercase: ${ua}`);
  }
  assert.equal(botClass('TelegramBot (like TwitterBot)'), 'telegrambot');
  assert.equal(botClass('YandexBot/3.0'), 'yandex');
});

test('botClass: браузеры и пустой UA — null (ошибка в сторону «не распознал»)', () => {
  for (const ua of HUMANS) assert.equal(botClass(ua), null);
  assert.equal(botClass(undefined), null);
});

test('UA-паттерн валиден и в JS, и в Caddy-синтаксисе (копия в Caddyfile)', () => {
  assert.doesNotThrow(() => new RegExp(BOT_UA_ALTERNATIVES, 'i'));
  assert.ok(BOT_UA_PATTERN_SOURCE.startsWith('(?i)'));
});

// ---------- JSON-LD: контракт ТЗ-01 + защита '</script' (ревью v2.1 №2/№3) ----------
test('BreadcrumbList идентичен контракту ТЗ-01: последний без item, position с 1', () => {
  const crumbs = [
    { label: 'Главная', to: '/' },
    { label: 'Новости', to: '/novost' },
    { label: 'Статья "с кавычками"' },
  ];
  const ld = buildBreadcrumbList(crumbs, 'https://site.ru');
  assert.equal(ld['@type'], 'BreadcrumbList');
  assert.deepEqual(ld.itemListElement.map((i) => i.position), [1, 2, 3]);
  assert.equal(ld.itemListElement[0].item, 'https://site.ru/');
  assert.equal(ld.itemListElement[1].item, 'https://site.ru/novost');
  assert.equal(ld.itemListElement[2].item, undefined); // последний — БЕЗ item
  const parsed = JSON.parse(serializeJsonLd(ld));
  assert.equal(parsed.itemListElement[2].name, 'Статья "с кавычками"');
});

test('serializeJsonLd: одним JSON.stringify, </script → \\u003c, U+2028/29 экранированы', () => {
  const obj = { title: '</script><script>alert(1)</script>', text: 'a\u2028b\u2029c' };
  const raw = serializeJsonLd(obj);
  assert.ok(!raw.includes('</script'), 'сырой </script> в JSON-LD!');
  assert.ok(!raw.includes('\u2028') && !raw.includes('\u2029'));
  const parsed = JSON.parse(raw); // валидный JSON, эскейпы легальны
  assert.equal(parsed.title, obj.title);
  assert.equal(parsed.text, 'a\u2028b\u2029c');
});

// ---------- sitemap ----------
test('buildSitemapXml: urlset для ≤50000, sitemapindex при превышении, escapeXml в loc', () => {
  const mk = (n: number) => Array.from({ length: n }, (_, i) => ({
    loc: `https://site.ru/p/${i}?a=1&b=2`,
    changefreq: 'daily',
    priority: '0.5',
  }));
  const xml = buildSitemapXml(mk(3), 'https://site.ru');
  assert.ok(xml.startsWith('<?xml version="1.0" encoding="UTF-8"?>'));
  assert.ok(xml.includes('<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">'));
  assert.ok(xml.includes('https://site.ru/p/0?a=1&amp;b=2'), 'loc прошёл escapeXml');
  assert.ok(!xml.includes('<loc>https://site.ru/p/0?a=1&b=2</loc>'));

  const index = buildSitemapXml(mk(50_001), 'https://site.ru');
  assert.ok(index.includes('<sitemapindex'));
  assert.ok(index.includes('https://site.ru/sitemap-2.xml'));
});

test('normalizePath: query отрезан, слеш в конце убран, без leading slash → null', () => {
  assert.equal(normalizePath('/novost/foo?bar=1'), '/novost/foo');
  assert.equal(normalizePath('/novost/foo/'), '/novost/foo');
  assert.equal(normalizePath('/'), '/');
  assert.equal(normalizePath('novost/foo'), null);
});
