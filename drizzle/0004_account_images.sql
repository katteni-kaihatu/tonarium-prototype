CREATE TABLE "account_images" (
	"account_id" uuid PRIMARY KEY NOT NULL,
	"icon" text,
	"avatar_image" text,
	"avatar_params" jsonb,
	"avatar_version" text
);
--> statement-breakpoint
ALTER TABLE "account_images" ADD CONSTRAINT "account_images_account_id_accounts_id_fk" FOREIGN KEY ("account_id") REFERENCES "public"."accounts"("id") ON DELETE cascade ON UPDATE no action;