ALTER TABLE "articles" ADD COLUMN "thesis" text;--> statement-breakpoint
ALTER TABLE "companies" ADD COLUMN "one_liner" text;--> statement-breakpoint
ALTER TABLE "companies" ADD COLUMN "logo_media_id" integer;--> statement-breakpoint
ALTER TABLE "companies" ADD COLUMN "founded_year" integer;--> statement-breakpoint
ALTER TABLE "companies" ADD CONSTRAINT "companies_logo_media_id_media_id_fk" FOREIGN KEY ("logo_media_id") REFERENCES "public"."media"("id") ON DELETE no action ON UPDATE no action;