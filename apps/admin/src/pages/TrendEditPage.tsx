import { useEffect, useState } from 'react';
import { useParams } from 'react-router';
import { api } from '../api';
import { RichTextEditor } from '../components/RichTextEditor';

export default function TrendEditPage() {
  const { id } = useParams();
  const [form, setForm] = useState({ slug: '', name: '', description: '', status: 'active' });
  const [notice, setNotice] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    void (async () => {
      // публичный список: найдём по id
      const { trends } = await api<{ trends: { id: number; slug: string; name: string; description: string | null; status: string }[] }>('/trends');
      const t = trends.find((x) => x.id === Number(id));
      if (t) setForm({ slug: t.slug, name: t.name, description: t.description ?? '', status: t.status });
    })().catch(() => setError('Ошибка загрузки'));
  }, [id]);

  const save = async () => {
    setError(null);
    setNotice(null);
    try {
      await api(`/trends/${id}`, { method: 'PATCH', body: JSON.stringify(form) });
      setNotice('Сохранено ✓');
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Ошибка сохранения');
    }
  };

  return (
    <div className="space-y-4">
      <h1 className="text-xl font-bold">Тренд</h1>
      {notice && <p className="rounded-lg bg-green-50 px-3 py-2 text-sm text-green-700">{notice}</p>}
      {error && <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>}

      <div className="card grid gap-4 sm:grid-cols-3">
        <div>
          <label className="label">Название</label>
          <input className="input" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
        </div>
        <div>
          <label className="label">Slug</label>
          <input className="input" value={form.slug} onChange={(e) => setForm({ ...form, slug: e.target.value })} />
        </div>
        <div>
          <label className="label">Статус</label>
          <select className="input" value={form.status} onChange={(e) => setForm({ ...form, status: e.target.value })}>
            <option value="active">Активен</option>
            <option value="closed">Закрыт</option>
          </select>
        </div>
      </div>

      <div className="card">
        <label className="label">Лонгрид лендинга (визуальный редактор; HTML из миграции тоже сюда)</label>
        <RichTextEditor value={form.description} onChange={(html) => setForm({ ...form, description: html })} />
      </div>

      <button className="btn" onClick={() => void save()}>Сохранить</button>
    </div>
  );
}
