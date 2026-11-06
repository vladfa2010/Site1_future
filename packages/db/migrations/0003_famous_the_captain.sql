CREATE TABLE "article_deal_phases" (
	"article_id" integer NOT NULL,
	"phase_id" integer NOT NULL,
	CONSTRAINT "article_deal_phases_article_id_phase_id_pk" PRIMARY KEY("article_id","phase_id")
);
--> statement-breakpoint
CREATE TABLE "article_deal_stages" (
	"article_id" integer NOT NULL,
	"stage_id" integer NOT NULL,
	CONSTRAINT "article_deal_stages_article_id_stage_id_pk" PRIMARY KEY("article_id","stage_id")
);
--> statement-breakpoint
ALTER TABLE "article_deal_phases" ADD CONSTRAINT "article_deal_phases_article_id_articles_id_fk" FOREIGN KEY ("article_id") REFERENCES "public"."articles"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "article_deal_phases" ADD CONSTRAINT "article_deal_phases_phase_id_deal_phases_id_fk" FOREIGN KEY ("phase_id") REFERENCES "public"."deal_phases"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "article_deal_stages" ADD CONSTRAINT "article_deal_stages_article_id_articles_id_fk" FOREIGN KEY ("article_id") REFERENCES "public"."articles"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "article_deal_stages" ADD CONSTRAINT "article_deal_stages_stage_id_deal_stages_id_fk" FOREIGN KEY ("stage_id") REFERENCES "public"."deal_stages"("id") ON DELETE cascade ON UPDATE no action;