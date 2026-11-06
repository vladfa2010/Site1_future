/** Аутентифицированный клиент API админки (JWT из localStorage). */
export class ApiError extends Error {
  constructor(public status: number, body: unknown) {
    super(`API ${status}: ${JSON.stringify(body)}`);
  }
}

export async function api<T>(path: string, options: RequestInit = {}): Promise<T> {
  const token = localStorage.getItem('token');
  const res = await fetch(`/api${path}`, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...(options.headers ?? {}),
    },
  });
  const body = await res.json().catch(() => ({}));
  if (!res.ok) throw new ApiError(res.status, body);
  return body as T;
}

export interface AdminUser {
  id: number;
  email: string;
  role: string;
  displayName: string | null;
}

export const isAdminRole = (role?: string) => role === 'admin' || role === 'super_admin';
