import { useEffect, useState } from 'react';
import { Check, Link2, MessageCircle, Send, Share2 } from 'lucide-react';
import { api } from '../api';
import {
  buildCanonicalUrl,
  buildShareLink,
  withUtm,
  type PopupShareChannel,
  type ShareChannel,
} from '../lib/share';

/**
 * Блок кнопок шеринга статьи (ТЗ-02). Две точки на странице статьи
 * (под заголовком после чипов и в «футере» после «Источника»), один компонент.
 * Доступен всем, включая анонимов (решение ТЗ 3.2 — шеринг воронка привлечения,
 * AuthModal не открывается). Каждый клик фиксируется через api.share
 * (fire-and-forget, 429/сеть не ломают UX — событие по факту клика, ТЗ-04 S1).
 */
interface ShareButtonsProps {
  articleId: number; // → POST /api/articles/:id/share
  title: string; // article.title → text=/title= шаринга
  type: string; // article.type → utm_content
  variant: 'inline-top' | 'inline-bottom';
}

/** VK не имеет лицензионно чистой иконки в lucide — слот брендового глифа (решение ТЗ 4.6). */
function VkGlyph() {
  return <span className="text-[11px] font-bold leading-none">VK</span>;
}

const POPUP_CHANNELS: { channel: PopupShareChannel; label: string; Icon: typeof Send | typeof VkGlyph | typeof MessageCircle }[] = [
  { channel: 'telegram', label: 'Telegram', Icon: Send },
  { channel: 'vk', label: 'VK', Icon: VkGlyph },
  { channel: 'whatsapp', label: 'WhatsApp', Icon: MessageCircle },
];

export function ShareButtons({ articleId, title, type, variant }: ShareButtonsProps) {
  const [copied, setCopied] = useState(false);
  const [copyFailed, setCopyFailed] = useState(false);

  // автоскрытие фидбека копирования (~2.5 с, таймер с очисткой — ТЗ 3.8)
  useEffect(() => {
    if (!copied && !copyFailed) return;
    const t = setTimeout(() => {
      setCopied(false);
      setCopyFailed(false);
    }, 2500);
    return () => clearTimeout(t);
  }, [copied, copyFailed]);

  /** Событие шеринга в ТЗ-04 API: fire-and-forget, глушим всё (429/сеть/404). */
  const track = (channel: ShareChannel) => {
    void api.share(articleId, channel).catch((e) => console.debug('share event failed', e));
  };

  /** Попап с обнулением opener; при блокировке — временная <a target="_blank"> (без ухода со страницы). */
  const openPopup = (url: string) => {
    const win = window.open(url, '_blank', 'width=600,height=500');
    if (win) {
      win.opener = null;
    } else {
      const a = document.createElement('a');
      a.href = url;
      a.target = '_blank';
      a.rel = 'noopener noreferrer';
      document.body.appendChild(a);
      a.click();
      a.remove();
    }
  };

  const openChannel = (channel: PopupShareChannel) => {
    track(channel); // синхронно, до открытия попапа — не ждём ответа (ТЗ 3.6)
    const url = buildShareLink(channel, withUtm(buildCanonicalUrl(), channel, type), title);
    openPopup(url);
  };

  const copyLink = async () => {
    // в буфер — чистая canonical-ссылка без UTM (решение ТЗ 3.4)
    const url = buildCanonicalUrl();
    let ok = true;
    try {
      await navigator.clipboard.writeText(url);
    } catch {
      // secure context недоступен (HTTP-dev / старый браузер) — fallback execCommand
      ok = false;
      try {
        const ta = document.createElement('textarea');
        ta.value = url;
        ta.style.position = 'fixed';
        ta.style.opacity = '0';
        document.body.appendChild(ta);
        ta.focus();
        ta.select();
        ok = document.execCommand('copy');
        ta.remove();
      } catch {
        ok = false;
      }
    }
    if (!ok) {
      setCopyFailed(true); // «скопируйте из адресной строки», без alert/prompt
      return;
    }
    track('copylink');
    setCopied(true);
  };

  const shareNative = () => {
    track('native_share');
    const url = withUtm(buildCanonicalUrl(), 'native_share', type);
    // закрытие нативного шита — не ошибка, промис обязательно глушим (ревью v2.1 №3)
    navigator.share({ title, url }).catch(() => {});
  };

  const canNativeShare = 'share' in navigator;
  const copyButtonClass =
    'flex h-10 items-center gap-1.5 rounded-full border border-[#2a2a2a] px-3 text-zinc-400 transition-colors hover:border-[#beff00]/50 hover:text-[#beff00]';

  return (
    <div data-testid="share-block" className={variant === 'inline-top' ? 'mt-4' : 'mt-8'}>
      {variant === 'inline-bottom' && (
        <p className="mb-3 text-xs font-semibold uppercase tracking-wide text-zinc-500">Поделиться</p>
      )}
      <div className="flex flex-wrap items-center gap-2">
        {canNativeShare ? (
          /* primary-кнопка нативного шера — только где есть navigator.share (мобильные) */
          <button
            type="button"
            onClick={shareNative}
            className="flex h-10 items-center gap-2 rounded-full bg-[#beff00] px-4 text-sm font-semibold text-zinc-950 transition-colors hover:bg-[#c9ff2a]"
          >
            <Share2 size={16} />
            Поделиться
          </button>
        ) : (
          /* десктоп без navigator.share (Firefox): текстовая копия, primary-слот не пустует (ТЗ 3.2) */
          <button type="button" onClick={() => void copyLink()} className={copyButtonClass}>
            <Link2 size={15} />
            <span className="text-xs font-medium">Копировать ссылку</span>
          </button>
        )}
        {POPUP_CHANNELS.map(({ channel, label, Icon }) => (
          <button
            key={channel}
            type="button"
            data-testid={`share-${channel}`}
            title={label}
            aria-label={`Поделиться в ${label}`}
            onClick={() => openChannel(channel)}
            className="flex h-10 min-w-10 flex-col items-center justify-center gap-0.5 rounded-full border border-[#2a2a2a] px-2 text-zinc-400 transition-colors hover:border-[#beff00]/50 hover:text-[#beff00]"
          >
            <Icon size={15} />
            <span className="text-[10px] leading-none">{label}</span>
          </button>
        ))}
        <button
          type="button"
          data-testid="share-copylink"
          title="Копировать ссылку"
          aria-label="Копировать ссылку"
          onClick={() => void copyLink()}
          className={`${copyButtonClass} flex-col gap-0.5 px-2`}
        >
          {copied ? <Check size={15} className="text-[#beff00]" /> : <Link2 size={15} />}
          <span className="text-[10px] leading-none">{copied ? 'Скопировано' : 'Ссылка'}</span>
        </button>
      </div>
      {copied && (
        <p className="mt-2 text-xs text-[#beff00] transition-opacity">Ссылка скопирована ✓</p>
      )}
      {copyFailed && (
        <p className="mt-2 text-xs text-zinc-400">
          Не удалось скопировать — скопируйте из адресной строки
        </p>
      )}
    </div>
  );
}
