import { useEffect, useState } from 'react';
import { useParams } from 'react-router';
import { api } from '../api';
import { RichTextEditor } from '../components/RichTextEditor';
import { stripHtml } from '@newinvest/db/text-utils';

interface Industry { id: number; name: string }

export default function CompanyEditPage() {
  const { slug } = useParams();
  const [form, setForm] = useState({ name: '', oneLiner: '', description: '', website: '', country: '', foundedYear: '', isPublic: false });
  const [companyId, setCompanyId] = useState<number | null>(null);
  const [industries, setIndustries] = useState<Industry[]>([]);
  const [selectedIndustries, setSelectedIndustries] = useState<number[]>([]);
  const [notice, setNotice] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    void (async () => {
      const [detail, inds] = await Promise.all([
        api<{ company: { id: number; name: string; oneLiner: string | null; description: string | null; website: string | null; country: string | null; foundedYear: number | null; isPublic: boolean }; industries: Industry[] }>(`/companies/${slug}`),
        api<{ industries: Industry[] }>('/industries'),
      ]);
      const c = detail.company;
      setForm({
        name: c.name, oneLiner: c.oneLiner ?? '', description: c.description ?? '', website: c.website ?? '',
        country: c.country ?? '', foundedYear: c.foundedYear ? String(c.foundedYear) : '', isPublic: c.isPublic,
      });
      setCompanyId(c.id);
      setIndustries(inds.industries);
      setSelectedIndustries(detail.industries.map((i) => i.id));
    })().catch(() => setError('Ошибка загрузки'));
  }, [slug]);

  const save = async () => {
    if (!companyId) return;
    setError(null);
    setNotice(null);
    try {
      await api(`/companies/${companyId}`, {
        method: 'PATCH',
        body: JSON.stringify({
          ...form,
          foundedYear: form.foundedYear ? Number(form.foundedYear) : undefined,
          website: form.website || undefined,
          industryIds: selectedIndustries,
        }),
      });
      setNotice('Сохранено ✓');
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Ошибка сохранения');
    }
  };

  const toggleIndustry = (id: number) =>
    setSelectedIndustries((s) => (s.includes(id) ? s.filter((x) => x !== id) : [...s, id]));

  /** ✨ One-liner: строка для карточки портфеля из описания компании. */
  const [oneLinerBusy, setOneLinerBusy] = useState(false);
  const genOneLiner = async () => {
    setError(null); setNotice(null);
    const plain = stripHtml(form.description);
    if (plain.length < 50) {
      setError('Сначала заполните описание компании — генерация читает его');
      return;
    }
    setOneLinerBusy(true);
    try {
      const prompt = [
        'Напиши one-liner — короткую строку-питч для карточки компании в портфеле инвестиционного медиа.',
        `НАЗВАНИЕ КОМПАНИИ: ${form.name}`,
        form.oneLiner ? `ТЕКУЩИЙ ONE-LINER (можно улучшить, не копировать): ${form.oneLiner}` : '',
        'ТРЕБОВАНИЯ: до 120 знаков, одно предложение: чем компания занимается и чем примечательна, конкретика вместо общих слов, без кликбейта, на русском.',
        `ТЕКСТ ОПИСАНИЯ: ${plain.slice(0, 3000)}`,
      ].filter(Boolean).join('\n');
      const res = await api<{ text: string; mock: boolean }>('/media/generate-text', {
        method: 'POST',
        body: JSON.stringify({ prompt, maxChars: 150 }),
      });
      setForm((f) => ({ ...f, oneLiner: res.text.trim() }));
      if (res.mock) setNotice('One-liner собран из текста (mock — без ключа LLM)');
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Ошибка генерации');
    } finally {
      setOneLinerBusy(false);
    }
  };

  return (
    <div className="space-y-4">
      <h1 className="text-xl font-bold">Карточка компании</h1>
      {notice && <p className="rounded-lg bg-green-50 px-3 py-2 text-sm text-green-400">{notice}</p>}
      {error && <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-400">{error}</p>}

      <div className="card grid gap-4 sm:grid-cols-2">
        <div>
          <label className="label">Название</label>
          <input className="input" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
        </div>
        <div>
          <label className="label">One-liner (строка для карточки портфеля)</label>
          <input className="input" value={form.oneLiner} onChange={(e) => setForm({ ...form, oneLiner: e.target.value })} />
          <button type="button" className="btn-secondary mt-1 py-1 text-xs" disabled={oneLinerBusy} onClick={() => void genOneLiner()}>
            {oneLinerBusy ? 'Генерируем…' : '✨ One-liner из описания'}
          </button>
        </div>
        <div>
          <label className="label">Сайт</label>
          <input className="input" value={form.website} onChange={(e) => setForm({ ...form, website: e.target.value })} />
        </div>
        <div>
          <label className="label">Страна</label>
          <input className="input" value={form.country} onChange={(e) => setForm({ ...form, country: e.target.value })} />
        </div>
        <div>
          <label className="label">Год основания</label>
          <input className="input" type="number" value={form.foundedYear} onChange={(e) => setForm({ ...form, foundedYear: e.target.value })} />
        </div>
        <label className="flex items-end gap-2 pb-2 text-sm">
          <input type="checkbox" checked={form.isPublic} onChange={(e) => setForm({ ...form, isPublic: e.target.checked })} />
          Публичная (торгуется на бирже)
        </label>
      </div>

      <div className="card">
        <label className="label">Описание (визуальный редактор; HTML от миграции откроется как есть)</label>
        <RichTextEditor value={form.description} onChange={(html) => setForm({ ...form, description: html })} />
      </div>

      <div className="card">
        <span className="label">Индустрии</span>
        <div className="flex flex-wrap gap-2">
          {industries.map((i) => (
            <button
              key={i.id}
              type="button"
              onClick={() => toggleIndustry(i.id)}
              className={`rounded-full px-3 py-1 text-xs ${selectedIndustries.includes(i.id) ? 'bg-orange-500/10 text-orange-400' : 'bg-zinc-800 text-zinc-400'}`}
            >
              {i.name}
            </button>
          ))}
        </div>
      </div>

      <button className="btn" onClick={() => void save()}>Сохранить</button>
    </div>
  );
}
