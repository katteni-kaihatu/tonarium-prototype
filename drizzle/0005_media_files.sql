CREATE TABLE "media_files" (
	"name" text PRIMARY KEY NOT NULL,
	"size" integer NOT NULL,
	"at" timestamp with time zone DEFAULT now() NOT NULL
);
