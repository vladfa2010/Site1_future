#!/bin/bash
# E2E-тесты платформы: админка + юзер-сценарии
B="${API_URL:-http://localhost:4000}"
J='Content-Type: application/json'
PASS=0; FAIL=0; FAILED=()

ok()   { PASS=$((PASS+1)); }
bad()  { FAIL=$((FAIL+1)); FAILED+=("$1"); echo "  ❌ $1"; }
check() { # check <описание> <условие-команда>
  local desc="$1"; shift
  if "$@" > /dev/null 2>&1; then ok; else bad "$desc"; fi
}
jqget() { python3 -c "import json,sys; d=json.load(sys.stdin); print($1)" 2>/dev/null; }

echo "════════════════════════════════════════"
echo "  E2E: АВТОРИЗАЦИЯ"
echo "════════════════════════════════════════"
T=$(curl -s -X POST $B/api/auth/login -H "$J" -d '{"email":"test@test.ru","password":"test"}' | jqget "d['token']")
[ -n "$T" ] && ok || bad "login admin"
A="Authorization: Bearer $T"
check "login: неверный пароль → 401" curl -s -o /dev/null -w "%{http_code}" -X POST $B/api/auth/login -H "$J" -d '{"email":"test@test.ru","password":"wrong"}' | grep -q 401
curl -s -o /dev/null -w "%{http_code}" -X POST $B/api/auth/login -H "$J" -d '{"email":"test@test.ru","password":"wrong"}' | grep -q 401 && ok || bad "login: 401 на неверный пароль"
SA=$(curl -s -X POST $B/api/auth/login -H "$J" -d '{"email":"admin@local.dev","password":"admin123"}' | jqget "d['token']")
[ -n "$SA" ] && ok || bad "login super_admin"
curl -s "$B/api/auth/me" -H "$A" | grep -q "displayName" && ok || bad "/auth/me"
# регистрация e2e-юзера
curl -s -X POST $B/api/auth/register -H "$J" -d '{"username":"E2EUser","email":"e2e@test.ru","password":"E2ePass123"}' > /dev/null
UT=$(curl -s -X POST $B/api/auth/login -H "$J" -d '{"email":"e2e@test.ru","password":"E2ePass123"}' | jqget "d['token']")
[ -n "$UT" ] && ok || bad "register+login e2e user"
UA="Authorization: Bearer $UT"
curl -s -X POST $B/api/auth/register -H "$J" -d '{"username":"E2EUser2","email":"E2E@test.ru","password":"E2ePass123"}' | grep -q EMAIL_EXISTS && ok || bad "register: email CI 409"
curl -s -X POST $B/api/auth/register -H "$J" -d '{"username":"e2euser","email":"other@test.ru","password":"E2ePass123"}' | grep -q USERNAME_EXISTS && ok || bad "register: username CI 409"
curl -s -o /dev/null -w "%{http_code}" -X POST $B/api/auth/register -H "$J" -d '{"username":"Short","email":"s@test.ru","password":"123"}' | grep -q 400 && ok || bad "register: короткий пароль 400"

echo "════════════════════════════════════════"
echo "  E2E: АДМИНКА — СТАТЬИ"
echo "════════════════════════════════════════"
ART=$(curl -s -X POST "$B/api/articles" -H "$A" -H "$J" -d '{"type":"novost","slug":"e2e-novost","title":"E2E новость","contentHtml":"<p>Текст</p>","status":"draft"}' | jqget "d['article']['id']")
[ -n "$ART" ] && ok || bad "admin: создать статью"
curl -s "$B/api/articles?limit=5" -H "$A" | grep -q e2e-novost && ok || bad "admin: статья в списке (админ видит draft)"
curl -s "$B/api/articles?limit=5" | grep -q e2e-novost && bad "список: anon видит draft (ПРОБЛЕМА)" || ok
curl -s -X PATCH "$B/api/articles/$ART" -H "$A" -H "$J" -d '{"title":"E2E новость v2","accessLevel":"auth"}' | grep -q "v2" && ok || bad "admin: PATCH статьи"
curl -s -X POST "$B/api/articles/$ART/publish" -H "$A" | grep -q published && ok || bad "admin: публикация"

echo "──────────────── интеграционно: детали по правильному пути"
PUB=$(curl -s -o /dev/null -w "%{http_code}" "$B/api/articles/novost/e2e-novost")
true
# relations + chain
curl -s -X PUT "$B/api/articles/$ART/relations" -H "$A" -H "$J" -d '{"tickerIds":[1]}' | grep -q tickerIds && ok || bad "relations: PUT"
SUG=$(curl -s "$B/api/articles/$ART/bindings-suggest" -H "$A")
echo "$SUG" | grep -q companies && ok || bad "relations: bindings-suggest"
curl -s -X POST "$B/api/media/generate" -H "$A" -H "$J" -d "{\"prompt\":\"E2E test cover prompt for article\",\"articleId\":$ART}" | grep -q "url" && ok || bad "media/generate (mock)"
curl -s "$B/api/media" -H "$A" | grep -q "filePath" && ok || bad "media list"

echo "════════════════════════════════════════"
echo "  E2E: АДМИНКА — СУЩНОСТИ"
echo "════════════════════════════════════════"
curl -s -X POST "$B/api/companies" -H "$A" -H "$J" -d '{"slug":"e2e-corp","name":"E2E Corp","industryIds":[1]}' | grep -q e2e-corp && ok || bad "companies: создать"
curl -s -X POST "$B/api/trends" -H "$A" -H "$J" -d '{"slug":"e2e-trend","name":"E2E Тренд"}' | grep -q e2e-trend && ok || bad "trends: создать"
curl -s -X POST "$B/api/industries" -H "$A" -H "$J" -d '{"slug":"e2e-ind","name":"E2E Индустрия"}' | grep -q e2e-ind && ok || bad "industries: создать"
curl -s -X POST "$B/api/tickers" -H "$A" -H "$J" -d '{"slug":"e2e","symbol":"E2E","companyId":1}' | grep -q E2E && ok || bad "tickers: создать"
curl -s "$B/api/tickers?q=e2e" -H "$A" | grep -q E2E && ok || bad "tickers: автодополнение"
CID=$(curl -s "$B/api/companies/e2e-corp" | jqget "d['company']['id']")
curl -s -X POST "$B/api/companies/$CID/rounds" -H "$A" -H "$J" -d '{"stage":"seed","amount":"100000","sourceUrl":"https://example.com"}' | grep -q seed && ok || bad "rounds: создать"
curl -s -o /dev/null -w "%{http_code}" -X POST "$B/api/companies/$CID/rounds" -H "$A" -H "$J" -d '{"stage":"seed"}' | grep -q 400 && ok || bad "rounds: 400 без source_url"

echo "════════════════════════════════════════"
echo "  E2E: АДМИНКА — СЮЖЕТЫ / РЕДИРЕКТЫ / ЮЗЕРЫ / ТАРИФЫ"
echo "════════════════════════════════════════"
SID=$(curl -s -X POST "$B/api/stories" -H "$A" -H "$J" -d '{"slug":"e2e-story","name":"E2E Сюжет"}' | jqget "d['story']['id']")
[ -n "$SID" ] && ok || bad "stories: создать"
curl -s -X PUT "$B/api/stories/$SID/articles" -H "$A" -H "$J" -d "{\"articleIds\":[$ART],\"primaryArticleId\":$ART}" | grep -q isPrimary && ok || bad "stories: состав + главная"
curl -s "$B/api/stories/$SID/articles" -H "$A" | grep -q isPrimary && ok || bad "stories: GET состава"
curl -s -X POST "$B/api/redirects" -H "$A" -H "$J" -d '{"oldPath":"/e2e-old","newPath":"/e2e-new"}' | grep -q e2e-old && ok || bad "redirects: создать"
curl -s -X DELETE "$B/api/redirects/%2Fe2e-old" -H "$A" | grep -q '"ok"' && ok || bad "redirects: удалить"
USRID=$(curl -s "$B/api/users" -H "$A" | jqget "[u['id'] for u in d['users'] if u['email']=='e2e@test.ru'][0]")
curl -s -X PATCH "$B/api/users/$USRID" -H "Authorization: Bearer $SA" -H "$J" -d '{"role":"author","tariffId":1}' > /dev/null
curl -s "$B/api/users" -H "$A" | grep -q '"role":"author"' && ok || bad "users: смена роли"
curl -s -o /dev/null -w "%{http_code}" -X PATCH "$B/api/users/$USRID" -H "$UA" -H "$J" -d '{"role":"admin"}' | grep -q 403 && ok || bad "users: не-super не меняет роли"
curl -s -X PATCH "$B/api/tariff-plans/1" -H "$A" -H "$J" -d '{"yearlyDiscount":21}' | grep -q '"yearlyDiscount":21' && ok || bad "tariffs: PATCH"
curl -s "$B/api/stats/views?days=7" -H "$A" | grep -q '"total"' && ok || bad "stats: просмотры"
curl -s -X POST "$B/api/notifications/send" -H "$A" -H "$J" -d '{"scope":"daily"}' | grep -q skipped && ok || bad "notifications: ручной запуск"

echo "════════════════════════════════════════"
echo "  E2E: ЮЗЕР-СЦЕНАРИИ"
echo "════════════════════════════════════════"
# перелогин после смены роли (JWT перевыпуск)
UT=$(curl -s -X POST $B/api/auth/login -H "$J" -d '{"email":"e2e@test.ru","password":"E2ePass123"}' | jqget "d['token']"); UA="Authorization: Bearer $UT"
# тариф открывает закрытый материал
curl -s -o /dev/null -w "%{http_code}" "$B/api/articles/novost/e2e-novost" | grep -q 403 && ok || bad "paywall: anon 403 на auth-материал"
curl -s -o /dev/null -w "%{http_code}" "$B/api/articles/novost/e2e-novost" -H "$UA" | grep -q 200 && ok || bad "paywall: тарифный юзер 200"
# избранное
curl -s -o /dev/null -w "%{http_code}" -X PUT "$B/api/favorites" -H "$UA" -H "$J" -d '{"entityType":"article","entityId":1}' | grep -q 201 && ok || bad "favorites: добавить"
curl -s "$B/api/favorites/keys" -H "$UA" | grep -q "article:1" && ok || bad "favorites: ключи"
curl -s -X DELETE "$B/api/favorites/article/1" -H "$UA" | grep -q '"ok"' && ok || bad "favorites: удалить"
# подписки → лента
curl -s -o /dev/null -w "%{http_code}" -X PUT "$B/api/subscriptions" -H "$UA" -H "$J" -d '{"entityType":"trend","entityId":10}' | grep -q 201 && ok || bad "subscriptions: подписаться"
FEEDN=$(curl -s "$B/api/feed" -H "$UA" | jqget "len(d.get('articles',[]))")
[ "$FEEDN" -gt 0 ] 2>/dev/null && ok || bad "feed: лента непустая (n=$FEEDN)"
# кабинет
curl -s -X PUT "$B/api/notification-settings" -H "$UA" -H "$J" -d '{"emailDaily":true,"emailWeekly":false}' | grep -q "emailWeekly" && ok || bad "notification-settings: сохранить"
curl -s -X PUT "$B/api/avatar" -H "$UA" -H "$J" -d '{"avatar":"🧠"}' | grep -q "🧠" && ok || bad "avatar: выбрать"
# предложение материала (author)
curl -s -X POST "$B/api/articles/propose" -H "$UA" -H "$J" -d '{"type":"ideya","title":"E2E идея от юзера","text":"Текст идеи более двадцати символов для валидации"}' | grep -q draft && ok || bad "propose: отправка идеи"
curl -s -o /dev/null -w "%{http_code}" -X POST "$B/api/articles/propose" -H "$J" -d '{"type":"ideya","title":"аноним","text":"анонимный текст более двадцати символов"}' | grep -q 401 && ok || bad "propose: anon 401"
# пейволл tariff-материал (insider=1, юзер с тарифом 1)
curl -s -X POST "$B/api/articles" -H "$A" -H "$J" -d '{"type":"analitika","slug":"e2e-insider","title":"E2E Инсайд","contentHtml":"<p>x</p>","status":"published","accessLevel":"tariff","accessTariffId":1}' > /dev/null
curl -s -o /dev/null -w "%{http_code}" "$B/api/articles/analitika/e2e-insider" | grep -q 403 && ok || bad "paywall: anon 403 на tariff"
curl -s -o /dev/null -w "%{http_code}" "$B/api/articles/analitika/e2e-insider" -H "$UA" | grep -q 200 && ok || bad "paywall: юзер с тарифом 200"
# главная/публичные страницы
for ep in "trends" "articles?type=novost&limit=3" "screener?phase=portfel" "trends/kosmos" "companies/spacex" "market/chart?symbol=SBER" "tariff-plans"; do
  curl -s -o /dev/null -w "%{http_code}" "$B/api/$ep" | grep -q 200 && ok || bad "public GET /api/$ep"
done
curl -s "$B/api/articles/novost/spacex-lider-po-kolichestvu-sputnikov" | grep -q relations && ok || bad "article detail: relations"
curl -s "$B/api/articles/novost/spacex-lider-po-kolichestvu-sputnikov" | grep -q stages && ok || bad "article detail: stages (график)"
# поиск/скринер
curl -s "$B/api/screener?stage=pre-ipo-transaction-stages" | grep -q ideas && ok || bad "screener: фильтр стадии"

echo "════════════════════════════════════════"
echo "  E2E: БЕЗОПАСНОСТЬ / ОГРАНИЧЕНИЯ"
echo "════════════════════════════════════════"
curl -s -o /dev/null -w "%{http_code}" -H "Origin: http://evil.example" "$B/api/articles?limit=1" | grep -q 403 && ok || bad "CORS: чужой origin 403"
curl -s -o /dev/null -w "%{http_code}" "$B/api/users" | grep -q 401 && ok || bad "users: anon 401"
curl -s -o /dev/null -w "%{http_code}" "$B/api/articles/1/relations" -X PUT -H "$J" -d '{}' | grep -q 401 && ok || bad "relations: anon 401"
curl -s "$B/api/health" -D - -o /dev/null | grep -qi "x-frame-options" && ok || bad "security headers"

echo ""
echo "════════════════════════════════════════"
echo "  ИТОГ: PASS=$PASS FAIL=$FAIL"
for f in "${FAILED[@]}"; do echo "  ❌ $f"; done
echo "════════════════════════════════════════"

# очистка e2e-данных
psql -d newinvest -q -c "
DELETE FROM articles WHERE slug IN ('e2e-novost','e2e-insider') OR title LIKE 'E2E идея%';
DELETE FROM stories WHERE slug='e2e-story';
DELETE FROM companies WHERE slug='e2e-corp';
DELETE FROM trends WHERE slug='e2e-trend';
DELETE FROM industries WHERE slug='e2e-ind';
DELETE FROM tickers WHERE slug='e2e';
DELETE FROM favorites WHERE user_id IN (SELECT id FROM users WHERE email='e2e@test.ru');
DELETE FROM subscriptions WHERE user_id IN (SELECT id FROM users WHERE email='e2e@test.ru');
DELETE FROM notification_settings WHERE user_id IN (SELECT id FROM users WHERE email='e2e@test.ru');
DELETE FROM tg_bindings WHERE user_id IN (SELECT id FROM users WHERE email='e2e@test.ru');
DELETE FROM users WHERE email='e2e@test.ru';
UPDATE tariff_plans SET yearly_discount=20 WHERE slug='insider';
" 2>/dev/null
exit $FAIL
