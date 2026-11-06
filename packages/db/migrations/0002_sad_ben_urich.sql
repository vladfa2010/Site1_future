CREATE TABLE "funding_rounds" (
	"id" serial PRIMARY KEY NOT NULL,
	"company_id" integer NOT NULL,
	"stage" text,
	"date" date,
	"amount" numeric,
	"currency" text DEFAULT 'USD',
	"post_money_valuation" numeric,
	"investors" text[],
	"source_url" text NOT NULL,
	"status" text DEFAULT 'completed',
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "funding_rounds" ADD CONSTRAINT "funding_rounds_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE cascade ON UPDATE no action;