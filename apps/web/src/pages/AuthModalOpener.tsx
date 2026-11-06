import { useEffect } from 'react';
import { Navigate, Route, Routes, useLocation, useNavigate } from 'react-router';
import { useAuthModal } from '../authModal';

/**
 * Роуты-заглушки: /login и /register открывают AuthModal (1:1 с PULSE —
 * аутентификация только модалкой) и возвращают на from (или главную).
 */
export default function AuthModalOpener({ mode }: { mode: 'login' | 'register' }) {
  const { open } = useAuthModal();
  const location = useLocation();
  const navigate = useNavigate();

  useEffect(() => {
    const from = (location.state as { from?: string } | null)?.from ?? null;
    open(mode, from);
    navigate(from ?? '/', { replace: true });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return null;
}

export { Navigate };
