CREATE TABLE "events" (
	"id" text PRIMARY KEY NOT NULL,
	"title" text NOT NULL,
	"at" bigint NOT NULL,
	"group_id" text,
	"session_id" text,
	"owner" uuid NOT NULL,
	"attendees" uuid[] DEFAULT '{}'::uuid[] NOT NULL,
	"maybe" uuid[] DEFAULT '{}'::uuid[] NOT NULL,
	"declined" uuid[] DEFAULT '{}'::uuid[] NOT NULL
);
--> statement-breakpoint
CREATE TABLE "follows" (
	"follower" uuid NOT NULL,
	"followee" uuid NOT NULL,
	CONSTRAINT "follows_follower_followee_pk" PRIMARY KEY("follower","followee")
);
--> statement-breakpoint
CREATE TABLE "groups" (
	"id" text PRIMARY KEY NOT NULL,
	"ord" integer NOT NULL,
	"name" text NOT NULL,
	"color" text NOT NULL,
	"owner" uuid NOT NULL,
	"image_version" integer,
	"editors" uuid[] DEFAULT '{}'::uuid[] NOT NULL,
	"members" uuid[] DEFAULT '{}'::uuid[] NOT NULL,
	"channels" jsonb NOT NULL
);
--> statement-breakpoint
CREATE TABLE "message_reads" (
	"account_id" uuid NOT NULL,
	"conv" text NOT NULL,
	"at" bigint NOT NULL,
	CONSTRAINT "message_reads_account_id_conv_pk" PRIMARY KEY("account_id","conv")
);
--> statement-breakpoint
CREATE TABLE "messages" (
	"id" text PRIMARY KEY NOT NULL,
	"conv" text NOT NULL,
	"at" bigint NOT NULL,
	"data" jsonb NOT NULL
);
--> statement-breakpoint
CREATE TABLE "profiles" (
	"account_id" uuid PRIMARY KEY NOT NULL,
	"bio" text DEFAULT '' NOT NULL,
	"status" text DEFAULT 'online' NOT NULL,
	"status_text" text DEFAULT '' NOT NULL,
	"recent" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"last_seen" bigint
);
--> statement-breakpoint
CREATE TABLE "session_renames" (
	"id" text PRIMARY KEY NOT NULL,
	"name" text NOT NULL
);
--> statement-breakpoint
CREATE TABLE "user_sessions" (
	"id" text PRIMARY KEY NOT NULL,
	"ord" integer NOT NULL,
	"name" text NOT NULL,
	"topic" text,
	"world" text,
	"visibility" text,
	"owner" uuid,
	"group_id" text,
	"invited" uuid[] DEFAULT '{}'::uuid[] NOT NULL
);
--> statement-breakpoint
CREATE TABLE "watches" (
	"watcher" uuid NOT NULL,
	"target" uuid NOT NULL,
	CONSTRAINT "watches_watcher_target_pk" PRIMARY KEY("watcher","target")
);
--> statement-breakpoint
ALTER TABLE "profiles" ADD CONSTRAINT "profiles_account_id_accounts_id_fk" FOREIGN KEY ("account_id") REFERENCES "public"."accounts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "messages_conv_at_idx" ON "messages" USING btree ("conv","at");