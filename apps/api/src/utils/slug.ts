/**
 * Транслитерация заголовка в slug (стиль донора: й→j, щ→shh, ю→ju, я→ja).
 * Дубли разрешаем суффиксом -2, -3…
 */
import { and, eq } from 'drizzle-orm';
import { db, articles } from '@newinvest/db';

const MAP: Record<string, string> = {
  а: 'a', б: 'b', в: 'v', г: 'g', д: 'd', е: 'e', ё: 'e', ж: 'zh', з: 'z', и: 'i', й: 'j',
  к: 'k', л: 'l', м: 'm', н: 'n', о: 'o', п: 'p', р: 'r', с: 's', т: 't', у: 'u', ф: 'f',
  х: 'h', ц: 'c', ч: 'ch', ш: 'sh', щ: 'shh', ъ: '', ы: 'y', ь: '', э: 'e', ю: 'ju', я: 'ja',
};

export function slugify(title: string): string {
  return title
    .toLowerCase()
    .split('')
    .map((ch) => (MAP[ch] !== undefined ? MAP[ch] : ch))
    .join('')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 80);
}

/** Уникальный slug для типа: base, base-2, base-3… */
export async function uniqueSlug(type: string, title: string): Promise<string> {
  const base = slugify(title) || 'material';
  let candidate = base;
  for (let i = 2; ; i++) {
    const [row] = await db
      .select({ id: articles.id })
      .from(articles)
      .where(and(eq(articles.type, type), eq(articles.slug, candidate)))
      .limit(1);
    if (!row) return candidate;
    candidate = `${base}-${i}`;
    if (i > 50) return `${base}-${Date.now().toString(36)}`;
  }
}

// текст пользователя → безопасный HTML (только абзацы)
export function plainTextToHtml(text: string): string {
  return text
    .split(/\n{2,}/)
    .map((p) => p.trim())
    .filter(Boolean)
    .map((p) => `<p>${p.replace(/\n/g, '<br>').replace(/</g, '&lt;').replace(/>/g, '&gt;')}</p>`)
    .join('');
}
