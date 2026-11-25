/**
 * ТЗ-13 (ContentMaster, AI-редактор): чистые функции разбора ответа модели.
 * Зафиксированные баги из журнала:
 *  - 2026-11-17: модель дописывала текст с фигурными скобками после JSON —
 *    жадный /\{[\s\S]*\}/ захватывал его и JSON.parse падал;
 *  - сырой DSML (вызовы web_search) приходил вместо JSON-ответа — парсер
 *    обязан отличить «вызовы не исполнились» от готового ответа.
 * Ранее проверялись ad-hoc скриптами extract-test.mts / dsml-test.mts в корне
 * apps/api — здесь те же кейсы как постоянные юниты.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';

import { stripDsml, extractFirstJson } from '../src/routes/contentMaster.js';

// ---------- stripDsml: удаление вызовов DSML из ответа модели ----------

test('stripDsml: полный блок <calls>…</calls> удалён целиком', () => {
  const raw = `<｜｜DSML｜｜ calls>\n<｜｜DSML｜｜ invoke name="web_search">\n<｜｜DSML｜｜ parameter name="query" string="true">Dealroom "2025 wrapped"</｜｜DSML｜｜/parameter>\n<｜｜DSML｜｜/invoke>\n<｜｜DSML｜｜/calls>`;
  assert.equal(stripDsml(raw), '');
});

test('stripDsml: блок перед нормальным JSON — JSON не повреждён', () => {
  const raw = `<｜｜DSML｜｜ calls>\n<｜｜DSML｜｜ invoke name="web_search">\n<｜｜DSML｜｜ parameter name="query" string="true">test</｜｜DSML｜｜/parameter>\n<｜｜DSML｜｜/calls>\n{"title":"Ответ","html":"<p>Текст</p>"}`;
  const s = stripDsml(raw);
  assert.ok(s.includes('"title"'), 'JSON повреждён');
  assert.doesNotThrow(() => JSON.parse(s));
});

test('stripDsml: оборванный блок без закрытия — удалён до конца строки', () => {
  const raw = 'Начало ответа\n<｜｜DSML｜｜ calls>\n<｜｜DSML｜｜ invoke name="web_search">\nхвост';
  // хвост удалён до конца строки; предшествующий \n остаётся (replace без trim)
  assert.equal(stripDsml(raw), 'Начало ответа\n');
});

test('stripDsml: текст без DSML не тронут', () => {
  const raw = '{"title":"Обычный ответ","html":"<p>Без вызовов</p>"}';
  assert.equal(stripDsml(raw), raw);
});

// ---------- extractFirstJson: первый сбалансированный JSON-объект ----------

test('extractFirstJson: JSON + текст со скобками после (баг 2026-11-17)', () => {
  const raw = 'Вот результат:\n{"report":[{"claim":"a {x}","status":"confirmed"}],"summary":"s"}\nНадеюсь, это поможет {вам}.';
  const json = extractFirstJson(raw);
  assert.ok(json);
  assert.equal(JSON.parse(json).summary, 's');
});

test('extractFirstJson: markdown-обёртка ```json и постскриптум со скобкой', () => {
  const raw = '```json\n{"a":1}\n```\nпостскриптум }';
  const json = extractFirstJson(raw);
  assert.ok(json);
  assert.equal(JSON.parse(json).a, 1);
});

test('extractFirstJson: скобки внутри строк JSON не ломают баланс', () => {
  const raw = '{"html":"<p>шаблон {placeholder}</p>"} trailing {';
  const json = extractFirstJson(raw);
  assert.ok(json);
  assert.ok(JSON.parse(json).html.includes('{placeholder}'));
});

test('extractFirstJson: экранированная кавычка внутри строки', () => {
  const raw = '{"k":"v\\"}"}'; // символы: {"k":"v\"}"}
  const json = extractFirstJson(raw);
  assert.ok(json);
  assert.equal(JSON.parse(json).k, 'v"}');
});

test('extractFirstJson: вложенные объекты и массивы считаются по глубине', () => {
  const raw = 'prefix {"a":{"b":[1,{"c":2}]},"d":null} suffix }';
  const json = extractFirstJson(raw);
  assert.ok(json);
  assert.deepEqual(JSON.parse(json), { a: { b: [1, { c: 2 }] }, d: null });
});

test('extractFirstJson: JSON отсутствует или незакрыт → null (не бросает)', () => {
  assert.equal(extractFirstJson('Нет объектов вообще'), null);
  assert.equal(extractFirstJson('{"a": 1'), null); // незакрыт
  assert.equal(extractFirstJson(''), null);
});
