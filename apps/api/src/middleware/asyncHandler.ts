/**
 * Глобальная страховка от «вечных зависаний» async-роутов (аудит 2026-11-26).
 *
 * Express 4 НЕ передаёт ошибки асинхронных хендлеров в error-middleware:
 * rejected promise в роуте = ответ не уходит = клиент крутит спинер вечно
 * (прод-баг: коллизия unique-slug при создании компании → зависание «создаём…»).
 *
 * Модуль оборачивает ВСЕ хендлеры всех роутеров: rejected promise → next(err)
 * → единый error-middleware в index.ts → 500 за миллисекунды. Важны обе точки:
 * - Route.prototype.* — собственно хендлеры (router.get(path, fn) отдаёт fn
 *   в route, оборачивать Router.prototype недостаточно — хендлер проходит мимо);
 * - Router.prototype.use — цепочки middleware (router.use(authRequired, …)).
 * app.get/app.use делегируют в роутер, поэтому покрываются автоматически.
 *
 * ВАЖНО: импортировать ПЕРВЫМ в index.ts (до импорта route-файлов) — обёртка
 * применяется в момент регистрации хендлера, а route-файлы регистрируют
 * хендлеры при своём импорте. Модуль самовыполняющийся (patchRouterAsync()
 * вызывается при импорте).
 */
import { Router } from 'express';
import express from 'express';
import type { NextFunction, Request, RequestHandler, Response } from 'express';

// Route в @types/express не экспортируется напрямую — берём прототип через рантайм-объект
const RoutePrototype = (express as unknown as { Route: { prototype: Record<string, unknown> } }).Route.prototype;

/** error-middleware (fn.length === 4) не трогаем. */
function wrap(fn: RequestHandler): RequestHandler {
  return (req: Request, res: Response, next: NextFunction) =>
    Promise.resolve(fn(req, res, next)).catch(next);
}

export function patchRouterAsync(): void {
  // хендлеры маршрутов: Route.prototype.get/post/put/patch/delete/all
  for (const method of ['get', 'post', 'put', 'patch', 'delete', 'all'] as const) {
    const original = RoutePrototype[method] as (...args: unknown[]) => unknown;
    RoutePrototype[method] = function (this: unknown, ...args: unknown[]) {
      const wrapped = args.map((a) => (typeof a === 'function' && (a as RequestHandler).length !== 4 ? wrap(a as RequestHandler) : a));
      return original.apply(this, wrapped);
    };
  }
  // цепочки middleware: Router.prototype.use (app.use делегирует сюда)
  const origUse = (Router.prototype as unknown as Record<string, (...args: unknown[]) => unknown>).use;
  (Router.prototype as unknown as Record<string, unknown>).use = function (this: unknown, ...args: unknown[]) {
    const wrapped = args.map((a) => (typeof a === 'function' && (a as RequestHandler).length !== 4 ? wrap(a as RequestHandler) : a));
    return origUse.apply(this, wrapped);
  };
}

patchRouterAsync();
