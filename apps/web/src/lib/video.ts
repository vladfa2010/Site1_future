/**
 * Преобразование ссылки на внешнее видео в embed-URL (как в WordPress):
 * YouTube (watch/youtu.be/shorts), RuTube, VK Видео → iframe src.
 * Возвращает null, если платформа не распознана.
 */
export function toEmbedUrl(url: string): string | null {
  try {
    const u = new URL(url);
    const host = u.hostname.replace(/^www\./, '');

    // YouTube: watch?v=, youtu.be/, /shorts/, /embed/, /live/
    if (host === 'youtube.com' || host === 'm.youtube.com' || host === 'music.youtube.com') {
      const v = u.searchParams.get('v')
        ?? u.pathname.match(/^\/(shorts|embed|live)\/([\w-]+)/)?.[2];
      return v ? `https://www.youtube.com/embed/${v}` : null;
    }
    if (host === 'youtu.be') {
      const v = u.pathname.slice(1).split('/')[0];
      return v ? `https://www.youtube.com/embed/${v}` : null;
    }

    // RuTube: /video/<hash>/ → /play/embed/<hash>
    if (host === 'rutube.ru') {
      const m = u.pathname.match(/^\/video\/([\w-]+)/);
      return m ? `https://rutube.ru/play/embed/${m[1]}` : null;
    }

    // VK Видео: /video-<owner>_<id> → /video_ext.php
    if (host === 'vk.com' || host === 'vkvideo.ru') {
      const m = u.pathname.match(/video(-?\d+)_(\d+)/);
      return m ? `https://vk.com/video_ext.php?oid=${m[1]}&id=${m[2]}&hd=2` : null;
    }

    // Dailymotion
    if (host === 'dailymotion.com' || host === 'dai.ly') {
      const m = host === 'dai.ly'
        ? u.pathname.slice(1).split('/')[0]
        : u.pathname.match(/video\/([\w]+)/)?.[1];
      return m ? `https://www.dailymotion.com/embed/video/${m}` : null;
    }

    // Vimeo
    if (host === 'vimeo.com') {
      const m = u.pathname.match(/^\/(\d+)/);
      return m ? `https://player.vimeo.com/video/${m[1]}` : null;
    }

    return null;
  } catch {
    return null;
  }
}

/** Превью-картинка YouTube (для карточек); null для остальных платформ */
export function videoThumbnail(url: string): string | null {
  const embed = toEmbedUrl(url);
  if (!embed) return null;
  const m = embed.match(/youtube\.com\/embed\/([\w-]+)/);
  return m ? `https://i.ytimg.com/vi/${m[1]}/hqdefault.jpg` : null;
}
