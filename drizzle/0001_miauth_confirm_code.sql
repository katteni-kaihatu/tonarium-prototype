ALTER TABLE "login_pending" ADD COLUMN "code_hash" text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE "login_pending" ADD COLUMN "code_attempts" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "login_pending" ADD COLUMN "misskey_user" jsonb;