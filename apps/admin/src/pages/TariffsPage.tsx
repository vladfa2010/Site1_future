import { useEffect, useState, type FormEvent } from 'react';
import { api } from '../api';

/**
 * Админка тарифов — порт модели PULSE (PAYMENTS.md §2–3):
 * каталог планов с ценами (месяц/год, скидка), фичами, active/coming soon.
 * Оплата (ЮKassa) подтянет тарифы отсюда же.
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
  sortOrder: number;
}

const EMPTY_FORM = {
  slug: '', name: '', description: '', priceMonthly: '0', priceYearly: '0', yearlyDiscount: '20',
  isActive: true, comingSoonLabel: '', sortOrder: '0',
};
const EMPTY_FEATURES: Record<string, boolean> = {};

interface RegistryFeature { id: string; label: string; description: string | null; isActive: boolean }

export default function TariffsPage() {
  const [plans, setPlans] = useState<Plan[]>([]);
  const [registry, setRegistry] = useState<RegistryFeature[]>([]);
  const [editing, setEditing] = useState<Plan | null>(null);
  const [showCreate, setShowCreate] = useState(false);
  const [form, setForm] = useState(EMPTY_FORM);
  const [features, setFeatures] = useState<Record<string, boolean>>(EMPTY_FEATURES);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const load = async () => {
    const [p, f] = await Promise.all([
      api<{ plans: Plan[] }>('/tariff-plans'),
      api<{ features: RegistryFeature[] }>('/admin/features').catch(() => ({ features: [] as RegistryFeature[] })),
    ]);
    setPlans(p.plans);
    setRegistry(f.features);
  };
  useEffect(() => { void load().catch(() => setError('Ошибка загрузки')); }, []);

  const featureLabel = (id: string) => registry.find((f) => f.id === id)?.label ?? id;

  const startEdit = (p: Plan) => {
    setEditing(p);
    setShowCreate(false);
    setForm({
      slug: p.slug, name: p.name, description: p.description ?? '', priceMonthly: p.priceMonthly,
      priceYearly: p.priceYearly, yearlyDiscount: String(p.yearlyDiscount),
      isActive: p.isActive, comingSoonLabel: p.comingSoonLabel ?? '', sortOrder: String(p.sortOrder),
    });
    setFeatures({ ...EMPTY_FEATURES, ...(p.features as Record<string, boolean>) });
  };

  const startCreate = () => {
    setEditing(null);
    setShowCreate(true);
    setForm(EMPTY_FORM);
    setFeatures(EMPTY_FEATURES);
  };

  const save = async (e: FormEvent) => {
    e.preventDefault();
    setError(null);
    setNotice(null);
    const body = {
      ...(editing ? {} : { slug: form.slug }),
      name: form.name,
      description: form.description || undefined,
      priceMonthly: form.priceMonthly,
      priceYearly: form.priceYearly,
      yearlyDiscount: Number(form.yearlyDiscount),
      features,
      isActive: form.isActive,
      comingSoonLabel: form.comingSoonLabel || null,
      sortOrder: Number(form.sortOrder),
    };
    try {
      if (editing) {
        await api(`/tariff-plans/${editing.id}`, { method: 'PATCH', body: JSON.stringify(body) });
        setNotice(`Тариф «${form.name}» обновлён ✓`);
      } else {
        await api('/tariff-plans', { method: 'POST', body: JSON.stringify(body) });
        setNotice(`Тариф «${form.name}» создан ✓`);
      }
      setEditing(null);
      setShowCreate(false);
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Ошибка сохранения');
    }
  };

  // фичи плана: подписи из реестра (порт PULSE — registry драйвит форму)
  const activeFeatures = (p: Plan) =>
    Object.entries(p.features)
      .filter(([, v]) => Boolean(v))
      .map(([k]) => featureLabel(k));

  // чекбоксы: активные фичи реестра + фичи, уже выбранные в плане (даже выключенные в реестре)
  const checkboxFeatures = editing
    ? [...registry.filter((f) => f.isActive), ...registry.filter((f) => !f.isActive && editing.features[f.id])]
    : registry.filter((f) => f.isActive);

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-bold">Тарифы</h1>
        <button className="btn" onClick={startCreate}>+ Новый тариф</button>
      </div>
      <p className="text-sm text-zinc-500">
        Каталог тарифов (модель PULSE). Материалы с доступом «по тарифу» привязываются к планам отсюда;
        будущая оплата будет активировать эти же планы.
      </p>
      {notice && <p className="rounded-lg bg-green-500/10 px-3 py-2 text-sm text-green-400">{notice}</p>}
      {error && <p className="rounded-lg bg-red-500/10 px-3 py-2 text-sm text-red-400">{error}</p>}

      <div className="card overflow-x-auto p-0">
        <table className="w-full">
          <thead className="border-b border-zinc-800">
            <tr><th className="th">Тариф</th><th className="th">Месяц</th><th className="th">Год</th><th className="th">Фичи</th><th className="th">Статус</th><th className="th" /></tr>
          </thead>
          <tbody>
            {plans.map((p) => (
              <tr key={p.id} className="border-b border-zinc-800 last:border-0">
                <td className="td">
                  <span className="font-medium">{p.name}</span>
                  <span className="ml-2 text-xs text-zinc-600">{p.slug}</span>
                </td>
                <td className="td whitespace-nowrap">{Number(p.priceMonthly).toLocaleString('ru-RU')} ₽</td>
                <td className="td whitespace-nowrap text-zinc-400">
                  {Number(p.priceYearly).toLocaleString('ru-RU')} ₽
                  {p.yearlyDiscount > 0 && <span className="ml-1 text-xs text-[#c9ff2a]">−{p.yearlyDiscount}%</span>}
                </td>
                <td className="td max-w-xs">
                  <span className="line-clamp-1 text-xs text-zinc-500">{activeFeatures(p).join(', ') || '—'}</span>
                </td>
                <td className="td">
                  {p.isActive
                    ? <span className="rounded-full bg-green-500/10 px-2 py-0.5 text-xs text-green-400">активен</span>
                    : <span className="rounded-full bg-zinc-800 px-2 py-0.5 text-xs text-zinc-500">{p.comingSoonLabel ?? 'скрыт'}</span>}
                </td>
                <td className="td"><button onClick={() => startEdit(p)} className="text-orange-400 hover:underline">ред.</button></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {(editing || showCreate) && (
        <form onSubmit={save} className="card space-y-4">
          <h2 className="font-semibold">{editing ? `Редактирование: ${editing.name}` : 'Новый тариф'}</h2>
          <div className="grid gap-4 sm:grid-cols-3">
            {!editing && (
              <div>
                <label className="label">Slug</label>
                <input className="input" required pattern="[a-z0-9-]+" value={form.slug} onChange={(e) => setForm({ ...form, slug: e.target.value })} />
              </div>
            )}
            <div>
              <label className="label">Название</label>
              <input className="input" required value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
            </div>
            <div>
              <label className="label">Описание</label>
              <input className="input" value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} />
            </div>
            <div>
              <label className="label">Цена/месяц, ₽</label>
              <input className="input" type="number" min="0" value={form.priceMonthly} onChange={(e) => setForm({ ...form, priceMonthly: e.target.value })} />
            </div>
            <div>
              <label className="label">Цена/год, ₽</label>
              <input className="input" type="number" min="0" value={form.priceYearly} onChange={(e) => setForm({ ...form, priceYearly: e.target.value })} />
            </div>
            <div>
              <label className="label">Скидка за год, %</label>
              <input className="input" type="number" min="0" max="100" value={form.yearlyDiscount} onChange={(e) => setForm({ ...form, yearlyDiscount: e.target.value })} />
            </div>
            <div>
              <label className="label">Порядок показа</label>
              <input className="input" type="number" value={form.sortOrder} onChange={(e) => setForm({ ...form, sortOrder: e.target.value })} />
            </div>
            <div>
              <label className="label">Бейдж «скоро» (пусто — без)</label>
              <input className="input" placeholder="Скоро" value={form.comingSoonLabel} onChange={(e) => setForm({ ...form, comingSoonLabel: e.target.value })} />
            </div>
            <label className="flex items-end gap-2 pb-2 text-sm">
              <input type="checkbox" checked={form.isActive} onChange={(e) => setForm({ ...form, isActive: e.target.checked })} />
              Активен (виден на сайте)
            </label>
          </div>
          <div>
            <span className="label">Фичи тарифа (из реестра «Фичи»)</span>
            <div className="flex flex-wrap gap-3">
              {checkboxFeatures.map((f) => (
                <label key={f.id} className="flex items-center gap-1.5 text-sm text-zinc-300" title={f.description ?? f.id}>
                  <input
                    type="checkbox"
                    checked={features[f.id] ?? false}
                    onChange={(e) => setFeatures({ ...features, [f.id]: e.target.checked })}
                  />
                  {f.label}
                  {!f.isActive && <span className="text-xs text-zinc-600">(выкл. в реестре)</span>}
                </label>
              ))}
              {checkboxFeatures.length === 0 && <span className="text-sm text-zinc-500">Реестр фич пуст — добавьте в табе «Фичи»</span>}
            </div>
          </div>
          <div className="flex gap-3">
            <button className="btn" type="submit">Сохранить</button>
            <button type="button" className="btn-secondary" onClick={() => { setEditing(null); setShowCreate(false); }}>Отмена</button>
          </div>
        </form>
      )}
    </div>
  );
}
