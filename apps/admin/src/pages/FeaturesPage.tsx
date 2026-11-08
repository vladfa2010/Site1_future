import { useEffect, useState, type FormEvent } from 'react';
import { api } from '../api';

/**
 * Реестр фич — порт FeaturesSubTab PULSE:
 * каталог фич с integration_status (pending/integrated/deprecated),
 * драйвит чекбоксы в редакторе тарифов и подписи в Pricing.
 */
interface FeatureDef {
  id: string;
  label: string;
  description: string | null;
  isActive: boolean;
  integrationStatus: 'pending' | 'integrated' | 'deprecated';
}

const EMPTY = { id: '', label: '', description: '', isActive: true };

export default function FeaturesPage() {
  const [features, setFeatures] = useState<FeatureDef[]>([]);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState<FeatureDef | null>(null);
  const [showCreate, setShowCreate] = useState(false);
  const [form, setForm] = useState(EMPTY);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [notice, setNotice] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [confirmOff, setConfirmOff] = useState<FeatureDef | null>(null);

  const load = async () => {
    setLoading(true);
    try {
      setFeatures((await api<{ features: FeatureDef[] }>('/admin/features')).features);
    } catch {
      setError('Ошибка загрузки');
    } finally {
      setLoading(false);
    }
  };
  useEffect(() => { void load(); }, []);

  const validate = () => {
    const e: Record<string, string> = {};
    if (!editing) {
      if (!form.id.trim()) e.id = 'ID обязателен';
      else if (!/^[a-z0-9_]{1,50}$/.test(form.id)) e.id = 'ID: a-z, 0-9, _ (max 50)';
    }
    if (!form.label.trim()) e.label = 'Название обязательно';
    else if (form.label.length > 100) e.label = 'Максимум 100 символов';
    if (form.description && form.description.length > 255) e.description = 'Максимум 255 символов';
    setErrors(e);
    return Object.keys(e).length === 0;
  };

  const startEdit = (f: FeatureDef) => {
    setEditing(f);
    setShowCreate(false);
    setForm({ id: f.id, label: f.label, description: f.description ?? '', isActive: f.isActive });
    setErrors({});
  };
  const startCreate = () => {
    setEditing(null);
    setShowCreate(true);
    setForm(EMPTY);
    setErrors({});
  };

  const save = async (e: FormEvent) => {
    e.preventDefault();
    if (!validate()) return;
    setError(null);
    try {
      const body = { label: form.label, description: form.description || null, isActive: form.isActive, ...(editing ? {} : { id: form.id }) };
      if (editing) {
        await api(`/admin/features/${editing.id}`, { method: 'PUT', body: JSON.stringify(body) });
        setNotice(`Фича «${form.label}» обновлена ✓`);
      } else {
        await api('/admin/features', { method: 'POST', body: JSON.stringify(body) });
        setNotice(`Фича «${form.label}» создана ✓`);
      }
      setEditing(null);
      setShowCreate(false);
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Ошибка сохранения');
    }
  };

  const toggle = async (f: FeatureDef, next: boolean) => {
    await api(`/admin/features/${f.id}`, { method: 'PUT', body: JSON.stringify({ isActive: next }) });
    setNotice(next ? `Фича «${f.label}» активирована ✓` : `Фича «${f.label}» деактивирована ✓`);
    setConfirmOff(null);
    await load();
  };

  const setStatus = async (f: FeatureDef, status: FeatureDef['integrationStatus']) => {
    await api(`/admin/features/${f.id}`, { method: 'PUT', body: JSON.stringify({ integrationStatus: status }) });
    setFeatures((prev) => prev.map((x) => (x.id === f.id ? { ...x, integrationStatus: status } : x)));
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold">Фичи</h1>
          <p className="text-sm text-zinc-500">
            {features.length} фич · {features.filter((f) => f.isActive).length} активных. Реестр драйвит чекбоксы
            в «Тарифах» и подписи на странице «Тарифы» сайта.
          </p>
        </div>
        <button className="btn" onClick={startCreate}>+ Новая фича</button>
      </div>
      {notice && <p className="rounded-lg bg-green-500/10 px-3 py-2 text-sm text-green-400">{notice}</p>}
      {error && <p className="rounded-lg bg-red-500/10 px-3 py-2 text-sm text-red-400">{error}</p>}

      <div className="card overflow-x-auto p-0">
        <table className="w-full">
          <thead className="border-b border-zinc-800">
            <tr><th className="th">ID</th><th className="th">Название</th><th className="th">Описание</th><th className="th">Active</th><th className="th">Статус</th><th className="th" /></tr>
          </thead>
          <tbody>
            {features.map((f) => (
              <tr key={f.id} className="border-b border-zinc-800 last:border-0" style={{ opacity: f.isActive ? 1 : 0.5 }}>
                <td className="td font-mono text-xs text-zinc-500">{f.id}</td>
                <td className={`td font-medium ${f.isActive ? '' : 'line-through'}`}>{f.label}</td>
                <td className="td max-w-[220px] truncate text-xs text-zinc-500">{f.description ?? '—'}</td>
                <td className="td">
                  <span className={`rounded-full px-2 py-0.5 text-xs ${f.isActive ? 'bg-green-500/10 text-green-400' : 'bg-zinc-800 text-zinc-500'}`}>
                    {f.isActive ? 'Да' : 'Нет'}
                  </span>
                </td>
                <td className="td">
                  <select
                    value={f.integrationStatus}
                    onChange={(e) => void setStatus(f, e.target.value as FeatureDef['integrationStatus'])}
                    className={`rounded border px-2 py-1 text-xs ${
                      f.integrationStatus === 'integrated' ? 'border-green-500/40 bg-green-500/10 text-green-400'
                      : f.integrationStatus === 'pending' ? 'border-amber-500/40 bg-amber-500/10 text-amber-400'
                      : 'border-zinc-700 bg-zinc-800 text-zinc-400'
                    }`}
                    title="Статус интеграции: подключена к коду / в ожидании / устарела"
                  >
                    <option value="pending">В ожидании</option>
                    <option value="integrated">Подключена</option>
                    <option value="deprecated">Устарела</option>
                  </select>
                </td>
                <td className="td">
                  <div className="flex justify-end gap-2">
                    <button onClick={() => startEdit(f)} className="text-blue-400 hover:underline">ред.</button>
                    {f.isActive
                      ? <button onClick={() => setConfirmOff(f)} className="text-red-400 hover:underline">off</button>
                      : <button onClick={() => void toggle(f, true)} className="text-green-400 hover:underline">on</button>}
                  </div>
                </td>
              </tr>
            ))}
            {!loading && features.length === 0 && (
              <tr><td colSpan={6} className="td text-center text-zinc-500">Нет фич</td></tr>
            )}
          </tbody>
        </table>
      </div>

      {(editing || showCreate) && (
        <form onSubmit={save} className="card space-y-4">
          <h2 className="font-semibold">{editing ? `Редактирование: ${editing.label}` : 'Новая фича'}</h2>
          <div className="grid gap-4 sm:grid-cols-3">
            <div>
              <label className="label">ID (a-z, 0-9, _)</label>
              <input className={`input ${errors.id ? 'border-red-500' : ''}`} disabled={!!editing} value={form.id}
                onChange={(e) => setForm({ ...form, id: e.target.value.toLowerCase() })} />
              {errors.id && <p className="mt-1 text-xs text-red-400">{errors.id}</p>}
            </div>
            <div>
              <label className="label">Название *</label>
              <input className={`input ${errors.label ? 'border-red-500' : ''}`} required value={form.label}
                onChange={(e) => setForm({ ...form, label: e.target.value })} />
              {errors.label && <p className="mt-1 text-xs text-red-400">{errors.label}</p>}
            </div>
            <div>
              <label className="label">Описание</label>
              <input className={`input ${errors.description ? 'border-red-500' : ''}`} value={form.description}
                onChange={(e) => setForm({ ...form, description: e.target.value })} />
              {errors.description && <p className="mt-1 text-xs text-red-400">{errors.description}</p>}
            </div>
          </div>
          <label className="flex items-center gap-2 text-sm">
            <input type="checkbox" checked={form.isActive} onChange={(e) => setForm({ ...form, isActive: e.target.checked })} />
            Активна (видна в формах тарифов и Pricing)
          </label>
          {editing && !form.isActive && (
            <p className="rounded-lg border border-red-500/30 bg-red-500/10 p-3 text-xs text-red-400">
              ⚠️ Отключение фичи скроет её из форм тарифов и Pricing. Существующие подписчики не потеряют доступ.
            </p>
          )}
          <div className="flex gap-3">
            <button className="btn" type="submit">Сохранить</button>
            <button type="button" className="btn-secondary" onClick={() => { setEditing(null); setShowCreate(false); }}>Отмена</button>
          </div>
        </form>
      )}

      {confirmOff && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 px-4" onClick={() => setConfirmOff(null)}>
          <div className="w-full max-w-md rounded-xl border border-zinc-800 bg-zinc-900 p-5" onClick={(e) => e.stopPropagation()}>
            <h3 className="font-semibold">Деактивировать фичу «{confirmOff.label}»?</h3>
            <p className="mt-2 text-sm text-zinc-400">
              Фича будет скрыта из форм тарифов и Pricing. Существующие подписчики не потеряют доступ.
            </p>
            <div className="mt-4 flex justify-end gap-3">
              <button className="btn-secondary" onClick={() => setConfirmOff(null)}>Отмена</button>
              <button className="rounded-lg bg-red-500 px-4 py-2 text-sm font-semibold text-white" onClick={() => void toggle(confirmOff, false)}>Деактивировать</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
