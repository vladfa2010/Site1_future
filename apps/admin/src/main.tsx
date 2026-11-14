import React from 'react';
import ReactDOM from 'react-dom/client';
import { BrowserRouter } from 'react-router';
import App from './App';
import './index.css';

// SSO-проброс через postMessage. Сайт открывает админку через window.open и шлёт
// { type: 'invest-sso', token } строго на origin админки; мы принимаем сообщения
// строго с origin сайта. Так токен не попадает в URL → не оседает в логах Caddy,
// истории браузера и Referer (аудит 2026-11-14: раньше передача была /?auth=<token>).
// Слушатель в module scope и ДО рендера: токен сохраняется раньше auth-контекста;
// поздние сообщения (админка уже загружена) — через событие 'invest-sso', которое
// слушает auth.tsx и дотягивает профиль через /api/auth/me.
const SITE_ORIGIN = new URL(import.meta.env.VITE_SITE_URL ?? 'http://localhost:1001').origin;
window.addEventListener('message', (e: MessageEvent) => {
  if (e.origin !== SITE_ORIGIN) return; // чужой origin — игнор (защита от подсадки токена)
  const d = e.data as { type?: string; token?: unknown } | null;
  if (d?.type !== 'invest-sso' || typeof d.token !== 'string' || !d.token) return;
  localStorage.setItem('token', d.token);
  // Профиль из localStorage может относиться к прежнему токену — сбрасываем,
  // auth.tsx подтянет актуальный через /api/auth/me
  localStorage.removeItem('user');
  (e.source as Window | null)?.postMessage({ type: 'invest-sso-ack' }, { targetOrigin: e.origin });
  window.dispatchEvent(new Event('invest-sso'));
});

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <BrowserRouter>
      <App />
    </BrowserRouter>
  </React.StrictMode>,
);
