import { useSearchParams, Link } from 'react-router';
import { useQuery } from '@tanstack/react-query';
import { Breadcrumbs } from '../components/Breadcrumbs';

interface Idea {
  id: number;
  slug: string;
  title: string;
  excerpt: string | null;
  thesis: string | null;
  phases: string[];
  stages: string[];
  industries: string[];
}

const dict = async (path: string) => (await fetch(`/api${path}`)).json();
const PHASE_LABELS: Record<string, string> = { pipeline: 'Пайплайн', portfel: 'Портфель', arhiv: 'Архив' };

function FilterSelect({
  label,
  value,
  options,
  onChange,
  labels,
}: {
  label: string;
  value: string;
  options: { slug: string; name: string }[];
  onChange: (v: string) => void;
  labels?: Record<string, string>;
}) {
  return (
    <label className="flex flex-col gap-1 text-sm">
      <span className="text-zinc-500">{label}</span>
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="rounded-lg border border-zinc-700 bg-zinc-900 px-3 py-2 text-zinc-200"
      >
        <option value="">Все</option>
        {options.map((o) => (
          <option key={o.slug} value={o.slug}>
            {labels?.[o.slug] ?? o.name}
          </option>
        ))}
      </select>
    </label>
  );
}

export default function PipelinePage() {
  const [params, setParams] = useSearchParams();
  const phase = params.get('phase') ?? '';
  const stage = params.get('stage') ?? '';
  const industry = params.get('industry') ?? '';

  const setFilter = (key: string) => (v: string) => {
    const next = new URLSearchParams(params);
    if (v) next.set(key, v);
    else next.delete(key);
    setParams(next);
  };

  const { data: phases } = useQuery({ queryKey: ['deal-phases'], queryFn: () => dict('/deal-phases') });
  const { data: stages } = useQuery({ queryKey: ['deal-stages'], queryFn: () => dict('/deal-stages') });
  const { data: industries } = useQuery({ queryKey: ['industries'], queryFn: () => dict('/industries') });

  const qs = new URLSearchParams();
  if (phase) qs.set('phase', phase);
  if (stage) qs.set('stage', stage);
  if (industry) qs.set('industry', industry);
  const { data, isLoading } = useQuery({
    queryKey: ['screener', phase, stage, industry],
    queryFn: async () => (await fetch(`/api/screener?${qs}`)).json() as Promise<{ ideas: Idea[] }>,
  });

  return (
    <div className="space-y-8">
      <Breadcrumbs items={[{ label: 'Скринер проектов' }, ...(phase ? [{ label: PHASE_LABELS[phase] ?? phase }] : [])]} />
      <h1 className="text-2xl font-bold">Скринер проектов</h1>

      {/* Фильтры: фаза/стадия/индустрия — состояние в URL */}
      <div className="grid gap-4 rounded-lg border border-zinc-800 bg-zinc-900/50 p-4 sm:grid-cols-3">
        <FilterSelect label="Этап сделки" value={phase} options={phases?.phases ?? []} onChange={setFilter('phase')} labels={PHASE_LABELS} />
        <FilterSelect label="Стадия" value={stage} options={stages?.stages ?? []} onChange={setFilter('stage')} />
        <FilterSelect label="Индустрия" value={industry} options={industries?.industries ?? []} onChange={setFilter('industry')} />
      </div>

      {isLoading && <p className="text-zinc-400">Загрузка…</p>}
      {data && data.ideas.length === 0 && <p className="text-zinc-500">По выбранным фильтрам проектов нет.</p>}

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {data?.ideas.map((idea) => (
          <Link
            key={idea.id}
            to={`/ideya/${idea.slug}`}
            className="flex flex-col rounded-lg border border-zinc-800 bg-zinc-900 p-4 transition-colors hover:border-orange-500/50"
          >
            <h3 className="font-semibold leading-snug">{idea.title}</h3>
            {idea.thesis && <p className="mt-2 line-clamp-3 text-sm text-zinc-400">{idea.thesis}</p>}

            {/* бейджи — только если есть (принцип 4.3) */}
            {(idea.stages.length > 0 || idea.industries.length > 0 || idea.phases.length > 0) && (
              <div className="mt-3 flex flex-wrap gap-1.5 text-xs">
                {idea.phases.map((p) => (
                  <span key={p} className="rounded-full bg-orange-500/15 px-2 py-0.5 text-orange-400">{p}</span>
                ))}
                {idea.stages.map((s) => (
                  <span key={s} className="rounded-full bg-zinc-800 px-2 py-0.5 text-zinc-300">{s}</span>
                ))}
                {idea.industries.map((i) => (
                  <span key={i} className="rounded-full bg-zinc-800 px-2 py-0.5 text-zinc-500">{i}</span>
                ))}
              </div>
            )}
          </Link>
        ))}
      </div>
    </div>
  );
}
