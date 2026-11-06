import { createContext, useCallback, useContext, useState, type ReactNode } from 'react';

/**
 * Управление AuthModal (1:1 с AuthModalContext PULSE, упрощённо):
 * open('login' | 'register', returnUrl?) из любой точки приложения.
 */
interface AuthModalState {
  isOpen: boolean;
  mode: 'login' | 'register';
  returnUrl: string | null;
  open: (mode: 'login' | 'register', returnUrl?: string | null) => void;
  close: () => void;
}

const AuthModalContext = createContext<AuthModalState>({
  isOpen: false,
  mode: 'login',
  returnUrl: null,
  open: () => {},
  close: () => {},
});

export function AuthModalProvider({ children }: { children: ReactNode }) {
  const [isOpen, setIsOpen] = useState(false);
  const [mode, setMode] = useState<'login' | 'register'>('login');
  const [returnUrl, setReturnUrl] = useState<string | null>(null);

  const open = useCallback((m: 'login' | 'register', ru?: string | null) => {
    setMode(m);
    setReturnUrl(ru ?? null);
    setIsOpen(true);
  }, []);
  const close = useCallback(() => setIsOpen(false), []);

  return (
    <AuthModalContext.Provider value={{ isOpen, mode, returnUrl, open, close }}>
      {children}
    </AuthModalContext.Provider>
  );
}

export const useAuthModal = () => useContext(AuthModalContext);
