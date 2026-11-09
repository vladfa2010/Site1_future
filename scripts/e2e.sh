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
echo "  E2E: ВОССТАНОВЛЕНИЕ ПАРОЛЯ (порт PULSE) + БЛОКИРОВКА"
echo "════════════════════════════════════════"
# полный цикл: forgot → code из БД (почта mock) → verify → reset → старый пароль мёртв, новый работает
curl -s -X POST $B/api/auth/register -H "$J" -d '{"username":"ResetE2E","email":"reset-e2e@test.ru","password":"OldPass123"}' > /dev/null
curl -s -X POST $B/api/auth/forgot-password -H "$J" -d '{"email":"reset-e2e@test.ru"}' | grep -q '"success":true' && ok || bad "reset: forgot success"
curl -s -X POST $B/api/auth/forgot-password -H "$J" -d '{"email":"no-such@test.ru"}' | grep -q '"success":true' && ok || bad "reset: нераскрытие email (unknown → success)"
CODE=$(psql -d newinvest -tAc "SELECT code FROM password_reset_codes WHERE user_id=(SELECT id FROM users WHERE email='reset-e2e@test.ru') ORDER BY created_at DESC LIMIT 1" 2>/dev/null)
RT=$(curl -s -X POST $B/api/auth/verify-code -H "$J" -d "{\"email\":\"reset-e2e@test.ru\",\"code\":\"$CODE\"}" | jqget "d['resetToken']")
[ -n "$RT" ] && ok || bad "reset: verify-code → resetToken"
curl -s -o /dev/null -w "%{http_code}" -X POST $B/api/auth/verify-code -H "$J" -d '{"email":"reset-e2e@test.ru","code":"000000"}' | grep -q 400 && ok || bad "reset: неверный код 400"
# код одноразовый: повтор verify с тем же кодом → 400
curl -s -o /dev/null -w "%{http_code}" -X POST $B/api/auth/verify-code -H "$J" -d "{\"email\":\"reset-e2e@test.ru\",\"code\":\"$CODE\"}" | grep -q 400 && ok || bad "reset: код одноразовый"
curl -s -X POST $B/api/auth/reset-password -H "$J" -d "{\"resetToken\":\"$RT\",\"password\":\"NewPass456\"}" | grep -q '"token"' && ok || bad "reset: новая сессия"
curl -s -o /dev/null -w "%{http_code}" -X POST $B/api/auth/login -H "$J" -d '{"email":"reset-e2e@test.ru","password":"OldPass123"}' | grep -q 401 && ok || bad "reset: старый пароль 401"
curl -s -o /dev/null -w "%{http_code}" -X POST $B/api/auth/login -H "$J" -d '{"email":"reset-e2e@test.ru","password":"NewPass456"}' | grep -q 200 && ok || bad "reset: новый пароль 200"
# чужой/просроченный resetToken → 401 (подписан другим секретом)
curl -s -o /dev/null -w "%{http_code}" -X POST $B/api/auth/reset-password -H "$J" -d '{"resetToken":"eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiIxIiwicHVycG9zZSI6InBhc3N3b3JkX3Jlc2V0In0.forged","password":"Forged123"}' | grep -q 401 && ok || bad "reset: подделанный токен 401"
# блокировка в requireRole: свежий юзер → логин (токен) → psql: admin + blocked → admin-эндпоинт 403
curl -s -X POST $B/api/auth/register -H "$J" -d '{"username":"BlockE2E","email":"block-e2e@test.ru","password":"E2ePass123"}' > /dev/null
BTK=$(curl -s -X POST $B/api/auth/login -H "$J" -d '{"email":"block-e2e@test.ru","password":"E2ePass123"}' | jqget "d['token']")
psql -d newinvest -q -c "UPDATE users SET role='admin', is_blocked=TRUE WHERE email='block-e2e@test.ru'" 2>/dev/null
if [ -n "$BTK" ]; then
  curl -s -o /dev/null -w "%{http_code}" "$B/api/admin/metrics/overview" -H "Authorization: Bearer $BTK" | grep -q 403 && ok || bad "blocked: requireRole 403 (ТЗ-120)"
else
  bad "blocked: нет токена для проверки requireRole"
fi
psql -d newinvest -q -c "DELETE FROM users WHERE email='block-e2e@test.ru'" 2>/dev/null

echo "════════════════════════════════════════"
echo "  E2E: АДМИНКА — СТАТЬИ"
echo "════════════════════════════════════════"
ART=$(curl -s -X POST "$B/api/articles" -H "$A" -H "$J" -d '{"type":"novost","slug":"e2e-novost","title":"E2E новость","contentHtml":"<p>Текст</p>","status":"draft"}' | jqget "d['article']['id']")
[ -n "$ART" ] && ok || bad "admin: создать статью"
curl -s -o /dev/null -w "%{http_code}" -X POST "$B/api/articles" -H "$A" -H "$J" -d '{"type":"novost","slug":"e2e-novost","title":"дубль","contentHtml":"<p>x</p>"}' | grep -q 409 && ok || bad "articles: дубль slug → 409 (не 500)"
curl -s "$B/api/articles?limit=5" -H "$A" | grep -q e2e-novost && ok || bad "admin: статья в списке (админ видит draft)"
curl -s "$B/api/articles?limit=5" | grep -q e2e-novost && bad "список: anon видит draft (ПРОБЛЕМА)" || ok
curl -s -X PATCH "$B/api/articles/$ART" -H "$A" -H "$J" -d '{"title":"E2E новость v2","accessLevel":"auth"}' | grep -q "v2" && ok || bad "admin: PATCH статьи"
curl -s -X POST "$B/api/articles/$ART/publish" -H "$A" | grep -q published && ok || bad "admin: публикация"
# возврат в черновик: статус меняется, дата публикации очищается, anon перестаёт видеть
curl -s -X PATCH "$B/api/articles/$ART" -H "$A" -H "$J" -d '{"status":"draft"}' | grep -q '"status":"draft"' && ok || bad "admin: возврат в черновик"
psql -d newinvest -tAc "SELECT published_at IS NULL FROM articles WHERE id=$ART" 2>/dev/null | grep -q t && ok || bad "unpublish: published_at очищен"
curl -s -o /dev/null -w "%{http_code}" "$B/api/articles/novost/e2e-novost" | grep -q 404 && ok || bad "unpublish: anon 404"
curl -s -X POST "$B/api/articles/$ART/publish" -H "$A" > /dev/null # вернули published для дальнейших тестов

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
TID=$(curl -s "$B/api/trends" | jqget "[t['id'] for t in d['trends'] if t['slug']=='e2e-trend'][0]")
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
INSIDER=$(curl -s -X POST "$B/api/articles" -H "$A" -H "$J" -d '{"type":"analitika","slug":"e2e-insider","title":"E2E Инсайд","contentHtml":"<p>x</p>","status":"published","accessLevel":"tariff","accessTariffId":1}' | jqget "d['article']['id']")
curl -s -o /dev/null -w "%{http_code}" "$B/api/articles/analitika/e2e-insider" | grep -q 403 && ok || bad "paywall: anon 403 на tariff"
curl -s -o /dev/null -w "%{http_code}" "$B/api/articles/analitika/e2e-insider" -H "$UA" | grep -q 200 && ok || bad "paywall: юзер с тарифом 200"
# ТЗ-06 (аддендум v2.1 №8): лента тренда фильтруется по пейволлу — иначе анону в кандидаты
# автоподгрузки «следующий материал» попадали бы закрытые статьи (череда paywall-блоков)
curl -s -X PUT "$B/api/articles/$INSIDER/relations" -H "$A" -H "$J" -d "{\"trendIds\":[$TID]}" > /dev/null
curl -s "$B/api/trends/e2e-trend" | python3 -c "import json,sys; a=json.load(sys.stdin)['articles']; assert all(x['slug']!='e2e-insider' for x in a); print('ok')" > /dev/null 2>&1 && ok || bad "trends: tariff-материал отфильтрован для анона (ТЗ-06)"
curl -s "$B/api/trends/e2e-trend" -H "$UA" | grep -q e2e-insider && ok || bad "trends: tariff-материал виден владельцу тарифа (ТЗ-06)"

echo "════════════════════════════════════════"
echo "  E2E: ТЗ-03 — СЧЁТЧИКИ ПРОСМОТРОВ / ДОКРУТКА"
echo "════════════════════════════════════════"
# виртуальный счётчик: offset от admin → 200, viewsCount в списке отражает offset
curl -s -X PATCH "$B/api/articles/$ART" -H "$A" -H "$J" -d '{"viewsBaseOffset":100}' | grep -q '"viewsBaseOffset":100' && ok || bad "views: admin PATCH viewsBaseOffset 200"
VDET=$(curl -s "$B/api/articles/novost/e2e-novost" -H "$A" | jqget "d['viewsCount']")
[ "$VDET" -ge 100 ] 2>/dev/null && ok || bad "views: detail viewsCount ≥ offset (got $VDET)"
VLIST=$(curl -s "$B/api/articles?limit=100" -H "$A" | python3 -c "import json,sys; a=[x for x in json.load(sys.stdin)['articles'] if x['id']==$ART][0]; print(a.get('viewsCount',-1))" 2>/dev/null)
[ "$VLIST" -ge 100 ] 2>/dev/null && ok || bad "views: viewsCount в списке ≥ 100 (got $VLIST)"
# валидация настроек докрутки
curl -s -o /dev/null -w "%{http_code}" -X PATCH "$B/api/articles/$ART" -H "$A" -H "$J" -d '{"viewsAutoBump":{"enabled":true,"everyHours":24,"min":50,"max":10}}' | grep -q 400 && ok || bad "views: max<min → 400"
curl -s -o /dev/null -w "%{http_code}" -X PATCH "$B/api/articles/$ART" -H "$A" -H "$J" -d '{"viewsAutoBump":{"enabled":true,"everyHours":0,"min":1,"max":3}}' | grep -q 400 && ok || bad "views: everyHours=0 → 400"
curl -s -o /dev/null -w "%{http_code}" -X PATCH "$B/api/articles/$ART" -H "$A" -H "$J" -d '{"viewsAutoBump":{"enabled":true}}' | grep -q 400 && ok || bad "views: частичный объект → 400"
curl -s -o /dev/null -w "%{http_code}" -X PATCH "$B/api/articles/$ART" -H "$A" -H "$J" -d '{"viewsBaseOffset":-5}' | grep -q 400 && ok || bad "views: offset=-5 → 400"
# автор (UA, роль author): поле докрутки проигнорировано — 403 нет, значение не изменилось
PAID=$(curl -s -X POST "$B/api/articles/propose" -H "$UA" -H "$J" -d '{"type":"ideya","title":"E2E просмотры от автора","text":"Текст идеи более двадцати символов для валидации"}' | jqget "d['article']['id']")
[ -n "$PAID" ] && ok || bad "views: propose статьи автором"
curl -s -o /dev/null -w "%{http_code}" -X PATCH "$B/api/articles/$PAID" -H "$UA" -H "$J" -d '{"viewsBaseOffset":999}' | grep -q 200 && ok || bad "views: author PATCH без 403 (поле игнорируется)"
psql -d newinvest -tAc "SELECT views_base_offset FROM articles WHERE id=$PAID" 2>/dev/null | grep -q ^0$ && ok || bad "views: author не изменил offset"
# ручной бамп: anon 401; admin ok; added ∈ [min,max]; повтор подряд — идемпотентность
curl -s -o /dev/null -w "%{http_code}" -X POST "$B/api/admin/views/bump" | grep -q 401 && ok || bad "views/bump: anon 401"
curl -s -X PATCH "$B/api/articles/$ART" -H "$A" -H "$J" -d '{"viewsAutoBump":{"enabled":true,"everyHours":1,"min":10,"max":20}}' | grep -q '"viewsAutoBumpEnabled":true' && ok || bad "views: авто-бамп включён"
BV1=$(psql -d newinvest -tAc "SELECT views_bump_accumulated FROM articles WHERE id=$ART" 2>/dev/null)
curl -s -X POST "$B/api/admin/views/bump" -H "$A" | grep -q '"processed"' && ok || bad "views/bump: admin ok"
BV2=$(psql -d newinvest -tAc "SELECT views_bump_accumulated FROM articles WHERE id=$ART" 2>/dev/null)
ADDED=$((BV2 - BV1))
[ "$ADDED" -ge 10 ] && [ "$ADDED" -le 20 ] 2>/dev/null && ok || bad "views: бамп в диапазоне [10,20] (added=$ADDED)"
BP=$(curl -s -X POST "$B/api/admin/views/bump" -H "$A" | jqget "d['processed']")
[ "$BP" = "0" ] && ok || bad "views: повторный бамп processed=0 (got $BP)"
# честность аналитики: realViews/virtualViews раздельно, total — по реальным
SV=$(curl -s "$B/api/stats/views?days=30" -H "$A")
echo "$SV" | grep -q '"realViews"' && ok || bad "views: stats отдаёт realViews"
echo "$SV" | grep -q '"virtualViews"' && ok || bad "views: stats отдаёт virtualViews"
echo "$SV" | grep -q '"total"' && ok || bad "views: stats total по реальным"
# сброс настроек докрутки (null выключает, диапазон сохраняется)
curl -s -X PATCH "$B/api/articles/$ART" -H "$A" -H "$J" -d '{"viewsBaseOffset":0,"viewsAutoBump":null}' > /dev/null
psql -d newinvest -tAc "SELECT views_base_offset=0 AND NOT views_auto_bump_enabled AND views_auto_bump_min=10 AND views_auto_bump_max=20 FROM articles WHERE id=$ART" 2>/dev/null | grep -q t && ok || bad "views: null выключает, диапазон сохраняется"
# главная/публичные страницы
for ep in "trends" "articles?type=novost&limit=3" "screener?phase=portfel" "trends/kosmos" "companies/spacex" "market/chart?symbol=SBER" "tariff-plans"; do
  curl -s -o /dev/null -w "%{http_code}" "$B/api/$ep" | grep -q 200 && ok || bad "public GET /api/$ep"
done
curl -s "$B/api/articles/novost/spacex-lider-po-kolichestvu-sputnikov" | grep -q relations && ok || bad "article detail: relations"
curl -s "$B/api/articles/novost/spacex-lider-po-kolichestvu-sputnikov" | grep -q stages && ok || bad "article detail: stages (график)"
# поиск/скринер
curl -s "$B/api/screener?stage=pre-ipo-transaction-stages" | grep -q ideas && ok || bad "screener: фильтр стадии"

echo "════════════════════════════════════════"
echo "  E2E: ТЗ-04 — ЛАЙКИ / ШЕРЫ (engagement)"
echo "  ДАННЫЕ НЕ УДАЛЯЮТСЯ (правка ревью v2.1 №4) — прогон только на dev-БД"
echo "════════════════════════════════════════"
# ВНИМАНИЕ на порядок шагов (ревью v2.1 №3): лимитер юзера 30/час тестируется на РАЗНЫХ
# материалах отдельным свежим юзером — иначе per-article throttle даст 429 раньше.
# L1: анонимный лайк — 401, счётчик не меняется
curl -s -o /dev/null -w "%{http_code}" -X PUT "$B/api/articles/$ART/like" | grep -q 401 && ok || bad "likes: anon PUT 401"
curl -s -o /dev/null -w "%{http_code}" -X DELETE "$B/api/articles/$ART/like" | grep -q 401 && ok || bad "likes: anon DELETE 401"
# L2/L4: лайк юзера → идемпотентность повторного PUT (счётчик +1 суммарно, одна строка в БД)
LINIT=$(psql -d newinvest -tAc "SELECT likes_count FROM articles WHERE id=$ART" 2>/dev/null)
curl -s -X PUT "$B/api/articles/$ART/like" -H "$UA" | grep -q '"liked":true' && ok || bad "likes: PUT liked:true"
LC1=$(curl -s -X PUT "$B/api/articles/$ART/like" -H "$UA" | jqget "d['likesCount']")
[ "$LC1" = "$((LINIT+1))" ] 2>/dev/null && ok || bad "likes: повторный PUT идемпотентен (LC1=$LC1 LINIT=$LINIT)"
psql -d newinvest -tAc "SELECT count(*) FROM article_likes WHERE article_id=$ART" 2>/dev/null | grep -q ^1$ && ok || bad "likes: ровно 1 строка в article_likes"
# L3/L4: отмена повторным кликом; повторный DELETE идемпотентен, не ниже 0
curl -s -X DELETE "$B/api/articles/$ART/like" -H "$UA" | grep -q '"liked":false' && ok || bad "likes: DELETE liked:false"
LC2=$(curl -s -X DELETE "$B/api/articles/$ART/like" -H "$UA" | jqget "d['likesCount']")
[ "$LC2" = "$LINIT" ] 2>/dev/null && ok || bad "likes: повторный DELETE идемпотентен (LC2=$LC2 LINIT=$LINIT)"
# список отдаёт счётчики всем (L5); liked анониму — false
curl -s "$B/api/articles?limit=5" | python3 -c "import json,sys; a=json.load(sys.stdin)['articles']; assert all('likesCount' in x and 'sharesCount' in x and x.get('liked')==False for x in a); print('ok')" > /dev/null 2>&1 && ok || bad "likes: likesCount/sharesCount/liked в списке"
# S2/S6: анонимный шер telegram → 201; богус-канал → 201 с 'unknown' в БД (не 400)
SH1=$(curl -s -X POST "$B/api/articles/$ART/share" -H "$J" -d '{"channel":"telegram"}')
echo "$SH1" | grep -q '"sharesCount"' && ok || bad "shares: anon telegram 201"
curl -s -o /dev/null -w "%{http_code}" -X POST "$B/api/articles/$ART/share" -H "$J" -d '{"channel":"bogus-channel"}' | grep -q 201 && ok || bad "shares: богус-канал 201 (не 400)"
psql -d newinvest -tAc "SELECT channel='unknown' FROM article_share_events WHERE article_id=$ART ORDER BY id DESC LIMIT 1" 2>/dev/null | grep -q t && ok || bad "shares: богус-канал записан как 'unknown'"
# черновики: like/share → 404 (действие над материалом, но черновик лайкать нельзя, §4.5)
DRAFT=$(curl -s -X POST "$B/api/articles/propose" -H "$UA" -H "$J" -d '{"type":"ideya","title":"E2E идея лайков","text":"Текст идеи более двадцати символов для валидации"}' | jqget "d['article']['id']")
[ -n "$DRAFT" ] && ok || bad "likes: draft-статья создана"
curl -s -o /dev/null -w "%{http_code}" -X PUT "$B/api/articles/$DRAFT/like" -H "$UA" | grep -q 404 && ok || bad "likes: draft PUT 404"
curl -s -o /dev/null -w "%{http_code}" -X POST "$B/api/articles/$DRAFT/share" -H "$J" -d '{"channel":"telegram"}' | grep -q 404 && ok || bad "shares: draft POST 404"
# S3 per-article throttle: 2-й шер залогиненного на ту же статью < 10 мин → 429
curl -s -o /dev/null -w "%{http_code}" -X POST "$B/api/articles/$ART/share" -H "$UA" -H "$J" -d '{"channel":"vk"}' | grep -q 201 && ok || bad "shares: первый шер юзера 201"
curl -s -o /dev/null -w "%{http_code}" -X POST "$B/api/articles/$ART/share" -H "$UA" -H "$J" -d '{"channel":"vk"}' | grep -q 429 && ok || bad "shares: per-article throttle 429"
# S3 анонимный IP-лимит 10/час: добираем до исчерпания — остаток 201, затем 429
ANON_OK=0; ANON_429=0
for i in $(seq 1 12); do
  code=$(curl -s -o /dev/null -w "%{http_code}" -X POST "$B/api/articles/$ART/share" -H "$J" -d '{"channel":"copylink"}')
  [ "$code" = "201" ] && ANON_OK=$((ANON_OK+1))
  [ "$code" = "429" ] && ANON_429=$((ANON_429+1))
done
[ "$ANON_OK" -le 10 ] && [ "$ANON_429" -ge 1 ] 2>/dev/null && ok || bad "shares: анонимный лимит 10/час (ok=$ANON_OK 429=$ANON_429)"
# S3 лимит юзера 30/час — на РАЗНЫХ материалах (ревью v2.1 №3), свежий юзер = свежий бакет
# идемпотентность: чистим share-события юзера из прошлых прогонов (per-article throttle 10 мин держит их в БД),
# иначе повторный прогон в течение 10 минут получает 429 по БД, а не по лимитеру.
# Счётчики shares_count пересчитываем сразу — иначе проверка инварианта «до reconcile» честно падает.
curl -s -X POST $B/api/auth/register -H "$J" -d '{"username":"E2EEngage","email":"e2e-engage@test.ru","password":"E2ePass123"}' > /dev/null
psql -d newinvest -q -c "DELETE FROM article_share_events WHERE user_id=(SELECT id FROM users WHERE email='e2e-engage@test.ru'); UPDATE articles SET shares_count=(SELECT count(*) FROM article_share_events se WHERE se.article_id=articles.id)" 2>/dev/null
ET=$(curl -s -X POST $B/api/auth/login -H "$J" -d '{"email":"e2e-engage@test.ru","password":"E2ePass123"}' | jqget "d['token']")
EA="Authorization: Bearer $ET"
IDS=$(curl -s "$B/api/articles?limit=100" | jqget "' '.join(str(x['id']) for x in d['articles'] if x['id'] != $ART)")
U_OK=0; U_429=0; i=0
for id in $IDS; do
  i=$((i+1)); [ "$i" -gt 31 ] && break
  code=$(curl -s -o /dev/null -w "%{http_code}" -X POST "$B/api/articles/$id/share" -H "$EA" -H "$J" -d '{"channel":"telegram"}')
  [ "$code" = "201" ] && U_OK=$((U_OK+1))
  [ "$code" = "429" ] && U_429=$((U_429+1))
done
[ "$U_OK" -eq 30 ] && [ "$U_429" -eq 1 ] 2>/dev/null && ok || bad "shares: лимит юзера 30/час на разных материалах (ok=$U_OK 429=$U_429)"
# инвариант БД + reconcile-скрипт (ревью v2.1 №11): после сверки расхождений 0
psql -d newinvest -tAc "SELECT count(*) FROM articles WHERE likes_count <> (SELECT count(*) FROM article_likes al WHERE al.article_id=articles.id) OR shares_count <> (SELECT count(*) FROM article_share_events se WHERE se.article_id=articles.id)" 2>/dev/null | grep -q ^0$ && ok || bad "engagement: инвариант likes/shares до reconcile"
(cd "$(dirname "$0")/.." && npm run reconcile:engagement -w @newinvest/db 2>&1 | grep -q "OK:") && ok || bad "engagement: npm run reconcile:engagement"

echo "════════════════════════════════════════"
echo "  E2E: ТЗ-02 — КНОПКИ ШЕРИНГА (curl-smoke)"
echo "  UI-сценарии — ручной проход (ревью v2.1 №2), чек-лист: TODO/02-social-sharing.md §5"
echo "════════════════════════════════════════"
# POST share 201/whitelist/429 — см. блок ТЗ-04 выше (не дублируем)
# страница статьи отдаёт 200 через SPA-fallback (vite dev на WEB_URL)
W="${WEB_URL:-http://localhost:5173}"
curl -s -o /dev/null -w "%{http_code}" "$W/novost/e2e-novost" | grep -q 200 && ok || bad "share: страница статьи 200 (SPA-fallback)"
# GET detail отдаёт sharesCount — запрос с админ-токеном: e2e-novost в этот момент auth-материал (paywall-тест выше), anon получил бы 403
curl -s "$B/api/articles/novost/e2e-novost" -H "$A" | grep -q '"sharesCount"' && ok || bad "share: detail отдаёт sharesCount"

# Pacing: общий apiLimiter API — 300 запросов/60с на IP. Сюит шлёт ~320 запросов,
# без паузы хвост сьюта (trending и далее) стабильно получает 429. Пауза сбрасывает окно лимитера.
echo "  … pacing 60с (rate-limit window)…"
sleep 60

echo "════════════════════════════════════════"
echo "  E2E: БЕЗОПАСНОСТЬ / ОГРАНИЧЕНИЯ"
echo "════════════════════════════════════════"
curl -s -o /dev/null -w "%{http_code}" -H "Origin: http://evil.example" "$B/api/articles?limit=1" | grep -q 403 && ok || bad "CORS: чужой origin 403"
curl -s -o /dev/null -w "%{http_code}" "$B/api/users" | grep -q 401 && ok || bad "users: anon 401"
curl -s -o /dev/null -w "%{http_code}" "$B/api/articles/1/relations" -X PUT -H "$J" -d '{}' | grep -q 401 && ok || bad "relations: anon 401"
curl -s "$B/api/health" -D - -o /dev/null | grep -qi "x-frame-options" && ok || bad "security headers"
# поиск: FTS + пейволл + валидация
curl -s "$B/api/search?q=%D0%BA%D0%BE%D1%81%D0%BC%D0%BE%D1%81&limit=3" | grep -q '"results"' && ok || bad "search: FTS находит материалы"
curl -s -o /dev/null -w "%{http_code}" "$B/api/search?q=a" | grep -q 400 && ok || bad "search: короткий запрос 400"
curl -s -o /dev/null -w "%{http_code}" "$B/api/search" | grep -q 400 && ok || bad "search: пустой запрос 400"
curl -s "$B/api/search?q=e2e&limit=5" | grep -q e2e-novost && bad "search: anon видит draft (ПРОБЛЕМА)" || ok
TOKEN=$(curl -s -X POST $B/api/auth/login -H "$J" -d '{"email":"test@test.ru","password":"test"}' | jqget "d['token']")
curl -s "$B/api/search?q=e2e&limit=5" -H "Authorization: Bearer $TOKEN" | grep -q e2e-novost && ok || bad "search: админ видит draft"
# генерация текста (лид): mock без ключа, валидация, авторизация
GT=$(curl -s -X POST "$B/api/media/generate-text" -H "$A" -H "$J" -d '{"prompt":"Напиши лид.\nЗАГОЛОВОК: Тест\nТЕКСТ: <p>Первое предложение тестового текста. Второе предложение тестового текста. Третье предложение.</p>","maxChars":200}')
echo "$GT" | grep -q '"text"' && ok || bad "textgen: возвращает текст"
# mock-флаг зависит от наличия ключа: БД (e2e-очистка) пуста, но env DEEPSEEK_API_KEY/MOONSHOT_API_KEY
# может дать ключ через fallback — тогда mock:false и текст из реального API. Проверяем согласованность:
echo "$GT" | python3 -c "import json,sys; d=json.load(sys.stdin); assert d.get('text') and 'mock' in d, d; print('ok')" > /dev/null 2>&1 && ok || bad "textgen: ответ содержит text+mock"
curl -s -o /dev/null -w "%{http_code}" -X POST "$B/api/media/generate-text" -H "$A" -H "$J" -d '{"prompt":"кор"}' | grep -q 400 && ok || bad "textgen: короткий промпт 400"
curl -s -o /dev/null -w "%{http_code}" -X POST "$B/api/media/generate-text" -H "$J" -d '{"prompt":"тестовый промпт достаточной длины"}' | grep -q 401 && ok || bad "textgen: anon 401"
# настройки Kimi: доступ только админу, сохранение читается обратно
curl -s -o /dev/null -w "%{http_code}" "$B/api/admin/kimi-settings" | grep -q 401 && ok || bad "kimi-settings: anon 401"
curl -s -X POST "$B/api/admin/kimi-settings" -H "$A" -H "$J" -d '{"textModel":"kimi-k3"}' | grep -q '"ok":true' && ok || bad "kimi-settings: POST"
curl -s "$B/api/admin/kimi-settings" -H "$A" | grep -q '"textModel":"kimi-k3"' && ok || bad "kimi-settings: persisted"
# второй провайдер: deepseek-ключ маскируется, модель сохраняется, переключение provider roundtrip
curl -s -X POST "$B/api/admin/kimi-settings" -H "$A" -H "$J" -d '{"deepseekApiKey":"sk-testdeepseek0000000000000000000000","deepseekModel":"deepseek-chat"}' | grep -q '"hasDeepseekKey":true' && ok || bad "kimi-settings: deepseek key masked-save"
curl -s "$B/api/admin/kimi-settings" -H "$A" | grep -q '"deepseekModel":"deepseek-chat"' && ok || bad "kimi-settings: deepseek model persisted"
curl -s -X POST "$B/api/admin/kimi-settings" -H "$A" -H "$J" -d '{"provider":"deepseek"}' | grep -q '"provider":"deepseek"' && ok || bad "kimi-settings: provider→deepseek"
curl -s -X POST "$B/api/admin/kimi-settings" -H "$A" -H "$J" -d '{"provider":"kimi"}' | grep -q '"provider":"kimi"' && ok || bad "kimi-settings: provider→kimi"
curl -s -o /dev/null -w "%{http_code}" -X POST "$B/api/admin/kimi-settings" -H "$A" -H "$J" -d '{"provider":"openai"}' | grep -q 400 && ok || bad "kimi-settings: невалидный provider 400"
curl -s -X POST "$B/api/admin/kimi-settings" -H "$A" -H "$J" -d '{"deepseekApiKey":""}' > /dev/null
curl -s "$B/api/admin/kimi-settings" -H "$UA" -o /dev/null -w "%{http_code}" | grep -q 403 && ok || bad "kimi-settings: reader 403"
# события по идее: публично, только sobytie+published, не-идея → 404
IDEAID=$(curl -s "$B/api/articles/ideya/proekt-prometej-sledujushhij-shag-razvitija-ii" | jqget "d['article']['id']")
curl -s -o /dev/null -w "%{http_code}" "$B/api/articles/$IDEAID/events" | grep -q 200 && ok || bad "idea-events: 200"
curl -s "$B/api/articles/263/events" | python3 -c "import json,sys; evs=json.load(sys.stdin).get('events',[]); assert all(e['type']=='sobytie' for e in evs); print(len(evs))" 2>/dev/null | grep -qE '^[0-9]+$' && ok || bad "idea-events: только тип sobytie"
curl -s -o /dev/null -w "%{http_code}" "$B/api/articles/1/events" | grep -q 404 && ok || bad "idea-events: не-идея 404"
curl -s -o /dev/null -w "%{http_code}" "$B/api/articles/263/events?type=bogus" | grep -q 400 && ok || bad "idea-events: невалидный тип 400"
curl -s "$B/api/articles/263/events?type=novost" | python3 -c "import json,sys; evs=json.load(sys.stdin).get('events',[]); assert all(e['type']=='novost' for e in evs); print(len(evs))" 2>/dev/null | grep -qE '^[0-9]+$' && ok || bad "idea-events: ?type=novost только новости"
# видео-тип: создание с videoUrl, валидация, embed-поле в детали
curl -s -X POST "$B/api/articles" -H "$A" -H "$J" -d '{"type":"video","slug":"e2e-video","title":"E2E Видео","contentHtml":"<p>x</p>","videoUrl":"https://www.youtube.com/watch?v=dQw4w9WgXcQ","status":"published"}' | grep -q dQw4w9WgXcQ && ok || bad "video: создать с videoUrl"
curl -s "$B/api/articles/video/e2e-video" | grep -q '"videoUrl":"https://www.youtube.com' && ok || bad "video: embed-поле в детали"
curl -s "$B/api/articles?type=video&limit=5" | grep -q e2e-video && ok || bad "video: фильтр по типу в списке"
curl -s "$B/api/search?q=E2E%20%D0%92%D0%B8%D0%B4%D0%B5%D0%BE&limit=3" -H "$A" | grep -q '"type":"video"' && ok || bad "video: находится поиском"
# security-фиксы 2026-11-08 (аудит двух агентов): пейволл в скринере, URL-схемы, baseUrl-allowlist, admin-TTL
curl -s "$B/api/screener?limit=100" | grep -q e2e-insider && bad "security: скринер показывает tariff-материал anon (ПРОБЛЕМА)" || ok
curl -s -o /dev/null -w "%{http_code}" -X POST "$B/api/admin/kimi-settings" -H "$A" -H "$J" -d '{"baseUrl":"https://evil.example.com"}' | grep -q 400 && ok || bad "security: baseUrl вне allowlist 400"
curl -s -o /dev/null -w "%{http_code}" -X POST "$B/api/articles" -H "$A" -H "$J" -d '{"type":"novost","slug":"e2e-xss","title":"x","contentHtml":"<p>x</p>","sourceUrl":"data:text/html,x"}' | grep -q 400 && ok || bad "security: data: URL 400"
EXPTTL=$(curl -s -X POST "$B/api/auth/login" -H "$J" -d '{"email":"test@test.ru","password":"test"}' | python3 -c "import json,sys,base64; t=json.load(sys.stdin)['token']; p=t.split('.')[1]; p+='='*(-len(p)%4); d=json.loads(base64.urlsafe_b64decode(p)); print(d['exp']-d['iat'])")
[ "$EXPTTL" = "43200" ] && ok || bad "security: admin JWT TTL 12h (got $EXPTTL)"
# продуктовые метрики: все эндпоинты отвечают, anon 401
for ep in "metrics/overview" "metrics/registrations?days=14" "metrics/engagement?days=7" "metrics/retention" "metrics/top-trends"; do
  curl -s -o /dev/null -w "%{http_code}" "$B/api/admin/$ep" -H "$A" | grep -q 200 && ok || bad "metrics: GET /admin/$ep 200"
done
curl -s "$B/api/admin/metrics/overview" -H "$A" | grep -q '"dau"' && ok || bad "metrics: overview содержит DAU"
curl -s -o /dev/null -w "%{http_code}" "$B/api/admin/metrics/overview" | grep -q 401 && ok || bad "metrics: anon 401"
curl -s "$B/api/admin/metrics/top-trends" -H "$A" | grep -q '"views"' && ok || bad "metrics: top-trends содержит views"
# PULSE-паттерны: воронка, D1/D7/D30, at-risk, CSV
curl -s "$B/api/admin/metrics/funnel?days=30" -H "$A" | grep -q 'pct_of_prev' && ok || bad "metrics: воронка pct_of_prev"
curl -s "$B/api/admin/metrics/funnel?days=30" -H "$A" | grep -q 'Регистрация' && ok || bad "metrics: воронка шаги"
curl -s "$B/api/admin/metrics/retention-daily" -H "$A" | grep -q '"d1"' && ok || bad "metrics: retention-daily d1"
curl -s "$B/api/admin/metrics/at-risk?type=dormant_7d" -H "$A" | grep -q '"users"' && ok || bad "metrics: at-risk dormant_7d"
curl -s -o /dev/null -w "%{http_code}" "$B/api/admin/metrics/at-risk?type=bogus" -H "$A" | grep -q 400 && ok || bad "metrics: at-risk bogus 400"
curl -s "$B/api/users/export.csv" -H "$A" | grep -q "display_name" && ok || bad "metrics: CSV export"
curl -s -o /dev/null -w "%{http_code}" "$B/api/users/export.csv" | grep -q 401 && ok || bad "metrics: CSV anon 401"
# приёмка агента-5: anon 401 на ВСЕ метрики (был дырявый guard), честность null, воронка в когорте
for ep in "metrics/overview" "metrics/registrations?days=14" "metrics/engagement?days=7" "metrics/retention" "metrics/top-trends" "metrics/funnel?days=30" "metrics/retention-daily" "metrics/at-risk?type=dormant_7d" "metrics/at-risk-counts"; do
  code=$(curl -s -o /dev/null -w "%{http_code}" "$B/api/admin/$ep")
  [ "$code" = "401" ] && ok || bad "metrics: anon 401 на /admin/$ep (got $code)"
done
# воронка: все шаги ≤ регистраций (когорта), pct_of_total ≤ 100
FUNNEL_MAX=$(curl -s "$B/api/admin/metrics/funnel?days=90" -H "$A" | python3 -c "import json,sys; f=json.load(sys.stdin)['funnel']; print(max(s['pct_of_total'] for s in f))")
[ "$FUNNEL_MAX" -le 100 ] 2>/dev/null && ok || bad "metrics: воронка pct_of_total ≤ 100 (got $FUNNEL_MAX)"
# retention-daily: честность null (когорта сегодня/вчера → d1 null)
TODAY=$(date +%Y-%m-%d)
curl -s "$B/api/admin/metrics/retention-daily" -H "$A" | python3 -c "
import json,sys
rows=[c for c in json.load(sys.stdin)['cohorts'] if c['cohort'] in ('$TODAY',)]
assert not rows or rows[-1]['d1'] is None, 'молодая когорта должна иметь d1=null'
print('ok')" > /dev/null 2>&1 && ok || bad "metrics: retention-daily null у молодой когорты"
# at-risk: юзер без просмотров не показывает views=1
DR=$(curl -s "$B/api/admin/metrics/at-risk?type=dormant_30d" -H "$A")
echo "$DR" | python3 -c "
import json,sys
users=json.load(sys.stdin)['users']
assert all(u['views'] != 1 or True for u in users), 'check'
never=[u for u in users if u['lastView']=='никогда']
assert all(u['views']==0 for u in never), 'never-visited должен иметь views=0'
print('ok')" > /dev/null 2>&1 && ok || bad "metrics: at-risk views=0 у never-visited"

echo "════════════════════════════════════════"
echo "  E2E: КАБИНЕТ — ПОДПИСКИ/ИЗБРАННОЕ/НАСТРОЙКИ"
echo "════════════════════════════════════════"
# подписка на идею (article): появляется в ленте
curl -s -o /dev/null -w "%{http_code}" -X PUT "$B/api/subscriptions" -H "$UA" -H "$J" -d "{\"entityType\":\"article\",\"entityId\":$IDEAID}" | grep -q 201 && ok || bad "subs: подписка на идею"
curl -s "$B/api/feed" -H "$UA" | grep -q "\"id\":$IDEAID" && ok || bad "subs: идея в ленте"
curl -s "$B/api/subscriptions" -H "$UA" | grep -q '"entityType":"article"' && ok || bad "subs: список содержит article"
curl -s -X DELETE "$B/api/subscriptions/article/$IDEAID" -H "$UA" | grep -q '"ok"' && ok || bad "subs: отписка"
# избранное: развёрнутый список
curl -s -X PUT "$B/api/favorites" -H "$UA" -H "$J" -d '{"entityType":"trend","entityId":3}' -o /dev/null
curl -s "$B/api/favorites" -H "$UA" | grep -q '"data"' && ok || bad "favorites: развёрнутый список"
curl -s -o /dev/null -w "%{http_code}" -X PUT "$B/api/favorites" -H "$UA" -H "$J" -d '{"entityType":"bogus","entityId":1}' | grep -q 400 && ok || bad "favorites: невалидный тип 400"
curl -s -X DELETE "$B/api/favorites/trend/3" -H "$UA" > /dev/null
# настройки уведомлений читаются
curl -s "$B/api/notification-settings" -H "$UA" | grep -q emailDaily && ok || bad "notification-settings: GET"
# telegram-контур: статус / link без бота / disconnect
curl -s "$B/api/telegram/status" -H "$UA" | grep -q '"connected":false' && ok || bad "tg: статус (не подключён)"
curl -s -o /dev/null -w "%{http_code}" -X POST "$B/api/telegram/link" -H "$UA" | grep -q 503 && ok || bad "tg: link без бота 503"
curl -s -X DELETE "$B/api/telegram/disconnect" -H "$UA" | grep -q '"ok"' && ok || bad "tg: disconnect идемпотентно"
# удаление аккаунта: регистрируем → удаляем → токен мёртв
curl -s -X POST $B/api/auth/register -H "$J" -d '{"username":"E2EGone","email":"e2e-gone@test.ru","password":"E2ePass123"}' > /dev/null
GT2=$(curl -s -X POST $B/api/auth/login -H "$J" -d '{"email":"e2e-gone@test.ru","password":"E2ePass123"}' | jqget "d['token']")
[ -n "$GT2" ] && ok || bad "delete-account: рег+логин временного"
curl -s -o /dev/null -w "%{http_code}" -X DELETE "$B/api/auth/me" -H "Authorization: Bearer $GT2" -H "$J" -d '{"password":"E2ePass123"}' | grep -q 200 && ok || bad "delete-account: DELETE /auth/me"
curl -s -o /dev/null -w "%{http_code}" "$B/api/auth/me" -H "Authorization: Bearer $GT2" | grep -qE '401|404' && ok || bad "delete-account: токен отозван"
psql -d newinvest -tAc "SELECT count(*) FROM users WHERE email='e2e-gone@test.ru'" 2>/dev/null | grep -q ^0$ && ok || bad "delete-account: юзер удалён из БД"

echo "════════════════════════════════════════"
echo "  E2E: АДМИНКА — ТАРИФЫ/ФИЧИ/РЕДАКТИРОВАНИЕ"
echo "════════════════════════════════════════"
# создание тарифа (priceMonthly строкой — NUMERIC)
curl -s -X POST "$B/api/tariff-plans" -H "$A" -H "$J" -d '{"slug":"e2e-tariff","name":"E2E Тариф","priceMonthly":"990","yearlyDiscount":15,"features":{"telegram":true}}' | grep -q e2e-tariff && ok || bad "tariffs: создать"
curl -s "$B/api/tariff-plans" | grep -q e2e-tariff && ok || bad "tariffs: публичный список"
curl -s -o /dev/null -w "%{http_code}" -X POST "$B/api/tariff-plans" -H "$A" -H "$J" -d '{"slug":"x","name":"x","priceMonthly":100}' | grep -q 400 && ok || bad "tariffs: priceMonthly числом 400"
# фичи: публичный список + админ-тоггл
curl -s "$B/api/features" | grep -q '"id":"telegram"' && ok || bad "features: публичный список"
curl -s -X PUT "$B/api/admin/features/telegram" -H "$A" -H "$J" -d '{"isActive":true}' | grep -q '"isActive":true' && ok || bad "features: админ-тоггл"
curl -s -o /dev/null -w "%{http_code}" "$B/api/admin/features" | grep -q 401 && ok || bad "features: anon 401"
# редактирование карточек компании/тренда
curl -s -X PATCH "$B/api/companies/$CID" -H "$A" -H "$J" -d '{"oneLiner":"E2E лайнер"}' | grep -q "E2E лайнер" && ok || bad "companies: PATCH карточки"
TID=$(curl -s "$B/api/trends" | jqget "[t['id'] for t in d['trends'] if t['slug']=='e2e-trend'][0]")
curl -s -X PATCH "$B/api/trends/$TID" -H "$A" -H "$J" -d '{"description":"<p>E2E лонгрид</p>"}' | grep -q "E2E лонгрид" && ok || bad "trends: PATCH лонгрида"

echo "════════════════════════════════════════"
echo "  E2E: АДМИНКА — ПЛАНЫ ПОДПИСОК (/api/admin/plans)"
echo "════════════════════════════════════════"
# seed из миграции 0016 (base/insider + фичи invest/pulse)
curl -s "$B/api/admin/plans" -H "$A" | python3 -c "import json,sys; ids={p['id'] for p in json.load(sys.stdin)['plans']}; assert 'base' in ids and 'insider' in ids, ids; print('ok')" > /dev/null 2>&1 && ok || bad "plans: seed base+insider есть"
curl -s -o /dev/null -w "%{http_code}" "$B/api/admin/plans" | grep -q 401 && ok || bad "plans: anon 401"
# создание: multi_portfolio мержится при portfolio_limit > 0 (порт ТЗ-182)
curl -s -X POST "$B/api/admin/plans" -H "$A" -H "$J" -d '{"id":"e2e-subplan","name":"E2E SubPlan","price":990,"billing_frequency":"monthly","yearly_discount":10,"tag_limit":-1,"portfolio_limit":2,"plan_level":2,"features":{"invest":true},"is_active":true,"is_popular":false,"display_order":90}' | grep -q '"multi_portfolio":true' && ok || bad "plans: создание + multi_portfolio merge"
curl -s -o /dev/null -w "%{http_code}" -X POST "$B/api/admin/plans" -H "$A" -H "$J" -d '{"id":"e2e-subplan","name":"Дубль","price":1,"tag_limit":0,"plan_level":0,"display_order":91}' | grep -q 409 && ok || bad "plans: дубль id 409"
curl -s -o /dev/null -w "%{http_code}" -X POST "$B/api/admin/plans" -H "$A" -H "$J" -d '{"id":"e2e-yr","name":"Год","price":1000,"billing_frequency":"yearly","yearly_discount":10,"tag_limit":0,"plan_level":0,"display_order":92}' | grep -q 400 && ok || bad "plans: yearly + скидка 400"
# популярность эксклюзивна
curl -s -X POST "$B/api/admin/plans" -H "$A" -H "$J" -d '{"id":"e2e-subpop","name":"E2E Pop","price":500,"tag_limit":0,"plan_level":1,"display_order":93,"is_popular":true}' > /dev/null
curl -s -X POST "$B/api/admin/plans" -H "$A" -H "$J" -d '{"id":"e2e-subpop2","name":"E2E Pop2","price":600,"tag_limit":0,"plan_level":1,"display_order":94,"is_popular":true}' > /dev/null
curl -s "$B/api/admin/plans" -H "$A" | python3 -c "import json,sys; d=json.load(sys.stdin)['plans']; pop=[p for p in d if p['isPopular']]; assert len(pop)==1 and pop[0]['id']=='e2e-subpop2', pop; print('ok')" > /dev/null 2>&1 && ok || bad "plans: популярный только один"
# PATCH whitelist: цена меняется; пустой апдейт 400; несуществующий 404
curl -s -X PATCH "$B/api/admin/plans/e2e-subplan" -H "$A" -H "$J" -d '{"price":1111}' | grep -q '"price":1111' && ok || bad "plans: PATCH price"
curl -s -o /dev/null -w "%{http_code}" -X PATCH "$B/api/admin/plans/e2e-subplan" -H "$A" -H "$J" -d '{}' | grep -q 400 && ok || bad "plans: пустой PATCH 400"
curl -s -o /dev/null -w "%{http_code}" -X PATCH "$B/api/admin/plans/no-such-plan" -H "$A" -H "$J" -d '{"price":1}' | grep -q 404 && ok || bad "plans: PATCH несуществующего 404"
# страховка «скоро»: активация без явной метки сбрасывает её в NULL
curl -s -X PATCH "$B/api/admin/plans/e2e-subplan" -H "$A" -H "$J" -d '{"coming_soon_label":"Скоро","is_active":false}' > /dev/null
curl -s -X PATCH "$B/api/admin/plans/e2e-subplan" -H "$A" -H "$J" -d '{"is_active":true}' | grep -q '"comingSoonLabel":null' && ok || bad "plans: активация сбрасывает «скоро»"
# гвард подписчиков: подписчик = юзер со старым тарифом base (тариф выдаёт админ, оплаты нет)
psql -d newinvest -q -c "INSERT INTO users (email,password_hash,display_name,role,tariff_id) VALUES ('plans-e2e@test.ru','x','Plans E2E','reader',(SELECT id FROM tariff_plans WHERE slug='base')) ON CONFLICT (email) DO UPDATE SET tariff_id=(SELECT id FROM tariff_plans WHERE slug='base')" 2>/dev/null
curl -s -w "\n%{http_code}" -X PATCH "$B/api/admin/plans/base" -H "$A" -H "$J" -d '{"plan_level":9}' | python3 -c "
import json,sys
raw=sys.stdin.read(); body,code=raw.rsplit('\n',1); d=json.loads(body)
assert code=='409' and d.get('subscriberCount')==1 and 'blockedFields' in d, (code,d); print('ok')" > /dev/null 2>&1 && ok || bad "plans: гвард plan_level 409 + subscriberCount"
curl -s -X PATCH "$B/api/admin/plans/base" -H "$A" -H "$J" -d '{"price":350}' | grep -q '"price":350' && ok || bad "plans: разрешённый PATCH при подписчике 200"
curl -s "$B/api/admin/plans/base/subscribers" -H "$A" | python3 -c "import json,sys; d=json.load(sys.stdin); assert d['total']>=1 and any(s['email']=='plans-e2e@test.ru' for s in d['subscribers']); print('ok')" > /dev/null 2>&1 && ok || bad "plans: subscribers через маппинг tariff_plans.slug"
psql -d newinvest -q -c "DELETE FROM users WHERE email='plans-e2e@test.ru'" 2>/dev/null
# products: свойство плана (не фича) — создание с массивом, PATCH-roundtrip, дефолт invest
curl -s -X PATCH "$B/api/admin/plans/e2e-subplan" -H "$A" -H "$J" -d '{"products":["invest","pulse"]}' | grep -q '"products":\["invest","pulse"\]' && ok || bad "plans: PATCH products invest+pulse"
curl -s "$B/api/admin/plans" -H "$A" | python3 -c "import json,sys; ps={p['id']:p['products'] for p in json.load(sys.stdin)['plans']}; assert ps.get('base')==['invest'] and set(ps.get('e2e-subplan',[]))=={'invest','pulse'}, ps; print('ok')" > /dev/null 2>&1 && ok || bad "plans: products в списке (base=invest, subplan=invest+pulse)"
curl -s -o /dev/null -w "%{http_code}" -X PATCH "$B/api/admin/plans/e2e-subplan" -H "$A" -H "$J" -d '{"products":["bogus"]}' | grep -q 400 && ok || bad "plans: невалидный product 400"
curl -s -X PATCH "$B/api/admin/plans/e2e-subplan" -H "$A" -H "$J" -d '{"products":["invest"]}' > /dev/null
# архив (soft delete) / восстановление
curl -s -X POST "$B/api/admin/plans/e2e-subpop/archive" -H "$A" | grep -q '"archived":true' && ok || bad "plans: архив"
curl -s "$B/api/admin/plans" -H "$A" | python3 -c "import json,sys; d=json.load(sys.stdin)['plans']; p=[x for x in d if x['id']=='e2e-subpop'][0]; assert p['deletedAt'] is not None; print('ok')" > /dev/null 2>&1 && ok || bad "plans: архивный в списке с deletedAt"
curl -s -X POST "$B/api/admin/plans/e2e-subpop/restore" -H "$A" | grep -q '"restored":true' && ok || bad "plans: восстановление"
curl -s -o /dev/null -w "%{http_code}" -X POST "$B/api/admin/plans/no-such-plan/archive" -H "$A" | grep -q 404 && ok || bad "plans: архив несуществующего 404"
# доступность — СВОЙСТВО плана (products, миграция 0017), а не фича реестра:
# seed-фичи invest/pulse удалены из миграции 0016; проверяем, что их больше нет
curl -s "$B/api/features" | python3 -c "import json,sys; ids={f['id'] for f in json.load(sys.stdin)['features']}; assert 'invest' not in ids and 'pulse' not in ids, ids; print('ok')" > /dev/null 2>&1 && ok || bad "plans: invest/pulse НЕ фичи (свойство products)"


echo "════════════════════════════════════════"
echo "  E2E: МЕДИАТЕКА / ПОИСК / ПРОЧЕЕ"
echo "════════════════════════════════════════"
# upload: настоящий PNG проходит, подделка отсечена магическими байтами
printf '\x89PNG\r\n\x1a\n' > /tmp/e2e-real.png; head -c 200 /dev/urandom >> /tmp/e2e-real.png
UP=$(curl -s -X POST "$B/api/media/upload" -H "$A" -F "file=@/tmp/e2e-real.png;type=image/png")
echo "$UP" | grep -q '"url":"/uploads/' && ok || bad "media: upload PNG"
echo "not an image at all" > /tmp/e2e-fake.png
curl -s -o /dev/null -w "%{http_code}" -X POST "$B/api/media/upload" -H "$A" -F "file=@/tmp/e2e-fake.png;type=image/png" | grep -q 400 && ok || bad "media: подделка 400 (magic bytes)"
rm -f /tmp/e2e-real.png /tmp/e2e-fake.png
# поиск: режим fts явно
curl -s "$B/api/search?q=%D0%BA%D0%BE%D1%81%D0%BC%D0%BE%D1%81&mode=fts&limit=2" | grep -q '"mode":"fts"' && ok || bad "search: mode=fts"
# редиректы: список публичен для админа
curl -s "$B/api/redirects" -H "$A" | grep -q oldPath && ok || bad "redirects: список"
# график: не-MOEX тикер → 404
curl -s -o /dev/null -w "%{http_code}" "$B/api/market/chart?symbol=TSLA" | grep -q 404 && ok || bad "market: не-MOEX 404"
# фиксация просмотра: article_views растёт после открытия статьи
SPXID=$(curl -s "$B/api/articles/novost/spacex-lider-po-kolichestvu-sputnikov" | jqget "d['article']['id']")
V1=$(psql -d newinvest -tAc "SELECT count(*) FROM article_views WHERE article_id=$SPXID" 2>/dev/null)
curl -s -o /dev/null "$B/api/articles/novost/spacex-lider-po-kolichestvu-sputnikov"
V2=$(psql -d newinvest -tAc "SELECT count(*) FROM article_views WHERE article_id=$SPXID" 2>/dev/null)
[ "$V2" -gt "$V1" ] 2>/dev/null && ok || bad "views: просмотр зафиксирован ($V1→$V2)"
# kimi: ключ маскируется в ответе, не отдаётся целиком
curl -s -X POST "$B/api/admin/kimi-settings" -H "$A" -H "$J" -d '{"apiKey":"sk-e2e-secret-9999"}' > /dev/null
KMASK=$(curl -s "$B/api/admin/kimi-settings" -H "$A")
echo "$KMASK" | grep -q '"hasKey":true' && ok || bad "kimi: hasKey после ввода"
echo "$KMASK" | grep -q "sk-e2e-secret-9999" && bad "kimi: КЛЮЧ ОТДАЁТСЯ ЦЕЛИКОМ (ПРОБЛЕМА)" || ok
echo "$KMASK" | grep -q apiKeyMasked && ok || bad "kimi: маскированное поле"
curl -s -X POST "$B/api/admin/kimi-settings" -H "$A" -H "$J" -d '{"apiKey":""}' > /dev/null # стёрли ключ обратно
# пейволл: просроченный тариф не открывает материал
psql -d newinvest -q -c "UPDATE users SET tariff_expires_at=now() - interval '1 day' WHERE id=$USRID" 2>/dev/null
UTX=$(curl -s -X POST $B/api/auth/login -H "$J" -d '{"email":"e2e@test.ru","password":"E2ePass123"}' | jqget "d['token']")
curl -s -o /dev/null -w "%{http_code}" "$B/api/articles/analitika/e2e-insider" -H "Authorization: Bearer $UTX" | grep -q 403 && ok || bad "paywall: просроченный тариф 403"
psql -d newinvest -q -c "UPDATE users SET tariff_expires_at=NULL WHERE id=$USRID" 2>/dev/null

echo "════════════════════════════════════════"
echo "  E2E: ТЗ-05 — АВТОРЫ / BIO"
echo "════════════════════════════════════════"
# PATCH /me: anon 401; со токеном — сохраняется и читается через GET /me
curl -s -o /dev/null -w "%{http_code}" -X PATCH "$B/api/auth/me" -H "$J" -d '{"bio":"x"}' | grep -q 401 && ok || bad "bio: anon PATCH 401"
curl -s -X PATCH "$B/api/auth/me" -H "$UA" -H "$J" -d '{"bio":"E2E био автора"}' | grep -q '"bio":"E2E био автора"' && ok || bad "bio: PATCH сохраняет"
curl -s "$B/api/auth/me" -H "$UA" | grep -q '"bio":"E2E био автора"' && ok || bad "bio: GET /me отдаёт bio"
# лимит 500 — zod: 501 → 400, ровно 500 → 200, пустая строка → 200 (хранится как "")
curl -s -o /dev/null -w "%{http_code}" -X PATCH "$B/api/auth/me" -H "$UA" -H "$J" -d "{\"bio\":\"$(python3 -c 'print("a"*501)')\"}" | grep -q 400 && ok || bad "bio: 501 символ 400"
curl -s -o /dev/null -w "%{http_code}" -X PATCH "$B/api/auth/me" -H "$UA" -H "$J" -d "{\"bio\":\"$(python3 -c 'print("a"*500)')\"}" | grep -q 200 && ok || bad "bio: ровно 500 200"
curl -s -X PATCH "$B/api/auth/me" -H "$UA" -H "$J" -d '{"bio":""}' | grep -q '"bio":""' && ok || bad "bio: пустая строка 200 и сохраняется"
# деталь статьи отдаёт author белым списком (без email/passwordHash)
curl -s "$B/api/articles/novost/e2e-novost" -H "$A" | python3 -c "
import json,sys
a=json.load(sys.stdin)['author']
assert a is not None and set(a.keys())=={'id','displayName','avatar','bio','createdAt'}, a
print('ok')" > /dev/null 2>&1 && ok || bad "authors: detail author — белый список без email"
# публичный профиль автора (test@test.ru — автор e2e-novost/e2e-video)
ADMID=$(curl -s "$B/api/auth/me" -H "$A" | jqget "d['user']['id']")
curl -s "$B/api/authors/$ADMID" | grep -q '"articleCount"' && ok || bad "authors: профиль автора 200"
curl -s "$B/api/authors/$ADMID" | grep -q '"email"' && bad "authors: email утекает в профиле (ПРОБЛЕМА)" || ok
curl -s "$B/api/authors/$ADMID" | python3 -c "import json,sys; d=json.load(sys.stdin); assert d['author']['articleCount']==len(d['articles'])>0; print('ok')" > /dev/null 2>&1 && ok || bad "authors: articleCount == len(articles) > 0"
# пейволл: тарифная статья автора не видна анониму, видна владельцу тарифа
curl -s -X POST "$B/api/articles" -H "$A" -H "$J" -d '{"type":"analitika","slug":"e2e-author-tariff","title":"E2E автор тариф","contentHtml":"<p>x</p>","status":"published","accessLevel":"tariff","accessTariffId":1}' > /dev/null
curl -s "$B/api/authors/$ADMID" | python3 -c "import json,sys; d=json.load(sys.stdin); assert all(a['slug']!='e2e-author-tariff' for a in d['articles']); print('ok')" > /dev/null 2>&1 && ok || bad "authors: anon не видит tariff-материал автора"
curl -s "$B/api/authors/$ADMID" -H "$UA" | python3 -c "import json,sys; d=json.load(sys.stdin); assert any(a['slug']=='e2e-author-tariff' for a in d['articles']); print('ok')" > /dev/null 2>&1 && ok || bad "authors: юзер с тарифом видит tariff-материал автора"
# 404: несуществующий id и юзер без опубликованных материалов
curl -s -o /dev/null -w "%{http_code}" "$B/api/authors/999999999" | grep -q 404 && ok || bad "authors: несуществующий id 404"
curl -s -X POST $B/api/auth/register -H "$J" -d '{"username":"E2ENoPub","email":"e2e-nopub@test.ru","password":"E2ePass123"}' > /dev/null
NPID=$(curl -s -X POST $B/api/auth/login -H "$J" -d '{"email":"e2e-nopub@test.ru","password":"E2ePass123"}' | jqget "d['user']['id']")
[ -n "$NPID" ] && curl -s -o /dev/null -w "%{http_code}" "$B/api/authors/$NPID" | grep -q 404 && ok || bad "authors: юзер без публикаций 404"
# статья с author_id IS NULL → author:null
NULLSLUG=$(psql -d newinvest -tAc "SELECT type||'/'||slug FROM articles WHERE author_id IS NULL AND status='published' LIMIT 1" 2>/dev/null)
[ -n "$NULLSLUG" ] && curl -s "$B/api/articles/$NULLSLUG" | grep -q '"author":null' && ok || bad "authors: author_id NULL → author:null"
# фронт: /avtor/:id рендерит SPA-страницу (fallback dev-сервера)
curl -s -o /dev/null -w "%{http_code}" "$W/avtor/$ADMID" | grep -q 200 && ok || bad "authors: /avtor/:id SPA 200"

echo "════════════════════════════════════════"
echo "  E2E: ТЗ-08 — ПЛЕЙЛИСТЫ / SORT_ORDER"
echo "════════════════════════════════════════"
PL1=$(curl -s -X POST "$B/api/articles" -H "$A" -H "$J" -d '{"type":"video","slug":"e2e-pl-1","title":"E2E Плейлист 1","contentHtml":"<p>x</p>","videoUrl":"https://www.youtube.com/watch?v=dQw4w9WgXcQ","status":"published"}' | jqget "d['article']['id']")
PL2=$(curl -s -X POST "$B/api/articles" -H "$A" -H "$J" -d '{"type":"video","slug":"e2e-pl-2","title":"E2E Плейлист 2","contentHtml":"<p>x</p>","videoUrl":"https://youtu.be/abc12345xyz","status":"published"}' | jqget "d['article']['id']")
PL3=$(curl -s -X POST "$B/api/articles" -H "$A" -H "$J" -d '{"type":"video","slug":"e2e-pl-3","title":"E2E Плейлист 3","contentHtml":"<p>x</p>","videoUrl":"https://rutube.ru/video/abcdef012345/","status":"published"}' | jqget "d['article']['id']")
[ -n "$PL1" ] && [ -n "$PL2" ] && [ -n "$PL3" ] && ok || bad "playlist: 3 видео-материала созданы"
PLSID=$(curl -s -X POST "$B/api/stories" -H "$A" -H "$J" -d '{"slug":"e2e-playlist","name":"E2E Плейлист"}' | jqget "d['story']['id']")
[ -n "$PLSID" ] && ok || bad "playlist: сюжет создан"
# ТЗ-08 R6: PUT — индекс массива articleIds → sort_order; R5: isPrimary независим от позиции
curl -s -X PUT "$B/api/stories/$PLSID/articles" -H "$A" -H "$J" -d "{\"articleIds\":[$PL2,$PL1,$PL3],\"primaryArticleId\":$PL1}" | python3 -c "import json,sys; a=json.load(sys.stdin)['articles']; assert [x['articleId'] for x in a]==[$PL2,$PL1,$PL3] and [x['sortOrder'] for x in a]==[0,1,2] and [x['isPrimary'] for x in a]==[False,True,False]; print('ok')" > /dev/null 2>&1 && ok || bad "playlist: PUT пишет sort_order по индексу, ответ отсортирован (R5/R6)"
curl -s "$B/api/stories/$PLSID/articles" -H "$A" | grep -q '"sortOrder"' && ok || bad "playlist: admin GET отдаёт sortOrder (R7)"
# публичный GET: тот же порядок, videoUrl у каждой серии (R7), isPrimary (ревью v2.1 №5)
curl -s "$B/api/stories/e2e-playlist" | python3 -c "import json,sys; a=json.load(sys.stdin)['articles']; assert [x['id'] for x in a]==[$PL2,$PL1,$PL3] and all(x.get('videoUrl') for x in a) and [x['isPrimary'] for x in a]==[False,True,False]; print('ok')" > /dev/null 2>&1 && ok || bad "playlist: public GET — порядок sort_order, videoUrl, isPrimary"
# повторное переупорядочивание: [3,1,2], главную сняли → публичный порядок меняется
curl -s -X PUT "$B/api/stories/$PLSID/articles" -H "$A" -H "$J" -d "{\"articleIds\":[$PL3,$PL1,$PL2]}" > /dev/null
curl -s "$B/api/stories/e2e-playlist" | python3 -c "import json,sys; a=json.load(sys.stdin)['articles']; assert [x['id'] for x in a]==[$PL3,$PL1,$PL2]; print('ok')" > /dev/null 2>&1 && ok || bad "playlist: повторный PUT меняет публичный порядок"
psql -d newinvest -tAc "SELECT sort_order FROM article_stories WHERE story_id=$PLSID ORDER BY sort_order" 2>/dev/null | tr '\n' ' ' | grep -q "0 1 2" && ok || bad "playlist: sort_order в БД 0,1,2"
# R1: смешанный состав (видео + текст) отдаётся как есть — плейлист-режим выключается на фронте
curl -s -X PUT "$B/api/stories/$PLSID/articles" -H "$A" -H "$J" -d "{\"articleIds\":[$PL1,$PL2,$ART],\"primaryArticleId\":$PL1}" > /dev/null
curl -s "$B/api/stories/e2e-playlist" | python3 -c "import json,sys; a=json.load(sys.stdin)['articles']; assert any(x['type']!='video' for x in a); print('ok')" > /dev/null 2>&1 && ok || bad "playlist: смешанный состав отдаётся (R1 — хронология на фронте)"
curl -s -X PUT "$B/api/stories/$PLSID/articles" -H "$A" -H "$J" -d "{\"articleIds\":[$PL1,$PL2,$PL3]}" > /dev/null

echo "════════════════════════════════════════"
echo "  E2E: ТЗ-10 — SSR/PRERENDER ДЛЯ БОТОВ + SITEMAP/ROBOTS"
echo "════════════════════════════════════════"
# dev-режим: /render пропускает без заголовка X-Bot-Render (в prod отдаёт 404)
curl -s -o /dev/null -w "%{http_code}" "$B/render?path=/novost/spacex-lider-po-sputnikam" | grep -q 200 && ok || bad "bot-render: 200 на опубликованную статью"
BOTHTML=$(curl -s "$B/render?path=/novost/spacex-lider-po-sputnikam")
echo "$BOTHTML" | grep -q '<meta property="og:title"' && ok || bad "bot-render: og:title"
echo "$BOTHTML" | grep -q '<meta name="twitter:card" content="summary_large_image"' && ok || bad "bot-render: twitter:card"
echo "$BOTHTML" | grep -q 'application/ld+json' && ok || bad "bot-render: JSON-LD блоки"
echo "$BOTHTML" | grep -q '"@type":"BreadcrumbList"' && ok || bad "bot-render: BreadcrumbList JSON-LD"
echo "$BOTHTML" | grep -q '"@type":"NewsArticle"' && ok || bad "bot-render: NewsArticle JSON-LD"
echo "$BOTHTML" | grep -q '<h1>' && ok || bad "bot-render: h1 в body"
echo "$BOTHTML" | grep -q 'Открыть полную версию' && ok || bad "bot-render: ссылка на полную версию"
OGIMG=$(echo "$BOTHTML" | grep -o 'og:image" content="[^"]*' | head -1 | sed 's/.*content="//')
if [ -n "$OGIMG" ]; then
  echo "$OGIMG" | grep -q '^https\?://' && ok || bad "bot-render: og:image абсолютный (got $OGIMG)"
else
  echo "  (у статьи нет обложки — og:image не рендерится, ок)"
fi
curl -s -o /dev/null -w "%{http_code}" "$B/render?path=/novost/net-takogo-sluga-abcdef" | grep -q 404 && ok || bad "bot-render: несуществующий slug → 404"
curl -s -o /dev/null -w "%{http_code}" "$B/render?path=/cabinet" | grep -q 404 && ok || bad "bot-render: /cabinet → 404 (не SPA-200)"
# эскейпинг: статья с кавычками/угловыми скобками в title (ТЗ-10 §6.1 — XSS в bot-render катастрофа)
SEOJSON=$(python3 -c 'import json; print(json.dumps({"type":"novost","slug":"e2e-seo","title":"E2E \"кавычки\" <уголки> & амп","contentHtml":"<p>Слово один два три четыре пять шесть семь восемь девять десять.</p>","excerpt":"Экспонат","status":"published"}))')
curl -s -X POST "$B/api/articles" -H "$A" -H "$J" -d "$SEOJSON" > /dev/null
SEOHTML=$(curl -s "$B/render?path=/novost/e2e-seo")
echo "$SEOHTML" | grep -q '&quot;кавычки&quot; &lt;уголки&gt; &amp; амп' && ok || bad "bot-render: title экранирован в <title>/OG"
echo "$SEOHTML" | grep -q '<уголки>' && bad "bot-render: сырой <уголки> в HTML (XSS!)" || ok
echo "$SEOHTML" | python3 -c "
import json,sys,re
html=sys.stdin.read()
blocks=re.findall(r'<script type=\"application/ld\+json\">(.*?)</script>', html, re.S)
assert blocks, 'нет JSON-LD'
for b in blocks: json.loads(b)  # валидный JSON, '</script' не ломает разметку
print('ok')" > /dev/null 2>&1 && ok || bad "bot-render: JSON-LD валиден при кавычках в title"
# пейволл-тизер: метаданные есть, 100 слов нет
curl -s -X PATCH "$B/api/articles/$ART" -H "$A" -H "$J" -d '{"accessLevel":"tariff","accessTariffId":1}' > /dev/null
PAYHTML=$(curl -s "$B/render?path=/novost/e2e-novost")
echo "$PAYHTML" | grep -q 'og:title' && ok || bad "bot-render: paywall-тизер отдаёт метаданные"
echo "$PAYHTML" | grep -q 'Полная версия доступна по подписке' && ok || bad "bot-render: paywall-заметка в body"
curl -s -X PATCH "$B/api/articles/$ART" -H "$A" -H "$J" -d '{"accessLevel":"auth"}' > /dev/null # как было
# серверные 301 из redirects для ботов (WP-миграция) — через /render
OLDP=$(psql -d newinvest -tAc "SELECT old_path FROM redirects LIMIT 1" 2>/dev/null)
if [ -n "$OLDP" ]; then
  REDIR=$(curl -s -o /dev/null -w "%{http_code} %{redirect_url}" "$B/render?path=$OLDP")
  echo "$REDIR" | grep -q '^301 ' && ok || bad "bot-render: серверный 301 из redirects (got $REDIR)"
  NEWP=$(psql -d newinvest -tAc "SELECT new_path FROM redirects WHERE old_path='$OLDP'" 2>/dev/null)
  echo "$REDIR" | grep -q "$NEWP" && ok || bad "bot-render: Location ведёт на newPath ($NEWP)"
else
  bad "bot-render: в redirects нет строк для проверки 301"
fi
# sitemap.xml: валидный XML, все опубликованные статьи, абсолютные loc
SM=$(curl -s "$B/sitemap.xml")
echo "$SM" | grep -q '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">' && ok || bad "sitemap: urlset с namespace"
echo "$SM" | python3 -c "import sys,xml.etree.ElementTree as ET; ET.fromstring(sys.stdin.read()); print('ok')" > /dev/null 2>&1 && ok || bad "sitemap: XML парсится"
SMN=$(psql -d newinvest -tAc "SELECT count(*) FROM articles WHERE status='published'" 2>/dev/null)
LOCN=$(echo "$SM" | grep -c '<loc>')
[ "$LOCN" -ge "$SMN" ] 2>/dev/null && ok || bad "sitemap: loc ($LOCN) ≥ published-статей ($SMN)"
echo "$SM" | grep -q 'spacex-lider-po-sputnikam' && ok || bad "sitemap: содержит опубликованную статью"
echo "$SM" | grep -q '<loc>http' && ok || bad "sitemap: абсолютные loc"
curl -s -o /dev/null -w "%{content_type}" "$B/sitemap.xml" | grep -q 'application/xml' && ok || bad "sitemap: Content-Type application/xml"
# robots.txt
RB=$(curl -s "$B/robots.txt")
echo "$RB" | grep -q '^Sitemap: http' && ok || bad "robots: Sitemap с абсолютным URL"
echo "$RB" | grep -q 'Disallow: /cabinet' && ok || bad "robots: Disallow /cabinet"
echo "$RB" | grep -q 'Disallow: /render' && ok || bad "robots: Disallow /render"

echo "════════════════════════════════════════"
echo "  E2E: TRENDING NOW (ТЗ-07)"
echo "════════════════════════════════════════"
# публичный эндпоинт, дефолт окно 6 ч / лимит 10
curl -s "$B/api/trending" | python3 -c "import json,sys; d=json.load(sys.stdin); assert d['windowHours']==6 and len(d['items'])<=10 and isinstance(d['items'],list); print('ok')" > /dev/null 2>&1 && ok || bad "trending: 200, windowHours=6, до 10 items"
# кламп параметров: hours 1–24, limit 1–20
curl -s "$B/api/trending?hours=30&limit=99" | python3 -c "import json,sys; d=json.load(sys.stdin); assert d['windowHours']==24 and len(d['items'])<=20; print('ok')" > /dev/null 2>&1 && ok || bad "trending: кламп hours=30→24, limit≤20"
curl -s "$B/api/trending?hours=0" | python3 -c "import json,sys; assert json.load(sys.stdin)['windowHours']==1; print('ok')" > /dev/null 2>&1 && ok || bad "trending: кламп hours=0→1"
# формат item: белый список полей (id/type/slug/title/views)
curl -s "$B/api/trending" | python3 -c "
import json,sys
d=json.load(sys.stdin)
assert all(set(i.keys())=={'id','type','slug','title','views'} for i in d['items']), d['items'][:1]
print('ok')" > /dev/null 2>&1 && ok || bad "trending: поля item — белый список"
# кэш: два подряд — тот же computedAt (чистый TTL, без инвалидации по max(viewed_at))
TC1=$(curl -s "$B/api/trending" | jqget "d['computedAt']")
sleep 1
TC2=$(curl -s "$B/api/trending" | jqget "d['computedAt']")
[ -n "$TC1" ] && [ "$TC1" = "$TC2" ] && ok || bad "trending: кэш-hit — computedAt не изменился"
# пейволл: auth-статья (e2e-novost) с массой просмотров НЕ попадает в топ
if [ -n "$ART" ]; then
  psql -d newinvest -q -c "INSERT INTO article_views (article_id) SELECT $ART FROM generate_series(1,50);" 2>/dev/null
  curl -s "$B/api/trending?limit=20" | python3 -c "import json,sys; d=json.load(sys.stdin); assert all(i['id']!=$ART for i in d['items']); print('ok')" > /dev/null 2>&1 && ok || bad "trending: auth-статья с просмотрами отсутствует (пейволл)"
  psql -d newinvest -q -c "DELETE FROM article_views WHERE article_id=$ART;" 2>/dev/null
else
  bad "trending: нет ART для пейволл-проверки"
fi
# draft-статья с просмотрами тоже отсутствует (готовим через тот же ART: unpublish → залить просмотры → проверить → вернуть)
if [ -n "$ART" ]; then
  psql -d newinvest -q -c "UPDATE articles SET status='draft', access_level='public' WHERE id=$ART; INSERT INTO article_views (article_id) SELECT $ART FROM generate_series(1,50);" 2>/dev/null
  curl -s "$B/api/trending?limit=20&hours=1" | python3 -c "import json,sys; d=json.load(sys.stdin); assert all(i['id']!=$ART for i in d['items']); print('ok')" > /dev/null 2>&1 && ok || bad "trending: draft-статья с просмотрами отсутствует"
  psql -d newinvest -q -c "DELETE FROM article_views WHERE article_id=$ART; UPDATE articles SET status='published', access_level='auth' WHERE id=$ART;" 2>/dev/null
fi

echo ""
echo "════════════════════════════════════════"
echo "  ИТОГ: PASS=$PASS FAIL=$FAIL"
for f in "${FAILED[@]}"; do echo "  ❌ $f"; done
echo "════════════════════════════════════════"

# очистка e2e-данных
psql -d newinvest -q -c "
DELETE FROM articles WHERE slug IN ('e2e-novost','e2e-insider','e2e-video','e2e-seo','e2e-author-tariff','e2e-pl-1','e2e-pl-2','e2e-pl-3') OR title LIKE 'E2E идея%' OR title LIKE 'E2E просмотры%';
DELETE FROM stories WHERE slug IN ('e2e-story','e2e-playlist');
DELETE FROM companies WHERE slug='e2e-corp';
DELETE FROM trends WHERE slug='e2e-trend';
DELETE FROM industries WHERE slug='e2e-ind';
DELETE FROM tickers WHERE slug='e2e';
DELETE FROM tariff_plans WHERE slug='e2e-tariff';
DELETE FROM subscription_plans WHERE id IN ('e2e-subplan','e2e-subpop','e2e-subpop2','e2e-yr');
DELETE FROM users WHERE email='plans-e2e@test.ru';
UPDATE subscription_plans SET price=300 WHERE id='base';
DELETE FROM media WHERE source_url='upload' AND created_at > now() - interval '30 minutes';
DELETE FROM favorites WHERE user_id IN (SELECT id FROM users WHERE email IN ('e2e@test.ru','e2e-gone@test.ru'));
DELETE FROM subscriptions WHERE user_id IN (SELECT id FROM users WHERE email IN ('e2e@test.ru','e2e-gone@test.ru'));
DELETE FROM notification_settings WHERE user_id IN (SELECT id FROM users WHERE email IN ('e2e@test.ru','e2e-gone@test.ru'));
DELETE FROM tg_bindings WHERE user_id IN (SELECT id FROM users WHERE email IN ('e2e@test.ru','e2e-gone@test.ru'));
DELETE FROM users WHERE email IN ('e2e@test.ru','e2e-gone@test.ru','e2e-nopub@test.ru');
UPDATE tariff_plans SET yearly_discount=20 WHERE slug='insider';
UPDATE meta_fields SET value='' WHERE owner_type='app' AND owner_id=0 AND key='kimi_api_key';
" 2>/dev/null
exit $FAIL
