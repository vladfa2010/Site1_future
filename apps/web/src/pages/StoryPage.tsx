import { useState } from 'react';
import { useParams } from 'react-router';
import { useQuery } from '@tanstack/react-query';
import { api } from '../api';
import { Breadcrumbs, type Crumb } from '../components/Breadcrumbs';
import { JsonLdBreadcrumbs } from '../components/JsonLdBreadcrumbs';
import { FavoriteButton } from '../components/FavoriteButton';
import StoryPlaylist from '../components/StoryPlaylist';

export default function StoryPage() {
  const { slug = '' } = useParams();
  const { data, isLoading, error } = useQuery({
    queryKey: ['story', slug],
    queryFn: () => api.story(slug),
  });
  // ТЗ-08 R4/риски: хронология в плейлист-режиме рендерится свёрнутой в аккордеон
  const [showChronology, setShowChronology] = useState(false);

  if (isLoading) return <p className="text-zinc-400">Загрузка…</p>;
  if (error || !data) return <p className="text-red-400">Сюжет не найден</p>;

  const { story, articles } = data;

  // ТЗ-08 R1: плейлист-режим — строгое правило, все опубликованные материалы type=video
  const isPlaylist = articles.length > 0 && articles.every((a) => a.type === 'video');

  // ТЗ-01: один массив крошек — визуал + JSON-LD («Сюжеты» без to: индексной страницы нет, §4.6)
  const crumbs: Crumb[] = [{ label: 'Сюжеты' }, { label: story.name }];

  return (
    <div className="space-y-10">
      <Breadcrumbs items={crumbs} />
      <JsonLdBreadcrumbs items={crumbs} />
      <header>
        <span className="text-xs uppercase tracking-wide text-zinc-500">Сюжет</span>
        <div className="flex items-start justify-between gap-4">
          <h1 className="mt-1 text-3xl font-bold">{story.name}</h1>
          <FavoriteButton entityType="story" entityId={story.id} className="static" />
        </div>
        {story.description && <p className="mt-4 text-zinc-300">{story.description}</p>}
        {/* ТЗ-08 риски: в плейлист-режиме — якорь на полную хронологию ниже (по умолчанию скрыта) */}
        {isPlaylist && (
          <button
            type="button"
            onClick={() => setShowChronology((v) => !v)}
            className="mt-3 text-sm font-semibold text-[#beff00] hover:text-[#d6ff5c]"
          >
            {showChronology ? 'Скрыть хронологию ↑' : 'Все материалы сюжета ↓'}
          </button>
        )}
      </header>

      {/* ТЗ-08 R2: плейлист-режим — плеер + список серий вместо таймлайна */}
      {isPlaylist && <StoryPlaylist articles={articles} />}

      {/* Хронология сюжета (в плейлист-режиме — свёрнута в аккордеон, принцип 4.3: не рендерим лишнее) */}
      {(!isPlaylist || showChronology) && (
        <ol className="relative space-y-6 border-l border-[#2a2a2a] pl-6">
          {articles.map((a) => (
            <li key={a.id} className="relative">
              <span className="absolute -left-[29px] top-1.5 h-2.5 w-2.5 rounded-full bg-[#beff00]" />
              <a href={`/${a.type}/${a.slug}`} className="font-semibold text-zinc-100 hover:text-[#d6ff5c]">
                {a.isPrimary ? '★ ' : ''}
                {a.title}
              </a>
              <div className="mt-1 text-xs text-zinc-500">
                {a.publishedAt?.slice(0, 10)}
                {a.isPrimary && ' · главная статья'}
              </div>
              {a.excerpt && <p className="mt-1 text-sm text-zinc-400">{a.excerpt}</p>}
            </li>
          ))}
        </ol>
      )}
    </div>
  );
}
