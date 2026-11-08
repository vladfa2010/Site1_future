/**
 * Преобразование ссылки на внешнее видео в embed-URL (как в WordPress):
 * YouTube (watch/youtu.be/shorts), RuTube, VK Видео → iframe src.
 */
export function toEmbedUrl(url: string): string | null {
  try {
    const u = new URL(url);
    const host = u.hostname.replace(/^www\./, '');

    if (host === 'youtube.com' || host === 'm.youtube.com' || host === 'music.youtube.com') {
      const v = u.searchParams.get('v') ?? u.pathname.match(/^\/(shorts|embed|live)\/([\w-]+)/)?.[2];
      return v ? `https://www.youtube.com/embed/${v}` : null;
    }
    if (host === 'youtu.be') {
      const v = u.pathname.slice(1).split('/')[0];
      return v ? `https://www.youtube.com/embed/${v}` : null;
    }
    if (host === 'rutube.ru') {
      const m = u.pathname.match(/^\/video\/([\w-]+)/);
      return m ? `https://rutube.ru/play/embed/${m[1]}` : null;
    }
    if (host === 'vk.com' || host === 'vkvideo.ru') {
      const m = u.pathname.match(/video(-?\d+)_(\d+)/);
      return m ? `https://vk.com/video_ext.php?oid=${m[1]}&id=${m[2]}&hd=2` : null;
    }
    return null;
  } catch {
    return null;
  }
}
