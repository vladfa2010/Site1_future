import { useEffect, useState } from 'react';
import { Link } from 'react-router';
import { Breadcrumbs } from '../components/Breadcrumbs';
import { useAuth } from '../auth';
import { useAuthModal } from '../authModal';

/**
 * Публичная страница «Тарифы» (/pricing): планы из БД + фичи из реестра
 * (порт модели PULSE: registry драйвит Pricing).
 */
interface Plan {
  id: number;
  slug: string;
  name: string;
  description: string | null;
  priceMonthly: string;
  priceYearly: string;
  yearlyDiscount: number;
  features: Record<string, unknown>;
  isActive: boolean;
  comingSoonLabel: string | null;
}

interface Feature { id: string; label: string; description: string | null; isActive: boolean }

export default function PricingPage() {
  const { user } = useAuth();
  const { open } = useAuthModal();
  const [plans, setPlans] = useState<Plan[]>([]);
  const [features, setFeatures] = useState<Feature[]>([]);

  useEffect(() => {
    void fetch('/api/tariff-plans')
      .then((r) => (r.ok ? r.json() : Promise.reject()))
      .then((d: { plans: Plan[] }) => setPlans(d.plans.filter((p) => p.isActive)))
      .catch(() => {});
    void fetch('/api/features')
      .then((r) => (r.ok ? r.json() : Promise.reject()))
      .then((d: { features: Feature[] }) => setFeatures(d.features))
      .catch(() => {});
  }, []);

  const label = (id: string) => features.find((f) => f.id === id)?.label ?? id;

  return (
    <div className="mx-auto max-w-4xl">
      <Breadcrumbs items={[{ label: 'Тарифы' }]} />
      <header className="text-center">
        <h1 className="text-3xl font-bold">Тарифы</h1>
        <p className="mt-2 text-zinc-400">
          Откройте больше: закрытые идеи, дайджесты, ранний доступ. Оплата подключается — следите за анонсами.
        </p>
      </header>

      <div className="mt-8 grid gap-5 sm:grid-cols-2">
        {plans.map((p) => (
          <div key={p.id} className="flex flex-col rounded-2xl border border-[#2a2a2a] bg-[#191919] p-6">
            <h2 className="text-xl font-bold">{p.name}</h2>
            {p.description && <p className="mt-1 text-sm text-zinc-400">{p.description}</p>}
            <p className="mt-4">
              <span className="text-3xl font-bold">{Number(p.priceMonthly).toLocaleString('ru-RU')} ₽</span>
              <span className="text-sm text-zinc-500">/мес</span>
            </p>
            {Number(p.priceYearly) > 0 && (
              <p className="mt-1 text-sm text-zinc-400">
                {Number(p.priceYearly).toLocaleString('ru-RU')} ₽/год
                {p.yearlyDiscount > 0 && <span className="text-[#c9ff2a]"> −{p.yearlyDiscount}%</span>}
              </p>
            )}
            <ul className="mt-4 flex-1 space-y-1.5 text-sm text-zinc-300">
              {Object.entries(p.features)
                .filter(([, v]) => Boolean(v))
                .map(([k]) => (
                  <li key={k}>✓ {label(k)}</li>
                ))}
            </ul>
            {user ? (
              <Link to="/cabinet" className="mt-6 block rounded-full bg-[#beff00] py-2.5 text-center text-sm font-bold text-black hover:opacity-85">
                В кабинет
              </Link>
            ) : (
              <button onClick={() => open('register', '/pricing')} className="mt-6 rounded-full bg-[#beff00] py-2.5 text-sm font-bold text-black hover:opacity-85">
                Зарегистрироваться
              </button>
            )}
          </div>
        ))}
      </div>
      <p className="mt-6 text-center text-xs text-zinc-600">
        Оплата появится с подключением ЮKassa. История платежей — в личном кабинете.
      </p>
    </div>
  );
}
