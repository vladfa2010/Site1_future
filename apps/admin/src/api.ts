/** Аутентифицированный клиент API админки (JWT из localStorage). */
export class ApiError extends Error {
  constructor(public status: number, body: unknown) {
    super(`API ${status}: ${JSON.stringify(body)}`);
  }
}

/** 401 в самый неподходящий момент (инцидент 2026-11-27): вкладка админки
 *  открыта давно, браузер фоновым вкладкам тушит таймеры → почасовой
 *  sliding-refresh не отрабатывает → токен тихо умирает. Раньше api() на 401
 *  делал window.location.href = '/login' — полная перезагрузка сжигала весь
 *  заполненный редактор. Лучшая практика: 401 обрабатывается централизованно
 *  и НЕ теряет состояние — показываем модалку повторного входа, а после неё
 *  молча повторяем провалившийся запрос уже с новым токеном. Обработчик
 *  реализует auth.tsx (AuthProvider); регистрация через сеттер — чтобы избежать
 *  циклического импорта api ↔ auth. */
type ReviveHandler = () => Promise<string | null>;
let reviveHandler: ReviveHandler | null = null;
export function setSessionReviveHandler(h: ReviveHandler | null) {
  reviveHandler = h;
}

/** Дёргает модалку повторного входа; вернёт свежий токен или null при отказе. */
async function reviveSession(): Promise<string | null> {
  try {
    return reviveHandler ? await reviveHandler() : null;
  } catch {
    return null;
  }
}

/** Крайний случай: юзер отказался перелогиниваться — чистим сессию и уводим на логин. */
function forceRelogin() {
  localStorage.removeItem('token');
  if (!window.location.pathname.startsWith('/login')) {
    window.location.href = '/login';
  }
}

export async function api<T>(path: string, options: RequestInit = {}): Promise<T> {
  const doFetch = (token: string | null) =>
    fetch(`/api${path}`, {
      ...options,
      headers: {
        'Content-Type': 'application/json',
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
        ...(options.headers ?? {}),
      },
    });
  let res = await doFetch(localStorage.getItem('token'));
  if (res.status === 401) {
    // 401 доходит сюда БЕЗ выполнения обработчика роута — повторять запрос
    // с новым токеном безопасно, даже если это POST/PATCH
    const revived = await reviveSession();
    if (revived) {
      res = await doFetch(revived);
    } else {
      forceRelogin();
    }
  }
  const body = await res.json().catch(() => ({}));
  if (!res.ok) throw new ApiError(res.status, body);
  return body as T;
}

/** Тот же api(), но для не-JSON тел (multipart-загрузки, стримы): Content-Type
 *  не ставит, возвращает сырой Response, чтобы вызывающий сам читал тело.
 *  401 — та же семантика: модалка + повтор с новым токеном вместо редиректа
 *  с потерей состояния. Повтор безопасен: тело FormData fetch не расходует. */
export async function apiFetch(path: string, options: RequestInit = {}): Promise<Response> {
  const doFetch = (token: string | null) =>
    fetch(`/api${path}`, {
      ...options,
      headers: {
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
        ...(options.headers ?? {}),
      },
    });
  let res = await doFetch(localStorage.getItem('token'));
  if (res.status === 401) {
    const revived = await reviveSession();
    if (revived) {
      res = await doFetch(revived);
    } else {
      forceRelogin();
    }
  }
  return res;
}

export interface AdminUser {
  id: number;
  email: string;
  role: string;
  displayName: string | null;
}

export const isAdminRole = (role?: string) => role === 'admin' || role === 'super_admin';

/** Ручной триггер одного прохода автодокрутки просмотров (ТЗ-03 R2.4). */
export async function adminViewsBump(): Promise<{ processed: number; details: { articleId: number; added: number }[] }> {
  return api('/admin/views/bump', { method: 'POST' });
}

/** Скользящее продление сессии (2026-11-18): админка раз в час меняет токен на свежий,
 *  пока юзер активен — протухает только после 12 часов бездействия, а не от звонка
 *  будильника. Принимает действующий токен; 401 (токен умер / аккаунт заблокирован /
 *  потолок сессии 72 ч) — не сбрасываем молча: даём модалку повторного входа
 *  (инцидент 2026-11-27), при отказе — классический сброс на /login, как в api(). */
export async function refreshTokenSliding(): Promise<void> {
  const token = localStorage.getItem('token');
  if (!token) return;
  try {
    const res = await fetch('/api/auth/refresh', {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}` },
    });
    if (res.status === 401) {
      const revived = await reviveSession();
      if (!revived) forceRelogin();
      return;
    }
    if (!res.ok) return;
    const body = (await res.json().catch(() => ({}))) as { token?: string };
    if (body.token) localStorage.setItem('token', body.token);
  } catch {
    /* сетевой сбой — повторим на следующем тике */
  }
}
