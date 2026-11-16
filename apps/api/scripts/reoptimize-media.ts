/**
 * Разовая утилита: пережать уже лежащие в медиатеке файлы.
 * Запуск на сервере: docker exec infra-api-1 npx tsx apps/api/scripts/reoptimize-media.ts
 * Сначала с REOPT_DRY=1 — только посчитает, ничего не тронет.
 *
 * Логика: для каждой media-записи с filePath '/uploads/...':
 *  - пропуск, если файл уже .webp и ≤ SKIP_WEBP_BYTES (уже пережат ранее);
 *  - иначе optimizeImage → новый файл (тот же basename + .webp),
 *    старый стираем, media.filePath обновляем.
 */
import { readFile, writeFile, unlink } from 'node:fs/promises';
import path from 'node:path';
import { eq, like } from 'drizzle-orm';
import { db, media } from '@newinvest/db';
import { config } from '../src/config.js';
import { sniffImageFormat } from '../src/utils/imageSniff.js';
import { optimizeImage } from '../src/utils/imageOptimize.js';

const DRY = process.env.REOPT_DRY === '1';
const SKIP_WEBP_BYTES = 400 * 1024; // webp меньше 400 КБ считаем уже оптимальным

async function main() {
  const rows = await db.select().from(media).where(like(media.filePath, '/uploads/%'));
  console.log(`media-записей с файлами: ${rows.length}${DRY ? ' (DRY-RUN)' : ''}`);

  let processed = 0;
  let skipped = 0;
  let missing = 0;
  let failed = 0;
  let beforeBytes = 0;
  let afterBytes = 0;

  for (const row of rows) {
    const base = path.basename(row.filePath);
    const full = path.join(path.resolve(config.uploadDir), base);
    let buf: Buffer;
    try {
      buf = await readFile(full);
    } catch {
      console.log(`  #${row.id} ${base}: файл не найден, пропуск`);
      missing++;
      continue;
    }
    const ext = path.extname(base).slice(1).toLowerCase();
    if (ext === 'webp' && buf.length <= SKIP_WEBP_BYTES) {
      skipped++;
      continue;
    }
    const sniffed = sniffImageFormat(buf);
    if (!sniffed) {
      console.log(`  #${row.id} ${base}: не растр (sniff fail), пропуск`);
      skipped++;
      continue;
    }
    const optimized = await optimizeImage(buf, sniffed);
    const newBase = `${base.replace(/\.[^.]+$/, '')}.${optimized.ext}`;
    const newFull = path.join(path.resolve(config.uploadDir), newBase);
    const newUrl = `/uploads/${newBase}`;
    beforeBytes += buf.length;
    afterBytes += optimized.buffer.length;
    processed++;
    console.log(
      `  #${row.id} ${base}: ${(buf.length / 1024).toFixed(0)} КБ → ${(optimized.buffer.length / 1024).toFixed(0)} КБ`,
    );
    if (DRY) continue;
    await writeFile(newFull, optimized.buffer);
    await db.update(media).set({ filePath: newUrl }).where(eq(media.id, row.id));
    if (newBase !== base) await unlink(full).catch(() => {});
  }

  console.log('──────────────────────────────');
  console.log(`обработано: ${processed}, пропущено: ${skipped}, файлов нет: ${missing}, ошибок: ${failed}`);
  console.log(`размер: ${(beforeBytes / 1024 / 1024).toFixed(1)} МБ → ${(afterBytes / 1024 / 1024).toFixed(1)} МБ`);
  process.exit(0);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
