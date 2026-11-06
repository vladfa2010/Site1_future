import { useState, useRef, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { X, Mail, Lock, Eye, EyeOff, CheckCircle, ArrowLeft, Check } from 'lucide-react';
import { useNavigate } from 'react-router';
import { useAuth } from '../auth';
import { useAuthModal } from '../authModal';
import BorderGlow from './BorderGlow';

/**
 * AuthModal — 1:1 с AUTH_MODAL_SPEC.md PULSE (ТЗ-119 v3):
 * табы Вход/Регистрация, регистрация в 3 шага со степпером,
 * живой счётчик пароля, BorderGlow-кнопка «Создать аккаунт», Success-экран.
 * Адаптации: без starterTags/forgot/analytics (у нас их нет).
 */
const EASE = [0.16, 1, 0.3, 1] as const;

const inputCls =
  'h-11 w-full rounded-lg border border-[#222222] bg-[#161616] px-4 text-sm text-white placeholder-[#6B7280] outline-none transition-colors focus:border-[#00D4FF]/50';

export default function AuthModal() {
  const { isOpen, mode: defaultMode, returnUrl, close } = useAuthModal();
  const { login, register } = useAuth();
  const navigate = useNavigate();

  const [mode, setMode] = useState<'login' | 'register'>(defaultMode);
  const [step, setStep] = useState<'form' | 'success'>('form');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [username, setUsername] = useState('');
  const [agreed, setAgreed] = useState(false);
  const [rememberMe, setRememberMe] = useState(false);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [showPassword, setShowPassword] = useState(false);

  const [regStep, setRegStep] = useState<1 | 2 | 3>(1);
  const [stepDir, setStepDir] = useState(1);
  const [stepHint, setStepHint] = useState('');
  const [igniteCount, setIgniteCount] = useState(0);
  const [pwdSubmitError, setPwdSubmitError] = useState(false);
  const [pwdShakeTick, setPwdShakeTick] = useState(0);
  const [agreeError, setAgreeError] = useState(false);
  const [agreeShakeTick, setAgreeShakeTick] = useState(0);
  const wasLitRef = useRef(false);
  const usernameRef = useRef<HTMLInputElement>(null);
  const emailRef = useRef<HTMLInputElement>(null);
  const passwordRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (isOpen) setMode(defaultMode);
  }, [isOpen, defaultMode]);

  useEffect(() => {
    if (!isOpen) return;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = '';
    };
  }, [isOpen]);

  const resetRegState = () => {
    setRegStep(1);
    setStepDir(1);
    setStepHint('');
    setIgniteCount(0);
    setPwdSubmitError(false);
    setAgreeError(false);
    wasLitRef.current = false;
  };

  const reset = () => {
    setEmail('');
    setPassword('');
    setUsername('');
    setAgreed(false);
    setRememberMe(false);
    setShowPassword(false);
    setError('');
    setStep('form');
    setMode('login');
    resetRegState();
  };

  const handleClose = () => {
    reset();
    close();
  };

  const switchMode = (m: 'login' | 'register') => {
    setMode(m);
    setEmail('');
    setPassword('');
    setUsername('');
    setAgreed(false);
    setShowPassword(false);
    setError('');
    setStep('form');
    resetRegState();
  };

  // зажигание кнопки при первом достижении 8 символов
  useEffect(() => {
    const lit = password.length >= 8;
    if (lit && !wasLitRef.current) {
      setIgniteCount((c) => c + 1);
      wasLitRef.current = true;
    } else if (!lit) {
      wasLitRef.current = false;
    }
  }, [password]);

  const goStep = (next: 1 | 2 | 3, dir: number) => {
    setStepDir(dir);
    setRegStep(next);
    setStepHint('');
    setError('');
  };

  const onStep1Next = () => {
    if (username.trim().length < 2) {
      setStepHint('Напишите хотя бы пару букв — и вперёд');
      usernameRef.current?.focus();
      return;
    }
    goStep(2, 1);
    setTimeout(() => emailRef.current?.focus(), 350);
  };

  const onStep2Next = () => {
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email.trim())) {
      setStepHint('Похоже, в адресе опечатка — проверьте');
      emailRef.current?.focus();
      return;
    }
    goStep(3, 1);
    setTimeout(() => passwordRef.current?.focus(), 350);
  };

  const handleLogin = async () => {
    setError('');
    setLoading(true);
    try {
      await login(email.trim(), password);
      handleClose();
      if (returnUrl) navigate(returnUrl, { replace: true });
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Сетевая ошибка');
    } finally {
      setLoading(false);
    }
  };

  const handleRegister = async () => {
    if (username.trim().length < 2) {
      goStep(1, -1);
      return;
    }
    if (password.length < 8) {
      setPwdSubmitError(true);
      setPwdShakeTick((t) => t + 1);
      passwordRef.current?.focus();
      return;
    }
    if (!agreed) {
      setAgreeError(true);
      setAgreeShakeTick((t) => t + 1);
      return;
    }
    setError('');
    setLoading(true);
    try {
      await register(username.trim(), email.trim(), password);
      setStep('success');
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Ошибка регистрации');
    } finally {
      setLoading(false);
    }
  };

  const pwdCounter =
    password.length === 0
      ? 'Минимум 8 символов. Последний шаг — честно.'
      : password.length < 8
        ? `Ещё ${8 - password.length} симв. — и кнопка зажгётся`
        : 'Пароль готов ✓';

  const stepTitle = ['Как к вам обращаться?', 'Ваша почта', 'Придумайте пароль'][regStep - 1];

  return (
    <AnimatePresence>
      {isOpen && (
        <motion.div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4 backdrop-blur-sm"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.2 }}
          onMouseDown={(e) => {
            if (e.target === e.currentTarget) handleClose();
          }}
        >
          <motion.div
            className="relative w-full max-w-[400px] rounded-2xl border border-[#222222] bg-[#111111] p-8"
            initial={{ scale: 0.95, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            exit={{ scale: 0.95, opacity: 0 }}
            transition={{ type: 'spring', stiffness: 400, damping: 35 }}
          >
            <button
              onClick={handleClose}
              className="absolute top-4 right-4 flex h-8 w-8 items-center justify-center rounded-lg border border-[#222222] text-[#6B7280] transition-colors hover:text-white"
              aria-label="Закрыть"
            >
              <X size={16} />
            </button>

            <div className="mb-6 flex justify-center">
              <span className="text-xl font-bold text-white">
                Инвестиционно<span className="text-orange-500">.рф</span>
              </span>
            </div>

            {/* Табы */}
            <div className="mb-6 flex rounded-full border border-[#222222] bg-[#161616] p-1">
              {(['login', 'register'] as const).map((m) => (
                <button
                  key={m}
                  onClick={() => switchMode(m)}
                  className={`h-9 flex-1 rounded-full text-sm font-semibold transition-colors ${
                    mode === m ? 'bg-[#222222] text-white' : 'text-[#6B7280] hover:text-white'
                  }`}
                >
                  {m === 'login' ? 'Вход' : 'Регистрация'}
                </button>
              ))}
            </div>

            <AnimatePresence mode="wait">
              {step === 'form' ? (
                <motion.div key="form" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
                  {mode === 'login' ? (
                    /* ── ВХОД ── */
                    <form
                      onSubmit={(e) => {
                        e.preventDefault();
                        void handleLogin();
                      }}
                      className="space-y-4"
                    >
                      <h3 className="text-center text-lg font-bold text-white">Вход</h3>
                      <div>
                        <label className="mb-1.5 block text-sm text-[#9CA3AF]">Email</label>
                        <div className="relative">
                          <Mail size={16} className="absolute top-1/2 left-4 -translate-y-1/2 text-[#6B7280]" />
                          <input
                            type="email"
                            required
                            autoFocus
                            value={email}
                            onChange={(e) => setEmail(e.target.value)}
                            placeholder="your@email.com"
                            className={`${inputCls} pl-11`}
                          />
                        </div>
                      </div>
                      <div>
                        <label className="mb-1.5 block text-sm text-[#9CA3AF]">Пароль</label>
                        <div className="relative">
                          <Lock size={16} className="absolute top-1/2 left-4 -translate-y-1/2 text-[#6B7280]" />
                          <input
                            type={showPassword ? 'text' : 'password'}
                            required
                            value={password}
                            onChange={(e) => setPassword(e.target.value)}
                            placeholder="••••••••"
                            className={`${inputCls} px-11`}
                          />
                          <button
                            type="button"
                            onClick={() => setShowPassword((s) => !s)}
                            className="absolute top-1/2 right-4 -translate-y-1/2 text-[#6B7280] hover:text-white"
                            aria-label="Показать пароль"
                          >
                            {showPassword ? <EyeOff size={16} /> : <Eye size={16} />}
                          </button>
                        </div>
                      </div>
                      <label className="flex cursor-pointer items-center gap-2 text-sm text-[#9CA3AF]">
                        <input
                          type="checkbox"
                          checked={rememberMe}
                          onChange={(e) => setRememberMe(e.target.checked)}
                          className="h-4 w-4 rounded border-[#222222] bg-[#161616] accent-[#00D4FF]"
                        />
                        Запомнить меня
                      </label>
                      {error && <p className="text-center text-sm text-[#EF4444]">{error}</p>}
                      <button
                        type="submit"
                        disabled={loading}
                        className="h-11 w-full rounded-full bg-gradient-to-br from-[#00D4FF] to-[#0099CC] text-sm font-semibold text-[#0E0E0E] transition-opacity hover:opacity-90 disabled:opacity-50"
                      >
                        {loading ? 'Входим…' : 'Войти'}
                      </button>
                    </form>
                  ) : (
                    /* ── РЕГИСТРАЦИЯ: 3 ШАГА ── */
                    <div>
                      {/* Степпер */}
                      <div className="mb-1 flex items-center">
                        {[1, 2, 3].map((n, i) => (
                          <div key={n} className="flex flex-1 items-center last:flex-none">
                            <div
                              className={`flex h-[30px] w-[30px] items-center justify-center rounded-full text-xs font-semibold transition-colors ${
                                n < regStep
                                  ? 'bg-[#00D4FF]/15 text-[#00D4FF]'
                                  : n === regStep
                                    ? 'bg-[#00D4FF] text-[#0E0E0E] shadow-[0_0_16px_rgba(0,212,255,0.35)]'
                                    : 'bg-[#1C1C1C] text-[#6B7280]'
                              }`}
                            >
                              {n < regStep ? <Check size={14} /> : n}
                            </div>
                            {i < 2 && (
                              <div className="mx-1 h-[2px] flex-1 overflow-hidden rounded bg-[#222222]">
                                <div
                                  className="h-full bg-[#00D4FF] transition-all duration-300"
                                  style={{ width: n < regStep ? '100%' : '0%' }}
                                />
                              </div>
                            )}
                          </div>
                        ))}
                      </div>
                      <p className="mb-4 text-xs tracking-wide text-[#6B7280]">Шаг {regStep} из 3</p>

                      <div className="min-h-[258px]">
                        <AnimatePresence mode="wait" custom={stepDir}>
                          <motion.div
                            key={regStep}
                            custom={stepDir}
                            initial={{ opacity: 0, x: 48 * stepDir }}
                            animate={{ opacity: 1, x: 0 }}
                            exit={{ opacity: 0, x: -48 * stepDir }}
                            transition={{ duration: 0.3, ease: EASE }}
                          >
                            <h3 className="mb-4 text-center text-lg font-bold text-white">{stepTitle}</h3>

                            {regStep === 1 && (
                              <div>
                                <input
                                  ref={usernameRef}
                                  value={username}
                                  onChange={(e) => {
                                    setUsername(e.target.value);
                                    setStepHint('');
                                  }}
                                  onKeyDown={(e) => e.key === 'Enter' && (e.preventDefault(), onStep1Next())}
                                  autoComplete="nickname"
                                  autoFocus
                                  className={inputCls}
                                />
                                {stepHint && <p className="mt-2 text-xs text-[#EF4444]">{stepHint}</p>}
                                <div className="mt-6">
                                  <NextButton onClick={onStep1Next} />
                                </div>
                              </div>
                            )}

                            {regStep === 2 && (
                              <div>
                                <div className="relative">
                                  <Mail size={16} className="absolute top-1/2 left-4 -translate-y-1/2 text-[#6B7280]" />
                                  <input
                                    ref={emailRef}
                                    type="email"
                                    value={email}
                                    onChange={(e) => {
                                      setEmail(e.target.value);
                                      setStepHint('');
                                    }}
                                    onKeyDown={(e) => e.key === 'Enter' && (e.preventDefault(), onStep2Next())}
                                    placeholder="your@email.com"
                                    autoComplete="email"
                                    className={`${inputCls} pl-11`}
                                  />
                                </div>
                                {stepHint && <p className="mt-2 text-xs text-[#EF4444]">{stepHint}</p>}
                                <div className="mt-6 flex gap-3">
                                  <BackButton onClick={() => goStep(1, -1)} />
                                  <NextButton onClick={onStep2Next} />
                                </div>
                              </div>
                            )}

                            {regStep === 3 && (
                              <form
                                onSubmit={(e) => {
                                  e.preventDefault();
                                  void handleRegister();
                                }}
                                className="space-y-4"
                              >
                                <div className="relative">
                                  <Lock size={16} className="absolute top-1/2 left-4 -translate-y-1/2 text-[#6B7280]" />
                                  <input
                                    ref={passwordRef}
                                    type={showPassword ? 'text' : 'password'}
                                    value={password}
                                    onChange={(e) => {
                                      setPassword(e.target.value);
                                      setPwdSubmitError(false);
                                    }}
                                    placeholder="••••••••"
                                    autoComplete="new-password"
                                    className={`${inputCls} px-11`}
                                  />
                                  <button
                                    type="button"
                                    onClick={() => setShowPassword((s) => !s)}
                                    className="absolute top-1/2 right-4 -translate-y-1/2 text-[#6B7280] hover:text-white"
                                    aria-label="Показать пароль"
                                  >
                                    {showPassword ? <EyeOff size={16} /> : <Eye size={16} />}
                                  </button>
                                </div>
                                <motion.p
                                  key={pwdShakeTick}
                                  animate={pwdShakeTick ? { x: [0, -3, 0, 3, 0] } : {}}
                                  transition={{ duration: 0.3 }}
                                  className={`text-xs ${pwdSubmitError ? 'text-[#EF4444]' : password.length >= 8 ? 'text-[#00D4FF]' : 'text-[#6B7280]'}`}
                                >
                                  {pwdCounter}
                                </motion.p>
                                <motion.label
                                  key={agreeShakeTick}
                                  animate={agreeShakeTick ? { x: [0, -3, 0, 3, 0] } : {}}
                                  transition={{ duration: 0.3 }}
                                  className={`flex cursor-pointer items-start gap-2 text-xs leading-relaxed ${
                                    agreeError ? 'rounded-lg border border-[#EF4444]/50 p-2 text-[#EF4444]' : 'text-[#9CA3AF]'
                                  }`}
                                >
                                  <input
                                    type="checkbox"
                                    checked={agreed}
                                    onChange={(e) => {
                                      setAgreed(e.target.checked);
                                      setAgreeError(false);
                                    }}
                                    className="mt-0.5 h-[18px] w-[18px] shrink-0 rounded border-[#222222] bg-[#161616] accent-[#00D4FF]"
                                  />
                                  <span>
                                    Соглашаюсь с{' '}
                                    <span className="text-[#00D4FF] underline">условиями использования</span> и{' '}
                                    <span className="text-[#00D4FF] underline">политикой конфиденциальности</span>
                                  </span>
                                </motion.label>
                                {agreeError && (
                                  <p className="text-xs text-[#EF4444]">Без согласия аккаунт не создать — отметьте галочку</p>
                                )}
                                {error && <p className="text-center text-sm text-[#EF4444]">{error}</p>}
                                <div className="flex gap-3 pt-1">
                                  <BackButton onClick={() => goStep(2, -1)} />
                                  <BorderGlow lit={password.length >= 8} sweepSignal={igniteCount} className="flex-1" backgroundColor="#161616" borderRadius={9999}>
                                    <button
                                      type="submit"
                                      disabled={loading}
                                      className={`h-11 w-full rounded-full bg-[#161616] text-sm font-semibold transition-colors duration-300 ${
                                        password.length >= 8 ? 'text-white' : 'text-[#6B7280]'
                                      } disabled:opacity-60`}
                                    >
                                      {loading ? 'Создаём…' : '✨ Создать аккаунт'}
                                    </button>
                                  </BorderGlow>
                                </div>
                              </form>
                            )}
                          </motion.div>
                        </AnimatePresence>
                      </div>
                    </div>
                  )}
                </motion.div>
              ) : (
                /* ── SUCCESS ── */
                <motion.div
                  key="success"
                  className="flex flex-col items-center text-center"
                  initial={{ opacity: 0, scale: 0.9 }}
                  animate={{ opacity: 1, scale: 1 }}
                  exit={{ opacity: 0 }}
                  transition={{ duration: 0.4, ease: EASE }}
                >
                  <motion.div
                    initial={{ scale: 0 }}
                    animate={{ scale: 1 }}
                    transition={{ type: 'spring', delay: 0.1 }}
                  >
                    <CheckCircle size={64} className="text-[#00D4FF]" />
                  </motion.div>
                  <motion.h3
                    className="mt-4 text-xl font-bold text-white"
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: 0.2 }}
                  >
                    Аккаунт создан!
                  </motion.h3>
                  <motion.p
                    className="mt-2 text-sm leading-relaxed text-[#9CA3AF]"
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: 0.3 }}
                  >
                    {username.trim()
                      ? `${username.trim()[0].toUpperCase()}${username.trim().slice(1)}, добро пожаловать в Инвестиционно.рф.`
                      : 'Добро пожаловать в Инвестиционно.рф.'}
                  </motion.p>
                  <motion.button
                    onClick={() => {
                      handleClose();
                      navigate(returnUrl ?? '/', { replace: true });
                    }}
                    className="mt-6 h-11 w-full rounded-full bg-gradient-to-br from-[#00D4FF] to-[#0099CC] text-sm font-semibold text-[#0E0E0E] transition-opacity hover:opacity-90"
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: 0.9 }}
                  >
                    К рынку
                  </motion.button>
                </motion.div>
              )}
            </AnimatePresence>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}

function NextButton({ onClick }: { onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="h-11 flex-1 rounded-full bg-gradient-to-br from-[#00D4FF] to-[#0099CC] text-sm font-semibold text-[#0E0E0E] transition-opacity hover:opacity-90"
    >
      Вперёд →
    </button>
  );
}

function BackButton({ onClick }: { onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="flex h-11 items-center gap-1.5 rounded-full border border-[#222222] bg-[#161616] px-4 text-sm font-medium text-[#9CA3AF] transition-colors hover:text-white"
    >
      <ArrowLeft size={14} /> Назад
    </button>
  );
}
