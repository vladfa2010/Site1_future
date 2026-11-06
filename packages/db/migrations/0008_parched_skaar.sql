CREATE TABLE "tariff_plans" (
	"id" serial PRIMARY KEY NOT NULL,
	"slug" text NOT NULL,
	"name" text NOT NULL,
	"sort_order" integer DEFAULT 0 NOT NULL,
	CONSTRAINT "tariff_plans_slug_unique" UNIQUE("slug")
);
--> statement-breakpoint
ALTER TABLE "articles" ADD COLUMN "access_level" text DEFAULT 'public' NOT NULL;--> statement-breakpoint
ALTER TABLE "articles" ADD COLUMN "access_tariff_id" integer;--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "tariff_id" integer;--> statement-breakpoint
ALTER TABLE "articles" ADD CONSTRAINT "articles_access_tariff_id_tariff_plans_id_fk" FOREIGN KEY ("access_tariff_id") REFERENCES "public"."tariff_plans"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "users" ADD CONSTRAINT "users_tariff_id_tariff_plans_id_fk" FOREIGN KEY ("tariff_id") REFERENCES "public"."tariff_plans"("id") ON DELETE no action ON UPDATE no action;