// Смоук-тест фикса verifyToken (аудит 2026-11-14): payload JWT не должен определять права.
// Запуск: JWT_SECRET=<тот же, что у API> node scripts/auth-smoke.mjs [baseURL]
import jwt from 'jsonwebtoken';

const SECRET = process.env.JWT_SECRET;
const BASE = process.argv[2] ?? 'http://localhost:11003';
let fail = 0;

async function probe(name, token, expectStatus) {
  const r = await fetch(`${BASE}/api/users/export.csv`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  const ok = r.status === expectStatus;
  if (!ok) fail++;
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}: HTTP ${r.status} (ожидался ${expectStatus})`);
}

// 1) Подделка: токен с role=super_admin для реального reader (id=6), выдуманный тариф
const forged = jwt.sign(
  { role: 'super_admin', tariffId: 1, tariffExpiresAt: '2099-01-01T00:00:00Z' },
  SECRET, { subject: '6', expiresIn: '1h', algorithm: 'HS256' });
await probe('подделанный super_admin для reader (id=6)', forged, 403);

// 2) Верная подпись, но payload занижен (реальный super_admin id=1, role=reader в токене):
//    права теперь из БД → доступ должен БЫТЬ (проверка, что БД-источник работает в обе стороны)
const adminToken = jwt.sign({ role: 'reader' }, SECRET, { subject: '1', expiresIn: '1h', algorithm: 'HS256' });
await probe('верно подписанный, payload role=reader (реальный admin id=1)', adminToken, 200);

// 3) Легитимный токен reader: admin-роут должен отказать
const login = await fetch(`${BASE}/api/auth/login`, {
  method: 'POST', headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ email: 'reader@test.ru', password: 'reader123' }),
});
if (!login.ok) { console.log('FAIL  логин reader:', login.status, await login.text()); process.exit(1); }
const { token: readerToken } = await login.json();
await probe('легитимный токен reader (id=5)', readerToken, 403);

// 4) Пейволл: reader с выдуманным тарифом в подписанном токене не должен видеть tariff-материалы.
//    (accessCondition теперь берёт tariffId из БД, где у reader null)
const t = await fetch(`${BASE}/api/articles?type=obzor&limit=100`, {
  headers: { Authorization: `Bearer ${forged}` },
});
const body = await t.json();
const tariffArticles = (body.articles ?? []).filter(a => a.accessLevel === 'tariff');
const paywallOk = tariffArticles.length === 0;
if (!paywallOk) fail++;
console.log(`${paywallOk ? 'PASS' : 'FAIL'}  пейволл: tariff-материалов в выдаче для поддельного тарифа — ${tariffArticles.length} (ожидалось 0)`);

process.exit(fail ? 1 : 0);
