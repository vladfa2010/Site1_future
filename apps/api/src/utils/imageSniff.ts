/**
 * Определение формата растровой картинки по магическим байтам.
 * Аудит 2026-11-14: content-type нельзя доверять (заголовок подделывается/ошибается),
 * SVG нельзя раздавать с image/svg+xml (active content) — сохраняем и отдаём
 * только jpeg/png/webp, формат определяем по сигнатуре файла.
 */
export type RasterFormat = 'png' | 'jpg' | 'webp';

export function sniffImageFormat(buf: Buffer): RasterFormat | null {
  if (buf.length > 12 && buf.toString('ascii', 0, 4) === 'RIFF' && buf.toString('ascii', 8, 12) === 'WEBP') return 'webp';
  if (buf.length > 8 && buf[0] === 0x89 && buf[1] === 0x50 && buf[2] === 0x4e && buf[3] === 0x47) return 'png';
  if (buf.length > 3 && buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff) return 'jpg';
  return null;
}

export function mimeFor(fmt: RasterFormat): string {
  return fmt === 'jpg' ? 'image/jpeg' : `image/${fmt}`;
}

export function extFor(fmt: RasterFormat): string {
  return fmt;
}
