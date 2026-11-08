/**
 * КОНТРАКТ ДЛЯ ТЗ-10: botRender должен генерировать идентичный JSON-LD.
 *
 * Копия публичного контракта чистых функций ТЗ-01 (реализация — ./breadcrumbs.ts,
 * сабпас-экспорт '@newinvest/db/breadcrumbs'). Правки ревью v2.1 №9: ТЗ-10
 * дополняется BreadcrumbList в bot-шаблоне для ВСЕХ типов страниц; серверная
 * копия этих функций живёт в apps/api/src/services/botRender.ts.
 * При изменении сигнатур или правил — править ОБА файла синхронно,
 * расхождение ловится снапшот-тестом шаблона в ТЗ-10 (§9).
 *
 * Контракт (фиксирован, не нарушать):
 *
 *   buildBreadcrumbList(items: BreadcrumbCrumb[], origin: string): BreadcrumbList
 *     items — цепочка крошек, ВКЛЮЧАЯ первый элемент «Главная» ({ label: 'Главная', to: '/' });
 *     origin — scheme + host без trailing slash (на клиенте window.location.origin,
 *     на сервере PUBLIC_SITE_URL; значения задаются одним и тем же на деплое, R6 ТЗ-01).
 *     Правила:
 *       1. position — с 1;
 *       2. item (абсолютный URL = origin + to) — только у НЕпоследних элементов с to;
 *       3. последний элемент (текущая страница) — БЕЗ item (только position + name)
 *          — согласовано с ТЗ-10 (правка ревью v2.1 №4, как у донора);
 *       4. непоследний без to (напр. «Тренды»/«Сюжеты» — индексных страниц нет)
 *          — тоже без item (name-only допустим по schema.org).
 *
 *   serializeJsonLd(obj: unknown): string
 *     JSON.stringify + глобальная замена '<' → '\u003c' + экранирование
 *     U+2028/U+2029 (правка ревью v2.1 №5; защита '</script>'-инъекции через label).
 *     Вывод остаётся валидным JSON (эскейпы '\u003c'/'\u2028' легальны, JSON.parse
 *     восстанавливает исходные символы).
 */

export { buildBreadcrumbList, serializeJsonLd } from './breadcrumbs.js';
export type { BreadcrumbCrumb, BreadcrumbListItem, BreadcrumbList } from './breadcrumbs.js';
