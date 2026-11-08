import { useCallback, useEffect, useState } from 'react';
import { api, ApiError } from '../api';

/**
 * Админка тарифов — порт PlansSubTab PULSE на новую модель subscription_plans
 * (API /api/admin/plans). Старые /api/tariff-plans и таблица tariff_plans не трогаем —
 * на них работает пейволл сайта (переключение — отдельная фаза).
 *
 * Подписчики плана маппятся через tariff_plans.slug = id плана (оплата не подключена).
 */
interface AdminPlan {
  id: string;
  name: string;
  price: number;
  billingFrequency: string;
  yearlyDiscount: number;
  tagLimit: number;
  portfolioLimit: number;
  planLevel: number;
  features: Record<string, boolean>;
  displayOrder: number;
  isActive: boolean;
  isPopular: boolean;
  comingSoonLabel: string | null;
  createdAt: string | null;
  updatedAt: string | null;
  deletedAt: string | null;
}

interface RegistryFeature {
  id: string;
  label: string;
  description: string | null;
  isActive: boolean;
}

interface Subscriber {
  id: number;
  display_name: string | null;
  email: string;
  tariff_expires_at: string | null;
}

const FREQ_OPTIONS = ['weekly', 'monthly', 'quarterly', 'yearly'] as const;

function formatDateTime(iso: string | Date | null): string {
  if (!iso) return '—';
  return new Date(iso).toLocaleString('ru-RU', {
    day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit',
  });
}

function formatDateShort(iso: string | null): string {
  if (!iso) return 'бессрочно';
  return new Date(iso).toLocaleDateString('ru-RU', { day: '2-digit', month: '2-digit', year: 'numeric' });
}

function errMsg(err: unknown): string {
  if (err instanceof ApiError) {
    try {
      const body = JSON.parse(err.message.replace(/^API \d+: /, '')) as { error?: string };
      if (typeof body.error === 'string') return body.error;
    } catch { /* fallthrough */ }
    return err.message;
  }
  return err instanceof Error ? err.message : 'Ошибка';
}

interface FormState {
  id: string;
  name: string;
  price: string;
  billing_frequency: string;
  yearly_discount: string;
  tag_limit: string;
  portfolio_limit: string;
  plan_level: string;
  display_order: string;
  coming_soon_label: string;
  is_active: boolean;
  is_popular: boolean;
  features: Record<string, boolean>;
}

export default function TariffsPage() {
  const [plans, setPlans] = useState<AdminPlan[]>([]);
  const [registry, setRegistry] = useState<RegistryFeature[]>([]);
  const [loading, setLoading] = useState(true);
  const [lastRefresh, setLastRefresh] = useState<Date | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);

  const [modalOpen, setModalOpen] = useState(false);
  const [editingPlan, setEditingPlan] = useState<AdminPlan | null>(null);
  const [form, setForm] = useState<FormState | null>(null);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);

  const [archiveConfirm, setArchiveConfirm] = useState<AdminPlan | null>(null);
  const [archiveSubscribers, setArchiveSubscribers] = useState<number | null>(null);
  const [archiving, setArchiving] = useState(false);

  const [subscribers, setSubscribers] = useState<Subscriber[]>([]);
  const [subscribersTotal, setSubscribersTotal] = useState(0);
  const [subscribersLoading, setSubscribersLoading] = useState(false);
  const [showAllSubscribers, setShowAllSubscribers] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [p, f] = await Promise.all([
        api<{ plans: AdminPlan[] }>('/admin/plans'),
        api<{ features: RegistryFeature[] }>('/admin/features').catch(() => ({ features: [] as RegistryFeature[] })),
      ]);
      setPlans(p.plans);
      setRegistry(f.features);
      setLastRefresh(new Date());
      setLoadError(null);
    } catch (err) {
      setLoadError(errMsg(err));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { void load(); }, [load]);

  // автообновление раз в 60с (как в PULSE)
  useEffect(() => {
    const interval = setInterval(() => void load(), 60_000);
    return () => clearInterval(interval);
  }, [load]);

  // success-сообщение скрывается через 3с
  useEffect(() => {
    if (!successMsg) return;
    const t = setTimeout(() => setSuccessMsg(null), 3000);
    return () => clearTimeout(t);
  }, [successMsg]);

  // чекбоксы фич: активные из реестра + уже выбранные в плане (даже выключенные в реестре)
  const checkboxFeatures = (plan: AdminPlan | null) => [
    ...registry.filter((f) => f.isActive),
    ...(plan ? registry.filter((f) => !f.isActive && plan.features[f.id]) : []),
  ];

  const loadSubscribers = useCallback(async (planId: string) => {
    setSubscribersLoading(true);
    try {
      const res = await api<{ subscribers: Subscriber[]; total: number }>(`/admin/plans/${planId}/subscribers`);
      setSubscribers(res.subscribers);
      setSubscribersTotal(res.total);
    } catch {
      setSubscribers([]);
      setSubscribersTotal(0);
    } finally {
      setSubscribersLoading(false);
    }
  }, []);

  const openCreate = () => {
    const features: Record<string, boolean> = {};
    checkboxFeatures(null).forEach((f) => { features[f.id] = false; });
    setEditingPlan(null);
    setSubscribers([]);
    setSubscribersTotal(0);
    setShowAllSubscribers(false);
    setForm({
      id: '', name: '', price: '', billing_frequency: 'monthly', yearly_discount: '',
      tag_limit: '', portfolio_limit: '', plan_level: '', display_order: '',
      coming_soon_label: '', is_active: true, is_popular: false, features,
    });
    setSaveError(null);
    setModalOpen(true);
  };

  const openEdit = (plan: AdminPlan) => {
    const features: Record<string, boolean> = {};
    checkboxFeatures(plan).forEach((f) => { features[f.id] = plan.features[f.id] === true; });
    setEditingPlan(plan);
    setSubscribers([]);
    setSubscribersTotal(0);
    setShowAllSubscribers(false);
    setForm({
      id: plan.id,
      name: plan.name,
      price: String(plan.price),
      billing_frequency: plan.billingFrequency,
      yearly_discount: String(plan.yearlyDiscount),
      tag_limit: String(plan.tagLimit),
      portfolio_limit: String(plan.portfolioLimit),
      plan_level: String(plan.planLevel),
      display_order: String(plan.displayOrder),
      coming_soon_label: plan.comingSoonLabel ?? '',
      is_active: plan.isActive,
      is_popular: plan.isPopular,
      features,
    });
    setSaveError(null);
    setModalOpen(true);
    void loadSubscribers(plan.id);
  };

  const handleSave = async () => {
    if (!form) return;
    setSaving(true);
    setSaveError(null);
    const body = {
      name: form.name,
      price: Number(form.price),
      billing_frequency: form.billing_frequency,
      yearly_discount: Number(form.yearly_discount || 0),
      tag_limit: Number(form.tag_limit),
      portfolio_limit: Number(form.portfolio_limit || 0),
      plan_level: Number(form.plan_level),
      features: form.features,
      is_active: form.is_active,
      is_popular: form.is_popular,
      coming_soon_label: form.coming_soon_label || null,
      display_order: Number(form.display_order || 0),
    };
    try {
      if (!editingPlan) {
        await api('/admin/plans', { method: 'POST', body: JSON.stringify({ id: form.id, ...body }) });
        setSuccessMsg('Тариф создан');
      } else {
        await api(`/admin/plans/${editingPlan.id}`, { method: 'PATCH', body: JSON.stringify(body) });
        setSuccessMsg('Тариф сохранён');
      }
      setModalOpen(false);
      await load();
    } catch (err) {
      setSaveError(errMsg(err));
    } finally {
      setSaving(false);
    }
  };

  const openArchive = async (plan: AdminPlan) => {
    setArchiveConfirm(plan);
    setArchiveSubscribers(null);
    try {
      const res = await api<{ total: number }>(`/admin/plans/${plan.id}/subscribers`);
      setArchiveSubscribers(res.total);
    } catch {
      setArchiveSubscribers(null);
    }
  };

  const confirmArchive = async () => {
    if (!archiveConfirm) return;
    setArchiving(true);
    try {
      const res = await api<{ message?: string }>(`/admin/plans/${archiveConfirm.id}/archive`, { method: 'POST', body: '{}' });
      setSuccessMsg(res.message ?? 'Тариф архивирован');
      setArchiveConfirm(null);
      setArchiveSubscribers(null);
      await load();
    } catch (err) {
      setSaveError(errMsg(err));
    } finally {
      setArchiving(false);
    }
  };

  const handleRestore = async (plan: AdminPlan) => {
    try {
      await api(`/admin/plans/${plan.id}/restore`, { method: 'POST', body: '{}' });
      setSuccessMsg('Тариф восстановлен');
      await load();
    } catch (err) {
      setLoadError(errMsg(err));
    }
  };

  const setFeature = (id: string, value: boolean) => {
    setForm((prev) => prev && { ...prev, features: { ...prev.features, [id]: value } });
  };

  return (
    <div className="space-y-4">
      {/* Шапка */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex flex-wrap items-center gap-4 text-sm">
          <h1 className="text-xl font-bold">Тарифы</h1>
          <span className="text-zinc-400">{plans.length} тарифов</span>
          <span className="text-zinc-500">{plans.filter((p) => !p.deletedAt).length} активных</span>
          {lastRefresh && (
            <span className="hidden text-xs text-zinc-500 sm:inline">Обновлено: {formatDateTime(lastRefresh)}</span>
          )}
        </div>
        <div className="flex items-center gap-2">
          <button className="btn-secondary" onClick={() => void load()} disabled={loading} title="Обновить">
            ⟳
          </button>
          <button className="btn" onClick={openCreate}>+ Новый тариф</button>
        </div>
      </div>

      <p className="text-sm text-zinc-500">
        Каталог планов подписок (модель PULSE). Подписчики маппятся через старые тарифы (tariff_plans.slug);
        оплата пока не подключена — тариф выдаёт админ.
      </p>

      {successMsg && <p className="rounded-lg bg-green-500/10 px-3 py-2 text-sm text-green-400">✓ {successMsg}</p>}
      {loadError && <p className="rounded-lg bg-red-500/10 px-3 py-2 text-sm text-red-400">{loadError}</p>}

      {/* Таблица */}
      <div className="card overflow-x-auto p-0">
        <table className="w-full">
          <thead className="border-b border-zinc-800">
            <tr>
              <th className="th">ID</th><th className="th">Название</th><th className="th">Цена</th>
              <th className="th">Период</th><th className="th">Скидка за год %</th><th className="th">Лимит тегов</th>
              <th className="th">Уровень</th><th className="th">Активен</th><th className="th">Популярный</th>
              <th className="th">Скоро</th><th className="th">Порядок</th><th className="th">Удалён</th>
              <th className="th">Действия</th>
            </tr>
          </thead>
          <tbody>
            {plans.map((plan) => {
              const isDeleted = !!plan.deletedAt;
              return (
                <tr
                  key={plan.id}
                  className="border-b border-zinc-800 last:border-0"
                  style={{ opacity: isDeleted ? 0.55 : 1 }}
                >
                  <td className="td font-mono text-xs">{plan.id}</td>
                  <td className="td">
                    <span className="font-medium">{plan.name}</span>
                    {isDeleted && <span className="ml-2 rounded-full bg-red-500/10 px-2 py-0.5 text-xs text-red-400">Удалён</span>}
                  </td>
                  <td className="td whitespace-nowrap">{Number(plan.price).toLocaleString('ru-RU')} ₽</td>
                  <td className="td text-xs text-zinc-400">{plan.billingFrequency}</td>
                  <td className="td">{plan.yearlyDiscount}%</td>
                  <td className="td">{plan.tagLimit < 0 ? '∞' : plan.tagLimit}</td>
                  <td className="td">{plan.planLevel}</td>
                  <td className="td">
                    <span className={`rounded-full px-2 py-0.5 text-xs ${plan.isActive ? 'bg-green-500/10 text-green-400' : 'bg-zinc-800 text-zinc-500'}`}>
                      {plan.isActive ? 'Да' : 'Нет'}
                    </span>
                  </td>
                  <td className="td">
                    <span className={`rounded-full px-2 py-0.5 text-xs ${plan.isPopular ? 'bg-sky-500/10 text-sky-400' : 'bg-zinc-800 text-zinc-500'}`}>
                      {plan.isPopular ? 'Да' : 'Нет'}
                    </span>
                  </td>
                  <td className="td text-xs text-zinc-400">{plan.comingSoonLabel || '—'}</td>
                  <td className="td">{plan.displayOrder}</td>
                  <td className="td text-xs text-zinc-500">{formatDateTime(plan.deletedAt)}</td>
                  <td className="td whitespace-nowrap">
                    {isDeleted ? (
                      <button onClick={() => void handleRestore(plan)} className="text-green-400 hover:underline">восстановить</button>
                    ) : (
                      <span className="flex gap-3">
                        <button onClick={() => openEdit(plan)} className="text-orange-400 hover:underline">ред.</button>
                        <button onClick={() => void openArchive(plan)} className="text-amber-400 hover:underline">архив</button>
                      </span>
                    )}
                  </td>
                </tr>
              );
            })}
            {plans.length === 0 && (
              <tr><td colSpan={13} className="td py-10 text-center text-zinc-500">{loading ? 'Загрузка...' : 'Нет тарифов'}</td></tr>
            )}
          </tbody>
        </table>
      </div>

      {/* Модал создания/редактирования */}
      {modalOpen && form && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-zinc-950/80 p-4 backdrop-blur-sm" onClick={() => setModalOpen(false)}>
          <div className="card max-h-[90vh] w-full max-w-2xl overflow-y-auto p-0" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between border-b border-zinc-800 px-5 py-4">
              <h3 className="text-sm font-semibold">{editingPlan ? `Редактировать тариф: ${editingPlan.name}` : 'Новый тариф'}</h3>
              <button onClick={() => setModalOpen(false)} className="text-zinc-500 hover:text-zinc-300">✕</button>
            </div>
            <div className="space-y-4 p-5">
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <div>
                  <label className="label">ID</label>
                  <input
                    className="input" value={form.id} disabled={!!editingPlan}
                    placeholder="premium" pattern="[a-z0-9_-]+"
                    onChange={(e) => setForm({ ...form, id: e.target.value })}
                  />
                </div>
                <div>
                  <label className="label">Название</label>
                  <input className="input" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
                </div>
                <div>
                  <label className="label">Цена, ₽</label>
                  <input className="input" type="number" min="0" value={form.price} onChange={(e) => setForm({ ...form, price: e.target.value })} />
                </div>
                <div>
                  <label className="label">Период оплаты</label>
                  <select className="input" value={form.billing_frequency} onChange={(e) => setForm({ ...form, billing_frequency: e.target.value })}>
                    {FREQ_OPTIONS.map((f) => <option key={f} value={f}>{f}</option>)}
                  </select>
                </div>
                <div>
                  <label className="label">Скидка за год, % (0 при периоде yearly)</label>
                  <input className="input" type="number" min="0" max="100" value={form.yearly_discount} onChange={(e) => setForm({ ...form, yearly_discount: e.target.value })} />
                </div>
                <div>
                  <label className="label">Лимит тегов (-1 = ∞)</label>
                  <input className="input" type="number" min="-1" value={form.tag_limit} onChange={(e) => setForm({ ...form, tag_limit: e.target.value })} />
                </div>
                <div>
                  <label className="label">Лимит портфелей (-1 = ∞)</label>
                  <input className="input" type="number" min="-1" value={form.portfolio_limit} onChange={(e) => setForm({ ...form, portfolio_limit: e.target.value })} />
                </div>
                <div>
                  <label className="label">Уровень плана</label>
                  <input className="input" type="number" min="0" value={form.plan_level} onChange={(e) => setForm({ ...form, plan_level: e.target.value })} />
                </div>
                <div>
                  <label className="label">Порядок отображения</label>
                  <input className="input" type="number" min="0" value={form.display_order} onChange={(e) => setForm({ ...form, display_order: e.target.value })} />
                </div>
                <div>
                  <label className="label">Метка «скоро» (пусто — без)</label>
                  <input className="input" placeholder="Скоро" value={form.coming_soon_label} onChange={(e) => setForm({ ...form, coming_soon_label: e.target.value })} />
                </div>
              </div>

              <div className="flex items-center gap-6">
                <label className="flex items-center gap-2 text-sm text-zinc-300">
                  <input
                    type="checkbox" checked={form.is_active}
                    onChange={(e) => setForm({
                      ...form,
                      is_active: e.target.checked,
                      ...(e.target.checked ? { coming_soon_label: '' } : {}),
                    })}
                  />
                  Активен
                </label>
                <label className="flex items-center gap-2 text-sm text-zinc-300">
                  <input type="checkbox" checked={form.is_popular} onChange={(e) => setForm({ ...form, is_popular: e.target.checked })} />
                  Популярный
                </label>
              </div>

              {/* Фичи из реестра (активные + уже выбранные в плане) */}
              <div className="rounded-lg border border-zinc-800 bg-zinc-900/50 p-4">
                <h4 className="label mb-3">Фичи</h4>
                <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                  {checkboxFeatures(editingPlan).map((f) => (
                    <label key={f.id} className="flex items-center gap-2 text-sm text-zinc-300" title={f.description ?? f.id}>
                      <input type="checkbox" checked={!!form.features[f.id]} onChange={(e) => setFeature(f.id, e.target.checked)} />
                      {f.label}
                      {!f.isActive && <span className="text-xs text-zinc-600">(выкл. в реестре)</span>}
                    </label>
                  ))}
                  {checkboxFeatures(editingPlan).length === 0 && (
                    <span className="text-sm text-zinc-500">Реестр фич пуст — добавьте в табе «Фичи»</span>
                  )}
                </div>
              </div>

              {/* Подписчики (при редактировании) */}
              {editingPlan && (
                <div className="rounded-lg border border-zinc-800 bg-zinc-900/50 p-4">
                  <h4 className="label mb-3">
                    Активные подписчики ({subscribersLoading ? '...' : subscribersTotal})
                  </h4>
                  {subscribersLoading ? (
                    <p className="text-xs text-zinc-500">Загрузка подписчиков...</p>
                  ) : subscribers.length === 0 ? (
                    <p className="text-xs text-zinc-500">Нет активных подписчиков</p>
                  ) : (
                    <div className="space-y-1">
                      {(showAllSubscribers ? subscribers : subscribers.slice(0, 5)).map((user) => (
                        <div key={user.id} className="flex items-center gap-3 rounded-lg px-3 py-2 text-left">
                          <span className="flex-1 truncate text-sm font-medium text-zinc-200">
                            {user.display_name || user.email}
                          </span>
                          <span className="hidden max-w-40 truncate text-xs text-zinc-500 sm:inline">{user.email}</span>
                          <span className="flex-shrink-0 rounded-full bg-zinc-800 px-2 py-0.5 text-xs text-zinc-400">
                            до {formatDateShort(user.tariff_expires_at)}
                          </span>
                        </div>
                      ))}
                      {subscribers.length > 5 && (
                        <button
                          onClick={() => setShowAllSubscribers((v) => !v)}
                          className="w-full rounded-lg py-2 text-center text-xs text-sky-400 hover:bg-zinc-800"
                        >
                          {showAllSubscribers ? 'Свернуть' : `Показать все (${subscribersTotal})`}
                        </button>
                      )}
                    </div>
                  )}
                </div>
              )}

              {saveError && <p className="rounded-lg bg-red-500/10 px-3 py-2 text-sm text-red-400">{saveError}</p>}
            </div>
            <div className="flex items-center justify-end gap-3 border-t border-zinc-800 px-5 py-4">
              <button className="btn-secondary" onClick={() => setModalOpen(false)} disabled={saving}>Отмена</button>
              <button className="btn" onClick={() => void handleSave()} disabled={saving}>
                {saving ? 'Сохранение...' : 'Сохранить'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Подтверждение архивации с предпросмотром числа подписчиков */}
      {archiveConfirm && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center bg-zinc-950/80 p-4 backdrop-blur-sm" onClick={() => !archiving && setArchiveConfirm(null)}>
          <div className="card w-full max-w-md p-0" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between border-b border-zinc-800 px-5 py-4">
              <h3 className="text-sm font-semibold">Архивировать тариф «{archiveConfirm.name}»?</h3>
              <button onClick={() => setArchiveConfirm(null)} disabled={archiving} className="text-zinc-500 hover:text-zinc-300">✕</button>
            </div>
            <div className="space-y-3 p-5">
              <p className="text-sm text-zinc-300">
                Тариф будет скрыт из каталога для новых пользователей. Текущие подписчики останутся на нём
                до конца оплаченного периода.
              </p>
              <p className="text-xs text-zinc-500">
                Активных подписчиков, которые останутся на тарифе:{' '}
                <strong className={archiveSubscribers ? 'text-amber-400' : 'text-zinc-200'}>{archiveSubscribers ?? '—'}</strong>
              </p>
            </div>
            <div className="flex items-center justify-end gap-3 border-t border-zinc-800 px-5 py-4">
              <button className="btn-secondary" onClick={() => setArchiveConfirm(null)} disabled={archiving}>Отмена</button>
              <button className="btn" onClick={() => void confirmArchive()} disabled={archiving}>
                {archiving ? 'Архивация...' : 'Архивировать'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
