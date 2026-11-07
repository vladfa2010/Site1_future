CREATE EXTENSION IF NOT EXISTS vector;--> statement-breakpoint
-- Полнотекстовый поиск (русский стемминг): заголовок + тезис + лид + текст без HTML-тегов.
-- Эмбеддинги — в таблице article_embeddings (миграция ранее), здесь только FTS.
ALTER TABLE "articles" ADD COLUMN "search_tsv" tsvector GENERATED ALWAYS AS (
  to_tsvector('russian',
    coalesce(title, '') || ' ' ||
    coalesce(thesis, '') || ' ' ||
    coalesce(excerpt, '') || ' ' ||
    regexp_replace(coalesce(content_html, ''), '<[^>]+>', ' ', 'g')
  )
) STORED;--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "articles_search_tsv_idx" ON "articles" USING gin ("search_tsv");
