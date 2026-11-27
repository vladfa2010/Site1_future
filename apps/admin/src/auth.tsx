import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from 'react';
import { setSessionReviveHandler } from './api';
import type { AdminUser } from './api';
import SessionExpiredModal from './components/SessionExpiredModal';

interface AuthState {
  user: AdminUser | null;
  login: (email: string, password: string) => Promise<void>;
  logout: () => void;
}

const AuthContext = createContext<AuthState>({ user: null, login: async () => {}, logout: () => {} });

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<AdminUser | null>(() => {
    try {
      return JSON.parse(localStorage.getItem('user') ?? 'null');
    } catch {
      return null;
    }
  });

  // ---- Модалка «сессия истекла» (инцидент 2026-11-27) ----
  // Один promise на пачку одновременных 401: save()/autosave делают несколько
  // запросов подряд и каждый прилетит с 401 — модалка должна быть одна,
  // а после входа все ждущие запросы повторятся каждый со свежим токеном.
  const [sessionPrompt, setSessionPrompt] = useState<{ done: (token: string | null) => void } | null>(null);
  const revivePromiseRef = useRef<Promise<string | null> | null>(null);

  const reviveSession = useCallback((): Promise<string | null> => {
    if (!revivePromiseRef.current) {
      revivePromiseRef.current = new Promise<string | null>((resolve) => {
        setSessionPrompt({ done: resolve });
      }).finally(() => {
        revivePromiseRef.current = null;
        setSessionPrompt(null);
      });
    }
    return revivePromiseRef.current;
  }, []);

  useEffect(() => {
    setSessionReviveHandler(reviveSession);
    return () => setSessionReviveHandler(null);
  }, [reviveSession]);

  // Профиль по токену: при монтировании и при SSO-пробросе из сайта
  // (событие 'invest-sso' диспатчит main.tsx, когда postMessage принёс токен)
  useEffect(() => {
    const loadMe = () => {
      const token = localStorage.getItem('token');
      if (!token) return;
      void fetch('/api/auth/me', { headers: { Authorization: `Bearer ${token}` } })
        .then((r) => (r.ok ? r.json() : Promise.reject()))
        .then((data) => {
          localStorage.setItem('user', JSON.stringify(data.user));
          setUser(data.user);
        })
        .catch(() => {
          // Проверяем сессию ДО начала работы, а не на первом «Сохранить»
          // (инцидент 2026-11-27: токен чистили, а user оставляли — RequireAdmin
          // продолжал рисовать админку на мёртвой сессии, api() слал запросы
          // уже без Authorization и получал сырую 401, которую показывал как есть)
          localStorage.removeItem('token');
          localStorage.removeItem('user');
          setUser(null);
        });
    };
    loadMe();
    window.addEventListener('invest-sso', loadMe);
    return () => window.removeEventListener('invest-sso', loadMe);
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const login = async (email: string, password: string) => {
    const res = await fetch('/api/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password }),
    });
    if (!res.ok) throw new Error('Неверный логин или пароль');
    const data = await res.json();
    localStorage.setItem('token', data.token);
    localStorage.setItem('user', JSON.stringify(data.user));
    setUser(data.user);
  };

  const logout = () => {
    localStorage.removeItem('token');
    localStorage.removeItem('user');
    setUser(null);
  };

  return (
    <AuthContext.Provider value={{ user, login, logout }}>
      {children}
      {sessionPrompt && (
        <SessionExpiredModal
          defaultEmail={user?.email ?? ''}
          login={login}
          onSuccess={() => sessionPrompt.done(localStorage.getItem('token'))}
          onCancel={() => sessionPrompt.done(null)}
        />
      )}
    </AuthContext.Provider>
  );
}

export const useAuth = () => useContext(AuthContext);
