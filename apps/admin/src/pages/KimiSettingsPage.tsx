import { useEffect, useState } from 'react';
import { api } from '../api';

interface Settings {
  provider: 'kimi' | 'deepseek';
  apiKeyMasked: string;
  hasKey: boolean;
  baseUrl: string;
  textModel: string;
  imageModel: string;
  embedModel: string;
  deepseekApiKeyMasked: string;
  hasDeepseekKey: boolean;
  deepseekModel: string;
  deepseekBaseUrl: string;
}

/** Подсказки по моделям Kimi (Kimi Platform, 11.2026) — финальный список тянется live из /models */
const TEXT_HINTS = ['kimi-k3', 'kimi-k3.1-pro', 'kimi-k3.1-pro-highspeed', 'kimi-k2.6', 'kimi-k2.7-code', 'kimi-k2.7-code-highspeed'];
const IMAGE_HINTS = ['kimi-image-preview', 'moonshot-v1-image'];
const EMBED_HINTS = ['moonshot-v1-embedding', 'kimi-embedding'];
/** DeepSeek: /models аккаунта + документированные алиасы (deepseek-chat / deepseek-reasoner) */
const DEEPSEEK_HINTS = ['deepseek-chat', 'deepseek-reasoner'];

export default function KimiSettingsPage() {
  const [settings, setSettings] = useState<Settings | null>(null);
  const [modelsKimi, setModelsKimi] = useState<string[]>([]);
  const [modelsDeepseek, setModelsDeepseek] = useState<string[]>([]);
  const [modelsError, setModelsError] = useState<string | null>(null);
  const [modelsDeepseekError, setModelsDeepseekError] = useState<string | null>(null);
  const [provider, setProvider] = useState<'kimi' | 'deepseek'>('kimi');
  const [apiKey, setApiKey] = useState('');                 // Kimi, пусто = не менять
  const [deepseekApiKey, setDeepseekApiKey] = useState(''); // пусто = не менять
  const [baseUrl, setBaseUrl] = useState('');
  const [textModel, setTextModel] = useState('');
  const [imageModel, setImageModel] = useState('');
  const [embedModel, setEmbedModel] = useState('');
  const [deepseekModel, setDeepseekModel] = useState('');
  const [showKey, setShowKey] = useState(false);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = async () => {
    const d = await api<{ settings: Settings; modelsKimi: string[]; modelsDeepseek: string[]; modelsError: string | null; modelsDeepseekError: string | null }>('/admin/kimi-settings');
    setSettings(d.settings);
    setModelsKimi(d.modelsKimi);
    setModelsDeepseek(d.modelsDeepseek);
    setModelsError(d.modelsError);
    setModelsDeepseekError(d.modelsDeepseekError);
    setProvider(d.settings.provider);
    setBaseUrl(d.settings.baseUrl);
    setTextModel(d.settings.textModel);
    setImageModel(d.settings.imageModel);
    setEmbedModel(d.settings.embedModel);
    setDeepseekModel(d.settings.deepseekModel);
  };
  useEffect(() => { void load().catch((e) => setError(e instanceof Error ? e.message : 'Ошибка загрузки')); }, []);

  const save = async () => {
    setBusy(true);
    setError(null);
    setNotice(null);
    try {
      // пустые строкы не шлём — сервер валидирует URL/модели и может дать 400
      const body: Record<string, string> = { provider, textModel, imageModel, embedModel, deepseekModel };
      if (baseUrl.trim()) body.baseUrl = baseUrl.trim();
      if (apiKey.trim()) body.apiKey = apiKey.trim();
      if (deepseekApiKey.trim()) body.deepseekApiKey = deepseekApiKey.trim();
      await api('/admin/kimi-settings', { method: 'POST', body: JSON.stringify(body) });
      setApiKey('');
      setDeepseekApiKey('');
      setNotice('Сохранено ✓ Ключи, провайдер и модели применяются мгновенно, без перезапуска.');
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Ошибка сохранения');
    } finally {
      setBusy(false);
    }
  };

  const removeKey = async (field: 'apiKey' | 'deepseekApiKey') => {
    setBusy(true);
    setError(null);
    try {
      await api('/admin/kimi-settings', { method: 'POST', body: JSON.stringify({ [field]: '' }) });
      setNotice(field === 'apiKey' ? 'Ключ Kimi удалён.' : 'Ключ DeepSeek удалён.');
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Ошибка');
    } finally {
      setBusy(false);
    }
  };

  // live-списки моделей + статичные подсказки (на случай пустого ответа/отсутствия ключа)
  const kimiTextOptions = [...new Set([...modelsKimi.filter((m) => !/image|embed/i.test(m)), ...TEXT_HINTS])];
  const imageOptions = [...new Set([...modelsKimi.filter((m) => /image/i.test(m)), ...IMAGE_HINTS])];
  const embedOptions = [...new Set([...modelsKimi.filter((m) => /embed/i.test(m)), ...EMBED_HINTS])];
  const deepseekOptions = [...new Set([...modelsDeepseek, ...DEEPSEEK_HINTS])];

  if (!settings) return <p className="text-zinc-400">Загрузка…</p>;

  return (
    <div className="max-w-2xl space-y-6">
      <h1 className="text-xl font-bold">Настройки генерации (LLM)</h1>
      <p className="text-sm text-zinc-500">
        Тексты (лиды, SEO-выжимки, черновики) генерирует выбранный провайдер — Kimi/Moonshot или DeepSeek.
        Обложки и эмбеддинги пока генерирует только Kimi (у DeepSeek нет image API). Ключи хранятся в базе и применяются мгновенно.
      </p>

      {notice && <p className="rounded-lg bg-green-500/10 px-3 py-2 text-sm text-green-400">{notice}</p>}
      {error && <p className="rounded-lg bg-red-500/10 px-3 py-2 text-sm text-red-400">{error}</p>}

      {/* Провайдер текстов */}
      <div className="card space-y-3">
        <h2 className="font-semibold">Провайдер текстов</h2>
        <div className="flex gap-4">
          {(['kimi', 'deepseek'] as const).map((p) => (
            <label key={p} className={`flex flex-1 cursor-pointer items-center gap-2 rounded-lg border px-4 py-3 text-sm ${provider === p ? 'border-[#beff00]/50 bg-[#beff00]/5' : 'border-zinc-700'}`}>
              <input type="radio" name="provider" checked={provider === p} onChange={() => setProvider(p)} />
              <span className="font-medium">{p === 'kimi' ? 'Kimi (Moonshot)' : 'DeepSeek'}</span>
            </label>
          ))}
        </div>
        <p className="text-sm">
          Активен: <span className="text-[#beff00]">{provider === 'kimi' ? 'Kimi' : 'DeepSeek'}</span>
          {provider === 'kimi'
            ? !settings.hasKey && <span className="text-zinc-500"> — ключ не задан, тексты в mock-режиме</span>
            : !settings.hasDeepseekKey && <span className="text-zinc-500"> — ключ не задан, тексты в mock-режиме</span>}
        </p>
      </div>

      {/* Блок активного провайдера */}
      {provider === 'kimi' ? (
        <div className="card space-y-4">
          <h2 className="font-semibold">Kimi (Moonshot)</h2>
          <KeyField
            label="API-ключ Kimi"
            value={apiKey}
            onChange={setApiKey}
            hasKey={settings.hasKey}
            masked={settings.apiKeyMasked}
            show={showKey}
            onToggleShow={() => setShowKey(!showKey)}
            onRemove={() => void removeKey('apiKey')}
            busy={busy}
          />
          <div>
            <label className="label">Base URL</label>
            <input className="input w-full font-mono" value={baseUrl} onChange={(e) => setBaseUrl(e.target.value)} />
            <p className="mt-1 text-xs text-zinc-600">OpenAI-совместимый, оканчивается на /v1. По умолчанию https://api.moonshot.ai/v1</p>
          </div>
          <ModelSelect label="Модель для текстов (лиды, SEO, черновики)" value={textModel} onChange={setTextModel} options={kimiTextOptions} />
          <ModelSelect label="Модель для генерации обложек" value={imageModel} onChange={setImageModel} options={imageOptions} />
          <ModelSelect
            label="Модель эмбеддингов (векторный поиск)"
            value={embedModel}
            onChange={setEmbedModel}
            options={embedOptions}
            hint="Должна возвращать 1024-мерные вектора (под колонку vector(1024)). Без неё поиск работает в текстовом режиме."
          />
          <StatusLine label="Модели Kimi аккаунта" models={modelsKimi} error={modelsError} />
        </div>
      ) : (
        <div className="card space-y-4">
          <h2 className="font-semibold">DeepSeek</h2>
          <KeyField
            label="API-ключ DeepSeek"
            value={deepseekApiKey}
            onChange={setDeepseekApiKey}
            hasKey={settings.hasDeepseekKey}
            masked={settings.deepseekApiKeyMasked}
            show={showKey}
            onToggleShow={() => setShowKey(!showKey)}
            onRemove={() => void removeKey('deepseekApiKey')}
            busy={busy}
          />
          <div>
            <label className="label">Base URL</label>
            <input className="input w-full font-mono opacity-60" value={settings.deepseekBaseUrl} readOnly />
            <p className="mt-1 text-xs text-zinc-600">Фиксирован — OpenAI-совместимый API DeepSeek, подмена хоста запрещена (защита ключа)</p>
          </div>
          <ModelSelect
            label="Модель DeepSeek"
            value={deepseekModel}
            onChange={setDeepseekModel}
            options={deepseekOptions}
            hint="deepseek-chat — быстрый универсальный; deepseek-reasoner — рассуждающий (ответ в content, цепочка мысли отбрасывается)."
          />
          <StatusLine label="Модели DeepSeek аккаунта" models={modelsDeepseek} error={modelsDeepseekError} />
        </div>
      )}

      <div className="flex gap-3">
        <button className="btn" onClick={() => void save()} disabled={busy}>
          {busy ? 'Сохранение…' : 'Сохранить'}
        </button>
      </div>
    </div>
  );
}

function KeyField({ label, value, onChange, hasKey, masked, show, onToggleShow, onRemove, busy }: {
  label: string; value: string; onChange: (v: string) => void; hasKey: boolean; masked: string;
  show: boolean; onToggleShow: () => void; onRemove: () => void; busy: boolean;
}) {
  return (
    <div>
      <label className="label">{label}</label>
      <div className="relative">
        <input
          className="input w-full pr-20 font-mono"
          type={show ? 'text' : 'password'}
          placeholder={hasKey ? `текущий: ${masked} (введите новый, чтобы заменить)` : 'sk-…'}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          autoComplete="off"
        />
        <button
          type="button"
          onClick={onToggleShow}
          className="absolute right-2 top-1/2 -translate-y-1/2 rounded px-2 py-0.5 text-xs text-zinc-500 hover:text-zinc-300"
        >
          {show ? 'скрыть' : 'показать'}
        </button>
      </div>
      {hasKey && (
        <button type="button" onClick={onRemove} disabled={busy} className="mt-1 text-xs text-red-400 hover:text-red-300">
          Удалить ключ
        </button>
      )}
    </div>
  );
}

function StatusLine({ label, models, error }: { label: string; models: string[]; error: string | null }) {
  return (
    <div className="text-sm">
      <span className="text-zinc-500">{label}: </span>
      {error
        ? <span className="text-amber-400">не получены ({error})</span>
        : <span className="text-zinc-300">{models.length > 0 ? `${models.length} шт.` : 'список пуст'}</span>}
      {models.length > 0 && <p className="mt-1 break-all text-xs text-zinc-600">{models.join(', ')}</p>}
    </div>
  );
}

function ModelSelect({ label, value, onChange, options, hint }: { label: string; value: string; onChange: (v: string) => void; options: string[]; hint?: string }) {
  return (
    <div>
      <label className="label">{label}</label>
      <input
        className="input w-full font-mono"
        list={`dl-${label}`}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder="выберите из списка или введите вручную"
      />
      <datalist id={`dl-${label}`}>
        {options.map((m) => <option key={m} value={m} />)}
      </datalist>
      {hint && <p className="mt-1 text-xs text-zinc-600">{hint}</p>}
    </div>
  );
}
