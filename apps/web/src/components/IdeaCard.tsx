import { Link } from 'react-router';
import type { Idea } from '../api';

/**
 * Карточка идеи с бейджами фаз/стадий/индустрий.
 * Бейджи — только если есть (принцип 4.3).
 */
export function IdeaCard({ idea }: { idea: Idea }) {
  return (
    <Link
      to={`/ideya/${idea.slug}`}
      className="flex flex-col rounded-lg border border-zinc-800 bg-zinc-900 p-4 transition-colors hover:border-orange-500/50"
    >
      <h3 className="font-semibold leading-snug">{idea.title}</h3>
      {idea.thesis && <p className="mt-2 line-clamp-3 text-sm text-zinc-400">{idea.thesis}</p>}
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
  );
}
