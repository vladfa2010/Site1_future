ALTER TABLE "articles" ADD COLUMN IF NOT EXISTS "reading_time" integer;
--> statement-breakpoint
ALTER TABLE "articles" ADD COLUMN IF NOT EXISTS "views_base_offset" integer NOT NULL DEFAULT 0;
--> statement-breakpoint
ALTER TABLE "articles" ADD COLUMN IF NOT EXISTS "views_auto_bump_enabled" boolean NOT NULL DEFAULT false;
--> statement-breakpoint
ALTER TABLE "articles" ADD COLUMN IF NOT EXISTS "views_auto_bump_every_hours" integer;
--> statement-breakpoint
ALTER TABLE "articles" ADD COLUMN IF NOT EXISTS "views_auto_bump_min" integer NOT NULL DEFAULT 1;
--> statement-breakpoint
ALTER TABLE "articles" ADD COLUMN IF NOT EXISTS "views_auto_bump_max" integer NOT NULL DEFAULT 3;
--> statement-breakpoint
ALTER TABLE "articles" ADD COLUMN IF NOT EXISTS "views_bump_accumulated" integer NOT NULL DEFAULT 0;
--> statement-breakpoint
ALTER TABLE "articles" ADD COLUMN IF NOT EXISTS "views_bump_last_at" timestamp with time zone;
--> statement-breakpoint
ALTER TABLE "articles" ADD COLUMN IF NOT EXISTS "likes_count" integer NOT NULL DEFAULT 0;
--> statement-breakpoint
ALTER TABLE "articles" ADD COLUMN IF NOT EXISTS "shares_count" integer NOT NULL DEFAULT 0;
--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "bio" text;
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "article_likes" (
	"user_id" integer NOT NULL,
	"article_id" integer NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "article_likes_pkey" PRIMARY KEY("user_id","article_id")
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "article_share_events" (
	"id" serial PRIMARY KEY NOT NULL,
	"article_id" integer NOT NULL,
	"user_id" integer,
	"channel" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "article_likes" ADD CONSTRAINT "article_likes_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "article_likes" ADD CONSTRAINT "article_likes_article_id_articles_id_fk" FOREIGN KEY ("article_id") REFERENCES "public"."articles"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "article_share_events" ADD CONSTRAINT "article_share_events_article_id_articles_id_fk" FOREIGN KEY ("article_id") REFERENCES "public"."articles"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "article_share_events" ADD CONSTRAINT "article_share_events_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "article_share_events_article_id_idx" ON "article_share_events" ("article_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "article_views_viewed_at_idx" ON "article_views" ("viewed_at");
--> statement-breakpoint
ALTER TABLE "articles" ADD CONSTRAINT "articles_views_auto_bump_check" CHECK (NOT ("views_auto_bump_enabled" AND "views_auto_bump_every_hours" IS NULL));
