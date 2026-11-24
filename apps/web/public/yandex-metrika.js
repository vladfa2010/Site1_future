/* Яндекс.Метрика, счётчик 104473798 (Инвестиционно.рф).
 *
 * Вынесено из инлайна index.html намеренно: CSP сайта (аудит 2026-11-14)
 * запрещает инлайн-скрипты (script-src 'self'), а внешний файл того же origin
 * разрешён без хэшей. Домен mc.yandex.ru добавлен в CSP только для основного
 * сайта (infra/Caddyfile*, переопределение после `import security`).
 *
 * SPA-переходы дотрекиваются в src/components/YandexMetrika.tsx (ym('hit')).
 * Бот-шаблон (ТЗ-10, apps/api/src/services/botRender.ts) счётчик не получает —
 * там по ТЗ запрещён любой JS.
 */
(function (m, e, t, r, i, k, a) {
  m[i] = m[i] || function () { (m[i].a = m[i].a || []).push(arguments) };
  m[i].l = 1 * new Date();
  for (var j = 0; j < document.scripts.length; j++) { if (document.scripts[j].src === r) { return; } }
  k = e.createElement(t), a = e.getElementsByTagName(t)[0], k.async = 1, k.src = r, a.parentNode.insertBefore(k, a)
})(window, document, 'script', 'https://mc.yandex.ru/metrika/tag.js?id=104473798', 'ym');

// ssr НЕ включать: с ssr:true счётчик НЕ шлёт начальный хит просмотра
// (это флаг для серверного рендеринга, где первый хит отправляет сервер).
// В связке с YandexMetrika.tsx (пропуск первого рендера) это давало
// полную тишину статистики — инцидент 2026-11-24 «визиты не регистрируются».
ym(104473798, 'init', { webvisor: true, clickmap: true, referrer: document.referrer, url: location.href, accurateTrackBounce: true, trackLinks: true });
