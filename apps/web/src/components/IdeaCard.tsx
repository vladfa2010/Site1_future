import { Link } from 'react-router';
import type { Idea } from '../api';
import { CoverThumb } from './CoverThumb';

/**
 * Карточка идеи с вертикальной обложкой (как у донора) + бейджи
 * фаз/стадий/индустрий. Бейджи — только если есть (принцип 4.3).
 */
export function IdeaCard({ idea }: { idea: Idea }) {
  const badge = idea.phases[0] ?? idea.stages[0] ?? idea.industries[0] ?? 'Идея';
  return (
    <Link to={`/ideya/${idea.slug}`} className="group block h-full">
      <div className="relative">
        <CoverThumb title={idea.title} coverUrl={idea.coverUrl} />
        {/* бейдж поверх обложки */}
        <span className="absolute top-3 left-3 rounded-full bg-black/80 px-2.5 py-1 text-xs text-[#c9ff2a] backdrop-blur">
          {badge}
        </span>
      </div>
      {(idea.thesis || idea.stages.length > 1 || idea.industries.length > 0) && (
        <div className="mt-2 flex flex-wrap items-start gap-1.5 text-xs">
          {idea.thesis && <p className="line-clamp-2 w-full text-sm text-zinc-400 group-hover:text-zinc-300">{idea.thesis}</p>}
          {idea.stages.slice(0, 2).map((s) => (
            <span key={s} className="rounded-full bg-zinc-800 px-2 py-0.5 text-zinc-300">{s}</span>
          ))}
          {idea.industries.slice(0, 2).map((i) => (
            <span key={i} className="rounded-full bg-zinc-800 px-2 py-0.5 text-zinc-500">{i}</span>
          ))}
        </div>
      )}
    </Link>
  );
}
