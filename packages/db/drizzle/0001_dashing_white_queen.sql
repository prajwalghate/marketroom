ALTER TABLE "event_links" ADD COLUMN "matched_by" text;--> statement-breakpoint
ALTER TABLE "event_links" ADD COLUMN "review_status" text DEFAULT 'unreviewed' NOT NULL;--> statement-breakpoint
ALTER TABLE "event_links" ADD COLUMN "checked_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "event_links" ADD COLUMN "checked_by" text;--> statement-breakpoint
ALTER TABLE "event_links" ADD COLUMN "created_at" timestamp with time zone DEFAULT now() NOT NULL;