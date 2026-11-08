/**
 * BreadcrumbList JSON-LD (ТЗ-01, правки ревью v2.1).
 * Чистые функции без DOM/window — origin передаётся параметром (тестируемо в node,
 * переиспользуется серверным botRender ТЗ-10 по контракту ./breadcrumbs.contract.ts).
 *
 * Правила (согласованы с ТЗ-10):
 * - position — с 1;
 * - item (абсолютный URL = origin + to) — только у непоследних элементов с to;
 * - последний элемент (текущая страница) — БЕЗ item (только position + name),
 *   как у донора (правка ревью v2.1 №4, отменяет must-2 v2 про item у последнего);
 * - непоследний элемент без to (напр. «Тренды» — индексной страницы нет) — тоже
 *   без item: по спецификации schema.org непоследнему name-only допустим.
 */

/** Элемент цепочки: тот же контракт, что Crumb в apps/web/src/components/Breadcrumbs.tsx. */
export interface BreadcrumbCrumb {
  label: string;
  to?: string;
}

export interface BreadcrumbListItem {
  '@type': 'ListItem';
  position: number;
  name: string;
  item?: string;
}

export interface BreadcrumbList {
  '@context': 'https://schema.org';
  '@type': 'BreadcrumbList';
  itemListElement: BreadcrumbListItem[];
}

/**
 * Собирает объект BreadcrumbList из цепочки крошек.
 * origin — scheme + host (на клиенте window.location.origin), без trailing slash;
 * to — путь от корня ('/novost'); абсолютный URL = origin + to.
 */
export function buildBreadcrumbList(items: BreadcrumbCrumb[], origin: string): BreadcrumbList {
  const base = origin.replace(/\/$/, '');
  const lastIndex = items.length - 1;
  return {
    '@context': 'https://schema.org',
    '@type': 'BreadcrumbList',
    itemListElement: items.map((crumb, i) => {
      const el: BreadcrumbListItem = {
        '@type': 'ListItem',
        position: i + 1,
        name: crumb.label,
      };
      if (i !== lastIndex && crumb.to) el.item = base + crumb.to;
      return el;
    }),
  };
}

/**
 * Сериализация JSON-LD с экранированием (must-6 ТЗ-01, правка ревью v2.1 №5):
 * глобальная замена '<' → '\u003c' (защита от '</script>'-инъекции через label)
 * + экранирование U+2028/U+2029 (разрывают inline-скрипт в старых браузерах).
 * Результат остаётся валидным JSON: '\u003c'/'\u2028' — легальные JSON-эскейпы,
 * JSON.parse восстанавливает исходные символы.
 */
export function serializeJsonLd(obj: unknown): string {
  return JSON.stringify(obj)
    .replace(/</g, '\\u003c')
    .replace(/\u2028/g, '\\u2028')
    .replace(/\u2029/g, '\\u2029');
}
