import React from 'react';
import ReactDOM from 'react-dom/client';
import { BrowserRouter } from 'react-router';
import App from './App';
import './index.css';

// SSO-проброс ДО рендера: сайт открывает админку как /?auth=<token>.
// Если оставить это эффектом внутри React — guard редиректит на /login раньше,
// чем эффект сохранит токен (эффекты бегут после коммита, а Navigate коммитит сразу).
try {
  const url = new URL(window.location.href);
  const handed = url.searchParams.get('auth');
  if (handed) {
    localStorage.setItem('token', handed);
    url.searchParams.delete('auth');
    window.history.replaceState(null, '', url.pathname + url.search);
  }
} catch {
  /* не мешаем старту приложения */
}

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <BrowserRouter>
      <App />
    </BrowserRouter>
  </React.StrictMode>,
);
