CREATE TABLE "tg_bindings" (
	"user_id" integer PRIMARY KEY NOT NULL,
	"chat_id" text NOT NULL,
	"tg_username" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "tg_bindings_chat_id_unique" UNIQUE("chat_id")
);
--> statement-breakpoint
CREATE TABLE "tg_link_codes" (
	"code" text PRIMARY KEY NOT NULL,
	"user_id" integer NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"used_at" timestamp with time zone
);
--> statement-breakpoint
ALTER TABLE "tg_bindings" ADD CONSTRAINT "tg_bindings_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tg_link_codes" ADD CONSTRAINT "tg_link_codes_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;