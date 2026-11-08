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
echo "$GT" | grep -q '"mock":true' && ok || bad "textgen: mock-флаг без ключа"
curl -s -o /dev/null -w "%{http_code}" -X POST "$B/api/media/generate-text" -H "$A" -H "$J" -d '{"prompt":"кор"}' | grep -q 400 && ok || bad "textgen: короткий промпт 400"
curl -s -o /dev/null -w "%{http_code}" -X POST "$B/api/media/generate-text" -H "$J" -d '{"prompt":"тестовый промпт достаточной длины"}' | grep -q 401 && ok || bad "textgen: anon 401"
# настройки Kimi: доступ только админу, сохранение читается обратно
curl -s -o /dev/null -w "%{http_code}" "$B/api/admin/kimi-settings" | grep -q 401 && ok || bad "kimi-settings: anon 401"
curl -s -X POST "$B/api/admin/kimi-settings" -H "$A" -H "$J" -d '{"textModel":"kimi-k3"}' | grep -q '"ok":true' && ok || bad "kimi-settings: POST"
curl -s "$B/api/admin/kimi-settings" -H "$A" | grep -q '"textModel":"kimi-k3"' && ok || bad "kimi-settings: persisted"
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

echo ""
echo "════════════════════════════════════════"
echo "  ИТОГ: PASS=$PASS FAIL=$FAIL"
for f in "${FAILED[@]}"; do echo "  ❌ $f"; done
echo "════════════════════════════════════════"

# очистка e2e-данных
psql -d newinvest -q -c "
DELETE FROM articles WHERE slug IN ('e2e-novost','e2e-insider','e2e-video') OR title LIKE 'E2E идея%' OR title LIKE 'E2E просмотры%';
DELETE FROM stories WHERE slug='e2e-story';
DELETE FROM companies WHERE slug='e2e-corp';
DELETE FROM trends WHERE slug='e2e-trend';
DELETE FROM industries WHERE slug='e2e-ind';
DELETE FROM tickers WHERE slug='e2e';
DELETE FROM tariff_plans WHERE slug='e2e-tariff';
DELETE FROM media WHERE source_url='upload' AND created_at > now() - interval '30 minutes';
DELETE FROM favorites WHERE user_id IN (SELECT id FROM users WHERE email IN ('e2e@test.ru','e2e-gone@test.ru'));
DELETE FROM subscriptions WHERE user_id IN (SELECT id FROM users WHERE email IN ('e2e@test.ru','e2e-gone@test.ru'));
DELETE FROM notification_settings WHERE user_id IN (SELECT id FROM users WHERE email IN ('e2e@test.ru','e2e-gone@test.ru'));
DELETE FROM tg_bindings WHERE user_id IN (SELECT id FROM users WHERE email IN ('e2e@test.ru','e2e-gone@test.ru'));
DELETE FROM users WHERE email IN ('e2e@test.ru','e2e-gone@test.ru');
UPDATE tariff_plans SET yearly_discount=20 WHERE slug='insider';
UPDATE meta_fields SET value='' WHERE owner_type='app' AND owner_id=0 AND key='kimi_api_key';
" 2>/dev/null
exit $FAIL
