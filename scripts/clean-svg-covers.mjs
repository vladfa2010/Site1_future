/**
 * Разовая вычистка SVG из /uploads (ТЗ 4.4, аудит 2026-11-14).
 *
 * SVG раздавался с image/svg+xml — active content. Политика: в /uploads только
 * растр. Скрипт:
 *   1) SVG, привязанные к контенту (articles.cover_media_id и др.) — конвертирует
 *      в PNG (sips на macOS), обновляет media.file_path;
 *   2) сироты (не привязанные ни к чему) — удаляет файл и строку media.
 *
 * Запуск (из корня репо):  npx tsx scripts/clean-svg-covers.mjs           — dry-run
 *                         npx tsx scripts/clean-svg-covers.mjs --apply   — применить
 */
import { execFileSync } from 'node:child_process';
import { existsSync, unlinkSync } from 'node:fs';
import path from 'node:path';
import { db, media, articles, companies, trends, stories } from '@newinvest/db';
import { eq, inArray, sql } from 'drizzle-orm';

const APPLY = process.argv.includes('--apply');
const UPLOADS_DIR = process.env.UPLOAD_DIR ?? 'apps/api/uploads'; // от корня репо
const REFERENCING = [articles.coverMediaId, companies.logoMediaId, trends.coverMediaId, stories.coverMediaId];

const svgRows = await db.execute(sql`
  SELECT m.id, m.file_path FROM media m
  WHERE m.file_path LIKE '%.svg'
    AND (EXISTS (SELECT 1 FROM articles a WHERE a.cover_media_id = m.id)
      OR EXISTS (SELECT 1 FROM companies c WHERE c.logo_media_id = m.id)
      OR EXISTS (SELECT 1 FROM trends t WHERE t.cover_media_id = m.id)
      OR EXISTS (SELECT 1 FROM stories s WHERE s.cover_media_id = m.id))
`);
const referenced = new Map(svgRows.rows.map((r) => [r.id, r.file_path]));

const allSvg = await db.select({ id: media.id, filePath: media.filePath }).from(media);
const orphans = allSvg.filter((m) => m.filePath.endsWith('.svg') && !referenced.has(m.id));

console.log(`SVG привязанных к контенту: ${referenced.size}; сирот: ${orphans.length}; режим: ${APPLY ? 'APPLY' : 'dry-run'}`);

let converted = 0;
let removed = 0;
let failed = 0;

/** SVG → PNG: sips на macOS, ImageMagick (magick/convert) на Linux. */
function isENOENT(e) {
  return e && typeof e === 'object' && 'code' in e && e.code === 'ENOENT';
}
function svgToPng(svgAbs, pngAbs) {
  try {
    return execFileSync('sips', ['-s', 'format', 'png', svgAbs, '--out', pngAbs], { stdio: 'pipe' });
  } catch (e) {
    if (!isENOENT(e)) throw e;
  }
  for (const cmd of ['magick', 'convert']) {
    try {
      return execFileSync(cmd, [svgAbs, pngAbs], { stdio: 'pipe' });
    } catch (e) {
      if (!isENOENT(e)) throw e;
    }
  }
  throw new Error('нет конвертера SVG→PNG (нужны sips или ImageMagick)');
}

for (const [id, filePath] of referenced) {
  const svgAbs = path.resolve(UPLOADS_DIR, path.basename(filePath));
  const pngAbs = svgAbs.replace(/\.svg$/, '.png');
  const newPath = filePath.replace(/\.svg$/, '.png');
  if (!existsSync(svgAbs)) {
    console.log(`[skip] ${filePath}: файл отсутствует на диске`);
    continue;
  }
  try {
    if (APPLY) {
      svgToPng(svgAbs, pngAbs);
      const buf = await import('node:fs/promises').then((fs) => fs.readFile(pngAbs));
      const isPng = buf.length > 8 && buf[0] === 0x89 && buf[1] === 0x50 && buf[2] === 0x4e && buf[3] === 0x47;
      if (!isPng) throw new Error('результат не PNG');
      await db.update(media).set({ filePath: newPath }).where(eq(media.id, id));
      unlinkSync(svgAbs);
    }
    console.log(`${APPLY ? '[convert]' : '[dry-run convert]'} media:${id} ${filePath} → ${newPath}`);
    converted++;
  } catch (e) {
    console.error(`[FAIL] media:${id} ${filePath}: ${e instanceof Error ? e.message : String(e)}`);
    failed++;
  }
}

for (const m of orphans) {
  const abs = path.resolve(UPLOADS_DIR, path.basename(m.filePath));
  if (APPLY) {
    if (existsSync(abs)) unlinkSync(abs);
    await db.delete(media).where(eq(media.id, m.id));
  }
  removed++;
}
console.log(`${APPLY ? '[delete]' : '[dry-run delete]'} сирот: ${removed} (файл + строка media)`);

const left = await db.select({ id: media.id }).from(media).where(sql`${media.filePath} LIKE '%.svg'`);
console.log(`Итог: конвертировано ${converted}, удалено ${removed}, ошибок ${failed}, SVG осталось в media: ${left.length}`);
process.exit(failed ? 1 : 0);
