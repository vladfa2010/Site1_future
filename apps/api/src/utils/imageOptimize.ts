/**
 * Оптимизация изображений: ресайз до MAX_WIDTH, конвертация в WebP q80, strip метаданных.
 * Используется при загрузке в медиатеку и при ИИ-генерации обложек —
 * иначе на диск ложатся многомегабайтные оригиналы и сайт тормозит.
 */
import sharp from 'sharp';

export const IMAGE_MAX_WIDTH = 1600;
export const IMAGE_WEBP_QUALITY = 80;

export interface OptimizedImage {
  buffer: Buffer;
  /** расширение файла для имени — 'webp' при успешной конвертации */
  ext: string;
  originalBytes: number;
  optimizedBytes: number;
}

/**
 * Прогоняет буфер через sharp. JPEG/PNG/WebP → WebP.
 * Анимированный WebP сохраняет кадры. Не-растр (и непарсящееся) возвращает как есть.
 */
export async function optimizeImage(buffer: Buffer, mimeHint?: string): Promise<OptimizedImage> {
  const pipeline = sharp(buffer, { animated: true })
    .rotate() // выравнивание по EXIF-Orientation
    .resize({ width: IMAGE_MAX_WIDTH, withoutEnlargement: true })
    .webp({ quality: IMAGE_WEBP_QUALITY });

  try {
    const out = await pipeline.toBuffer();
    // Если sharp вернул пусто — отдаём исходник (защита от экзотики)
    if (!out || out.length === 0) {
      return { buffer, ext: fallbackExt(mimeHint), originalBytes: buffer.length, optimizedBytes: buffer.length };
    }
    return { buffer: out, ext: 'webp', originalBytes: buffer.length, optimizedBytes: out.length };
  } catch {
    // Не смогли декодировать — отдаём как есть
    return { buffer, ext: fallbackExt(mimeHint), originalBytes: buffer.length, optimizedBytes: buffer.length };
  }
}

function fallbackExt(hint?: string): string {
  if (!hint) return 'bin';
  if (hint.includes('png')) return 'png';
  if (hint.includes('jpg') || hint.includes('jpeg')) return 'jpg';
  if (hint.includes('webp')) return 'webp';
  return 'bin';
}
