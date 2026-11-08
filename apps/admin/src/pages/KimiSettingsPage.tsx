import { useEffect, useState } from 'react';
import { api } from '../api';

interface Settings {
  apiKeyMasked: string;
  hasKey: boolean;
  baseUrl: string;
  textModel: string;
  imageModel: string;
  embedModel: string;
}

/** Подсказки по актуальным моделям (на основе доков Kimi Platform, 11.2026).
 *  Финальный список всё равно тянется live из /models аккаунта. */
const TEXT_HINTS = ['kimi-k3', 'kimi-k3.1-pro', 'kimi-k3.1-pro-highspeed', 'kimi-k2.6', 'kimi-k2.7-code', 'kimi-k2.7-code-highspeed'];
const IMAGE_HINTS = ['kimi-image-preview', 'moonshot-v1-image'];
const EMBED_HINTS = ['moonshot-v1-embedding', 'kimi-embedding'];

export default function KimiSettingsPage() {
  const [settings, setSettings] = useState<Settings | null>(null);
  const [models, setModels] = useState<string[]>([]);
  const [modelsError, setModelsError] = useState<string | null>(null);
  const [apiKey, setApiKey] = useState('');        // пусто = не менять
  const [baseUrl, setBaseUrl] = useState('');
  const [textModel, setTextModel] = useState('');
  const [imageModel, setImageModel] = useState('');
  const [embedModel, setEmbedModel] = useState('');
  const [showKey, setShowKey] = useState(false);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = async () => {
    const d = await api<{ settings: Settings; models: string[]; modelsError: string | null }>('/admin/kimi-settings');
    setSettings(d.settings);
    setModels(d.models);
    setModelsError(d.modelsError);
    setBaseUrl(d.settings.baseUrl);
    setTextModel(d.settings.textModel);
    setImageModel(d.settings.imageModel);
    setEmbedModel(d.settings.embedModel);
  };
  useEffect(() => { void load().catch((e) => setError(e instanceof Error ? e.message : 'Ошибка загрузки')); }, []);

  const save = async () => {
    setBusy(true);
    setError(null);
    setNotice(null);
    try {
      // пустой baseUrl не шлём — сервер валидирует его как URL с allowlist и даст 400
      const body: Record<string, string> = { textModel, imageModel, embedModel };
      if (baseUrl.trim()) body.baseUrl = baseUrl.trim();
      if (apiKey.trim()) body.apiKey = apiKey.trim();
      await api('/admin/kimi-settings', { method: 'POST', body: JSON.stringify(body) });
      setApiKey('');
      setNotice('Сохранено ✓ Ключ и модели применяются мгновенно, без перезапуска.');
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Ошибка сохранения');
    } finally {
      setBusy(false);
    }
  };

  const removeKey = async () => {
    setBusy(true);
    setError(null);
    try {
      await api('/admin/kimi-settings', { method: 'POST', body: JSON.stringify({ apiKey: '' }) });
      setNotice('Ключ удалён — генерация перешла в mock-режим.');
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Ошибка');
    } finally {
      setBusy(false);
    }
  };

  // live-список моделей из аккаунта + статичные подсказки (на случай пустого ответа)
  const textOptions = [...new Set([...models.filter((m) => !/image|embed/i.test(m)), ...TEXT_HINTS])];
  const imageOptions = [...new Set([...models.filter((m) => /image/i.test(m)), ...IMAGE_HINTS])];
  const embedOptions = [...new Set([...models.filter((m) => /embed/i.test(m)), ...EMBED_HINTS])];

  if (!settings) return <p className="text-zinc-400">Загрузка…</p>;

  return (
    <div className="max-w-2xl space-y-6">
      <h1 className="text-xl font-bold">Настройки Kimi API</h1>
      <p className="text-sm text-zinc-500">
        Ключ и модели хранятся в базе и применяются мгновенно — все генераторы (обложки, лиды, SEO, эмбеддинги) используют эти настройки. Env-переменные MOONSHOT_* работают как fallback.
      </p>

      {notice && <p className="rounded-lg bg-green-500/10 px-3 py-2 text-sm text-green-400">{notice}</p>}
      {error && <p className="rounded-lg bg-red-500/10 px-3 py-2 text-sm text-red-400">{error}</p>}

      {/* Статус соединения */}
      <div className="card space-y-1">
        <h2 className="font-semibold">Статус</h2>
        <p className="text-sm">
          Ключ:{' '}
          {settings.hasKey
            ? <span className="text-[#beff00]">задан ({settings.apiKeyMasked})</span>
            : <span className="text-zinc-500">не задан — генерация работает в mock-режиме</span>}
        </p>
        <p className="text-sm">
          Модели аккаунта:{' '}
          {modelsError
            ? <span className="text-amber-400">не получены ({modelsError})</span>
            : <span className="text-zinc-300">{models.length > 0 ? `${models.length} шт.` : 'список пуст'}</span>}
        </p>
        {models.length > 0 && (
          <p className="text-xs break-all text-zinc-600">{models.join(', ')}</p>
        )}
      </div>

      {/* Форма */}
      <div className="card space-y-4">
        <div>
          <label className="label">API-ключ</label>
          <div className="relative">
            <input
              className="input w-full pr-20 font-mono"
              type={showKey ? 'text' : 'password'}
              placeholder={settings.hasKey ? `текущий: ${settings.apiKeyMasked} (введите новый, чтобы заменить)` : 'sk-…'}
              value={apiKey}
              onChange={(e) => setApiKey(e.target.value)}
              autoComplete="off"
            />
            <button
              type="button"
              onClick={() => setShowKey(!showKey)}
              className="absolute right-2 top-1/2 -translate-y-1/2 rounded px-2 py-0.5 text-xs text-zinc-500 hover:text-zinc-300"
            >
              {showKey ? 'скрыть' : 'показать'}
            </button>
          </div>
          {settings.hasKey && (
            <button type="button" onClick={() => void removeKey()} disabled={busy} className="mt-1 text-xs text-red-400 hover:text-red-300">
              Удалить ключ
            </button>
          )}
        </div>

        <div>
          <label className="label">Base URL</label>
          <input className="input w-full font-mono" value={baseUrl} onChange={(e) => setBaseUrl(e.target.value)} />
          <p className="mt-1 text-xs text-zinc-600">OpenAI-совместимый, оканчивается на /v1. По умолчанию https://api.moonshot.ai/v1</p>
        </div>

        <ModelSelect label="Модель для текстов (лиды, SEO, черновики)" value={textModel} onChange={setTextModel} options={textOptions} />
        <ModelSelect label="Модель для генерации обложек" value={imageModel} onChange={setImageModel} options={imageOptions} />
        <ModelSelect
          label="Модель эмбеддингов (векторный поиск)"
          value={embedModel}
          onChange={setEmbedModel}
          options={embedOptions}
          hint="Должна возвращать 1024-мерные вектора (под колонку vector(1024)). Без неё поиск работает в текстовом режиме."
        />

        <div className="flex gap-3">
          <button className="btn" onClick={() => void save()} disabled={busy || !baseUrl.trim()}>
            {busy ? 'Сохранение…' : 'Сохранить'}
          </button>
        </div>
      </div>
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
