ALTER TABLE "tariff_plans" ADD COLUMN "description" text;--> statement-breakpoint
ALTER TABLE "tariff_plans" ADD COLUMN "price_monthly" numeric DEFAULT '0' NOT NULL;--> statement-breakpoint
ALTER TABLE "tariff_plans" ADD COLUMN "price_yearly" numeric DEFAULT '0' NOT NULL;--> statement-breakpoint
ALTER TABLE "tariff_plans" ADD COLUMN "yearly_discount" integer DEFAULT 20 NOT NULL;--> statement-breakpoint
ALTER TABLE "tariff_plans" ADD COLUMN "features" text DEFAULT '{}' NOT NULL;--> statement-breakpoint
ALTER TABLE "tariff_plans" ADD COLUMN "is_active" boolean DEFAULT true NOT NULL;--> statement-breakpoint
ALTER TABLE "tariff_plans" ADD COLUMN "coming_soon_label" text;--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "tariff_expires_at" timestamp with time zone;