-- 2026-11-17: стартовая «докрутка» лайков/репостов (как views_base_offset с ТЗ-03).
-- API читает likesCount + likesBaseOffset / sharesCount + sharesBaseOffset,
-- реальные инкременты идут в колонки как раньше — фейковая база под ними не мешает.
ALTER TABLE "articles" ADD COLUMN IF NOT EXISTS "likes_base_offset"  INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "articles" ADD COLUMN IF NOT EXISTS "shares_base_offset" INTEGER NOT NULL DEFAULT 0;
