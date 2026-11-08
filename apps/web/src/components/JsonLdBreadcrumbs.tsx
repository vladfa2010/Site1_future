import { useEffect, useMemo } from 'react';
import { buildBreadcrumbList, serializeJsonLd } from '@newinvest/db/breadcrumbs';
import type { Crumb } from './Breadcrumbs';

/**
 * JSON-LD BreadcrumbList (ТЗ-01, правки ревью v2.1 №2/№3/№6).
 * react-helmet-async НЕ используем (peer-конфликт с React 19) — fallback R4
 * из ТЗ теперь основной способ: useEffect-инжект <script> в document.head.
 *
 * - data-attr-маркер data-breadcrumb-ld для поиска своего скрипта;
 * - перед вставкой удаляются все предыдущие свои скрипты (клиентский переход
 *   A→B: скрипт заменяется, не дублируется — критерий приёмки 2);
 * - cleanup удаляет свой скрипт при размонтировании;
 * - StrictMode-safe: двойной вызов effect → cleanup первого вызова удаляет
 *   скрипт до вставки второго → в DOM остаётся ровно один скрипт.
 *
 * Единый источник крошек (правка ревью v2.1 №3): принимает тот же Crumb[],
 * что визуальные <Breadcrumbs>, и маппит внутри (name=label, item=origin+to).
 * Первый элемент «Главная» ({ label: 'Главная', to: '/' }) дописывается здесь:
 * визуальный <Breadcrumbs> рендерит её сам, а цепочки §4 ТЗ-01 начинаются
 * с Главной — на странице один массив, без дублирования.
 * Хост — window.location.origin (punycode-консистентен с адресной строкой, R6).
 * Последний элемент без item, escaping '<'/U+2028/U+2029 — в @newinvest/db/breadcrumbs
 * (контракт для ТЗ-10: packages/db/src/breadcrumbs.contract.ts).
 */
export function JsonLdBreadcrumbs({ items }: { items: Crumb[] }) {
  const json = useMemo(
    () =>
      items.length > 0
        ? serializeJsonLd(
            buildBreadcrumbList([{ label: 'Главная', to: '/' }, ...items], window.location.origin),
          )
        : null,
    [items],
  );

  useEffect(() => {
    if (!json) return;
    document
      .querySelectorAll('script[type="application/ld+json"][data-breadcrumb-ld]')
      .forEach((el) => el.remove());
    const script = document.createElement('script');
    script.type = 'application/ld+json';
    script.dataset.breadcrumbLd = '';
    script.textContent = json;
    document.head.appendChild(script);
    return () => script.remove();
  }, [json]);

  return null;
}
