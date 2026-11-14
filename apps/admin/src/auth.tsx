import { createContext, useContext, useEffect, useState, type ReactNode } from 'react';
import type { AdminUser } from './api';

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
          localStorage.removeItem('token');
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

  return <AuthContext.Provider value={{ user, login, logout }}>{children}</AuthContext.Provider>;
}

export const useAuth = () => useContext(AuthContext);
