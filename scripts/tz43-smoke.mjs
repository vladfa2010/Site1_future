#!/usr/bin/env node
// Смоук ТЗ 4.2/4.3 (2026-11-15): инвалидация resetToken после смены пароля + аудит-лог админов.
// docs/security.md: «tz43-smoke 7/7» — файл был утерян, восстановлен статически по коду роутов
// (apps/api/src/routes/auth.ts, admin.ts; миграция packages/db/migrations/0021_security_audit.sql).
//
// МУТИРУЕТ ДАННЫЕ — запускать на стенде/локально, НЕ на проде. Хвосты чистит scripts/e2e.sh
// (email LIKE 'tz43%').
//
// Сценарии:
//   setup  регистрация tz43-<ts>@test.ru → сессия A
//   1      forgot-password → {success:true}; код — в логе API («[auth] reset code для …»)
//          или в почте, если на стенде задан RESEND_API_KEY
//   2      verify-code {email, code} → resetToken (JWT purpose=password_reset, 15 мин)
//   3      reset-password {resetToken, новый пароль} → 200 + новая сессия B
//   4      повторный reset-password ТЕМ ЖЕ resetToken → 401 (ТЗ 4.2: iat < passwordChangedAt)
//   5      старая сессия A после смены пароля → 401 (аудит 2026-11-20: passwordChangedAt
//          проверяется и в verifyToken, не только в reset-password)
//   6      сессионный JWT (purpose не задан) вместо resetToken → 401 (auth.ts: «resetToken
//          не принимает сессионные JWT»)
//   7      аудит-запись присутствует: super_admin PATCH /api/users/:id (users.patch) →
//          в GET /api/admin/audit-log появилась запись action=users.patch target=user:<id>
//   8      GET /api/admin/audit-log супер-админом → 200
//   9      GET /api/admin/audit-log токеном reader (сессия B) → 403 (только super_admin)
//
// Запуск:
//   JWT_SECRET=<секрет API> ADMIN_EMAIL=<super_admin> ADMIN_PASSWORD=<пароль> \
//     RESET_CODE=<6 цифр из лога API> node scripts/tz43-smoke.mjs [baseURL]
import jwt from 'jsonwebtoken';

const SECRET = process.env.JWT_SECRET;
const BASE = process.argv[2] ?? 'http://localhost:11003';
const ADMIN_EMAIL = process.env.ADMIN_EMAIL;
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD;
const RESET_CODE = process.env.RESET_CODE;
let fail = 0;

function check(name, ok, detail = '') {
  if (!ok) fail++;
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? `: ${detail}` : ''}`);
}

async function req(method, path, { token, body } = {}) {
  const r = await fetch(`${BASE}${path}`, {
    method,
    headers: {
      ...(body ? { 'Content-Type': 'application/json' } : {}),
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    ...(body ? { body: JSON.stringify(body) } : {}),
  });
  return { status: r.status, data: await r.json().catch(() => ({})) };
}

// ---------- setup: свой тестовый юзер, чей пароль мы знаем ----------
const email = `tz43-${Date.now()}@test.ru`;
const PASS1 = 'Tz43-pass-1';
const PASS2 = 'Tz43-pass-2';
const reg = await req('POST', '/api/auth/register', { body: { username: `tz43-${Date.now() % 100000}`, email, password: PASS1 } });
if (reg.status !== 201) {
  console.log('FAIL  setup: регистрация тестового юзера:', reg.status, JSON.stringify(reg.data).slice(0, 200));
  process.exit(1);
}
const userId = reg.data.user.id;
const sessionA = reg.data.token; // сессия ДО смены пароля — проверим инвалидацию ниже
console.log(`setup: зарегистрирован ${email} (id=${userId})`);

// 1) forgot-password: ответ не раскрывает аккаунт, код — в логе API или в почте
const forgot = await req('POST', '/api/auth/forgot-password', { body: { email } });
check('forgot-password → success', forgot.status === 200 && forgot.data.success === true,
  `HTTP ${forgot.status}`);

// 2) verify-code: код передаётся оператором (env RESET_CODE)
if (!/^\d{6}$/.test(RESET_CODE ?? '')) {
  check('verify-code → resetToken', false, 'RESET_CODE не задан — передайте код из лога API: [auth] reset code для ' + email);
  process.exit(1);
}
const verify = await req('POST', '/api/auth/verify-code', { body: { email, code: RESET_CODE } });
const resetToken = verify.data.resetToken;
check('verify-code → resetToken', verify.status === 200 && typeof resetToken === 'string',
  `HTTP ${verify.status}`);

// 3) reset-password: смена пароля по resetToken, ответ — как у логина
const reset = await req('POST', '/api/auth/reset-password', { body: { resetToken, password: PASS2 } });
const sessionB = reset.data.token;
check('reset-password → 200 + новая сессия', reset.status === 200 && typeof sessionB === 'string',
  `HTTP ${reset.status}`);

// 4) ТЗ 4.2: тот же resetToken второй раз → 401 (passwordChangedAt перекрыл iat)
const reuse = await req('POST', '/api/auth/reset-password', { body: { resetToken, password: PASS1 } });
check('повторный resetToken → 401', reuse.status === 401, `HTTP ${reuse.status}`);

// 5) аудит 2026-11-20: сессия, выданная ДО смены пароля, больше не принимается
const meOld = await req('GET', '/api/auth/me', { token: sessionA });
check('старая сессия после смены пароля → 401', meOld.status === 401, `HTTP ${meOld.status}`);

// 6) resetToken без purpose=password_reset (сессионный JWT) не принимается
if (SECRET) {
  const sessionJwt = jwt.sign({ role: 'reader' }, SECRET,
    { subject: String(userId), expiresIn: '15m', algorithm: 'HS256', issuer: 'invest-api', audience: 'invest-spa' });
  const asReset = await req('POST', '/api/auth/reset-password', { body: { resetToken: sessionJwt, password: PASS1 } });
  check('сессионный JWT вместо resetToken → 401', asReset.status === 401, `HTTP ${asReset.status}`);
} else {
  console.log('SKIP  сессионный JWT вместо resetToken (JWT_SECRET не задан)');
}

// 7) аудит-запись присутствует: super_admin правит юзера → запись в admin_audit_log
if (!ADMIN_EMAIL || !ADMIN_PASSWORD) {
  check('аудит-запись присутствует (users.patch → audit-log)', false, 'ADMIN_EMAIL/ADMIN_PASSWORD не заданы');
  check('audit-log супер-админом → 200', false, 'ADMIN_EMAIL/ADMIN_PASSWORD не заданы');
} else {
  const login = await req('POST', '/api/auth/login', { body: { email: ADMIN_EMAIL, password: ADMIN_PASSWORD } });
  const adminToken = login.data.token;
  if (login.status !== 200 || !adminToken) {
    check('логин super_admin', false, `HTTP ${login.status}`);
    process.exit(1);
  }
  const patch = await req('PATCH', `/api/users/${userId}`, {
    token: adminToken,
    body: { displayName: `tz43-probed-${Date.now() % 100000}` },
  });
  const log = await req('GET', '/api/admin/audit-log', { token: adminToken });
  const found = log.status === 200
    && (log.data.entries ?? []).some((e) => e.action === 'users.patch' && e.target === `user:${userId}`);
  check('аудит-запись присутствует (users.patch → audit-log)', patch.status === 200 && found,
    `PATCH HTTP ${patch.status}, запись в audit-log: ${found ? 'да' : 'нет'}`);

  // 8) просмотр аудит-лога самим супер-админом → 200
  check('audit-log супер-админом → 200', log.status === 200 && Array.isArray(log.data.entries),
    `HTTP ${log.status}, записей: ${(log.data.entries ?? []).length}`);

  // 9) не-супер-админ (reader, сессия B) → 403
  const denied = await req('GET', '/api/admin/audit-log', { token: sessionB });
  check('audit-log reader → 403', denied.status === 403, `HTTP ${denied.status}`);
}

process.exit(fail ? 1 : 0);
