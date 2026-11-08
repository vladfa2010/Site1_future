ALTER TABLE "article_stories" ADD COLUMN IF NOT EXISTS "sort_order" integer NOT NULL DEFAULT 0;
