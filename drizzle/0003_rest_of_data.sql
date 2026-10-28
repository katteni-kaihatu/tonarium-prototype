CREATE TABLE "app_data" (
	"scope" text NOT NULL,
	"key" text NOT NULL,
	"account_id" uuid,
	"data" jsonb NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "app_data_scope_key_pk" PRIMARY KEY("scope","key")
);
--> statement-breakpoint
CREATE TABLE "market_likes" (
	"product" text NOT NULL,
	"account_id" uuid NOT NULL,
	CONSTRAINT "market_likes_product_account_id_pk" PRIMARY KEY("product","account_id")
);
--> statement-breakpoint
CREATE TABLE "posts" (
	"id" text PRIMARY KEY NOT NULL,
	"at" bigint NOT NULL,
	"data" jsonb NOT NULL
);
--> statement-breakpoint
CREATE TABLE "reports" (
	"id" serial PRIMARY KEY NOT NULL,
	"at" timestamp with time zone DEFAULT now() NOT NULL,
	"from_account" uuid NOT NULL,
	"from_name" text NOT NULL,
	"target" text NOT NULL,
	"reason" text NOT NULL
);
--> statement-breakpoint
CREATE TABLE "session_items" (
	"session_id" text NOT NULL,
	"item_id" text NOT NULL,
	"data" jsonb NOT NULL,
	CONSTRAINT "session_items_session_id_item_id_pk" PRIMARY KEY("session_id","item_id")
);
--> statement-breakpoint
ALTER TABLE "app_data" ADD CONSTRAINT "app_data_account_id_accounts_id_fk" FOREIGN KEY ("account_id") REFERENCES "public"."accounts"("id") ON DELETE cascade ON UPDATE no action;