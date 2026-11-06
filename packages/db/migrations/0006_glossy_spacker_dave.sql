CREATE TABLE "notification_settings" (
	"user_id" integer PRIMARY KEY NOT NULL,
	"email_daily" boolean DEFAULT true NOT NULL,
	"email_weekly" boolean DEFAULT true NOT NULL,
	"last_daily_sent_at" timestamp with time zone,
	"last_weekly_sent_at" timestamp with time zone
);
--> statement-breakpoint
ALTER TABLE "notification_settings" ADD CONSTRAINT "notification_settings_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;