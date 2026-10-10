CREATE TABLE "aliases" (
	"id" integer PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "aliases_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 START WITH 1 CACHE 1),
	"subject_type" text NOT NULL,
	"subject_id" integer NOT NULL,
	"alias" text NOT NULL,
	CONSTRAINT "aliases_unique" UNIQUE("subject_type","alias")
);
--> statement-breakpoint
CREATE TABLE "changes" (
	"id" bigint PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "changes_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 9223372036854775807 START WITH 1 CACHE 1),
	"at" timestamp with time zone DEFAULT now() NOT NULL,
	"actor" text NOT NULL,
	"action" text NOT NULL,
	"subject_type" text,
	"subject_id" integer,
	"summary" text NOT NULL,
	"diff" jsonb
);
--> statement-breakpoint
CREATE TABLE "distinct_pairs" (
	"subject_type" text NOT NULL,
	"a_id" integer NOT NULL,
	"b_id" integer NOT NULL,
	"decided_by" text NOT NULL,
	"decided_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "distinct_pairs_subject_type_a_id_b_id_pk" PRIMARY KEY("subject_type","a_id","b_id")
);
--> statement-breakpoint
CREATE TABLE "event_links" (
	"id" integer PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "event_links_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 START WITH 1 CACHE 1),
	"event_id" integer NOT NULL,
	"subject_type" text NOT NULL,
	"subject_id" integer NOT NULL,
	CONSTRAINT "event_links_unique" UNIQUE("event_id","subject_type","subject_id")
);
--> statement-breakpoint
CREATE TABLE "events" (
	"id" integer PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "events_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 START WITH 1 CACHE 1),
	"slug" text NOT NULL,
	"kind" text NOT NULL,
	"title" text NOT NULL,
	"starts_on" date NOT NULL,
	"ends_on" date,
	"url" text,
	"location" text,
	"description" text,
	"amount_usd" double precision,
	"external_key" text,
	"review_status" text DEFAULT 'unreviewed' NOT NULL,
	"checked_at" timestamp with time zone,
	"checked_by" text,
	"locked_fields" text[] DEFAULT '{}'::text[] NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "events_slug_unique" UNIQUE("slug"),
	CONSTRAINT "events_external_key_unique" UNIQUE("external_key")
);
--> statement-breakpoint
CREATE TABLE "evidence" (
	"id" integer PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "evidence_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 START WITH 1 CACHE 1),
	"subject_type" text NOT NULL,
	"subject_id" integer NOT NULL,
	"field" text DEFAULT '' NOT NULL,
	"source_id" integer NOT NULL,
	"method" text NOT NULL,
	"checked_at" timestamp with time zone DEFAULT now() NOT NULL,
	"checked_by" text NOT NULL,
	"note" text,
	CONSTRAINT "evidence_unique" UNIQUE("subject_type","subject_id","field","source_id")
);
--> statement-breakpoint
CREATE TABLE "funding_rounds" (
	"id" integer PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "funding_rounds_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 START WITH 1 CACHE 1),
	"slug" text NOT NULL,
	"project_id" integer NOT NULL,
	"round_type" text,
	"amount_usd" double precision,
	"valuation_usd" double precision,
	"announced_on" date NOT NULL,
	"notes" text,
	"external_key" text,
	"merged_into_id" integer,
	"review_status" text DEFAULT 'unreviewed' NOT NULL,
	"checked_at" timestamp with time zone,
	"checked_by" text,
	"locked_fields" text[] DEFAULT '{}'::text[] NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "funding_rounds_slug_unique" UNIQUE("slug"),
	CONSTRAINT "funding_rounds_external_key_unique" UNIQUE("external_key"),
	CONSTRAINT "rounds_amount_positive" CHECK ("funding_rounds"."amount_usd" is null or "funding_rounds"."amount_usd" > 0)
);
--> statement-breakpoint
CREATE TABLE "import_runs" (
	"id" integer PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "import_runs_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 START WITH 1 CACHE 1),
	"job" text NOT NULL,
	"started_at" timestamp with time zone DEFAULT now() NOT NULL,
	"finished_at" timestamp with time zone,
	"status" text NOT NULL,
	"stats" jsonb,
	"error" text
);
--> statement-breakpoint
CREATE TABLE "market_snapshots" (
	"id" bigint PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "market_snapshots_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 9223372036854775807 START WITH 1 CACHE 1),
	"token_id" integer NOT NULL,
	"captured_at" timestamp with time zone DEFAULT now() NOT NULL,
	"price" double precision,
	"market_cap" double precision,
	"fdv" double precision,
	"volume_24h" double precision,
	"liquidity" double precision,
	"holders" integer,
	"change_24h" double precision,
	"provider" text NOT NULL,
	"provider_updated_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "news" (
	"id" integer PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "news_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 START WITH 1 CACHE 1),
	"url" text NOT NULL,
	"title" text NOT NULL,
	"publisher" text NOT NULL,
	"published_at" timestamp with time zone NOT NULL,
	"summary" text,
	"image_url" text,
	"feed_url" text,
	"fetched_at" timestamp with time zone DEFAULT now() NOT NULL,
	"hidden" boolean DEFAULT false NOT NULL,
	CONSTRAINT "news_url_unique" UNIQUE("url")
);
--> statement-breakpoint
CREATE TABLE "news_mentions" (
	"id" integer PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "news_mentions_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 START WITH 1 CACHE 1),
	"news_id" integer NOT NULL,
	"subject_type" text NOT NULL,
	"subject_id" integer NOT NULL,
	"matched_by" text NOT NULL,
	"review_status" text DEFAULT 'unreviewed' NOT NULL,
	"checked_at" timestamp with time zone,
	"checked_by" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "news_mentions_unique" UNIQUE("news_id","subject_type","subject_id")
);
--> statement-breakpoint
CREATE TABLE "organization_people" (
	"id" integer PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "organization_people_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 START WITH 1 CACHE 1),
	"organization_id" integer NOT NULL,
	"person_id" integer NOT NULL,
	"role" text NOT NULL,
	"is_current" boolean DEFAULT true NOT NULL,
	"started_on" date,
	"ended_on" date,
	"review_status" text DEFAULT 'unreviewed' NOT NULL,
	"checked_at" timestamp with time zone,
	"checked_by" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "organization_people_unique" UNIQUE("organization_id","person_id","role")
);
--> statement-breakpoint
CREATE TABLE "organizations" (
	"id" integer PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "organizations_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 START WITH 1 CACHE 1),
	"slug" text NOT NULL,
	"name" text NOT NULL,
	"kind" text,
	"logo_url" text,
	"description" text,
	"website" text,
	"twitter" text,
	"location" text,
	"founded_year" integer,
	"is_investor" boolean DEFAULT false NOT NULL,
	"merged_into_id" integer,
	"review_status" text DEFAULT 'unreviewed' NOT NULL,
	"checked_at" timestamp with time zone,
	"checked_by" text,
	"locked_fields" text[] DEFAULT '{}'::text[] NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "organizations_slug_unique" UNIQUE("slug")
);
--> statement-breakpoint
CREATE TABLE "people" (
	"id" integer PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "people_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 START WITH 1 CACHE 1),
	"slug" text NOT NULL,
	"name" text NOT NULL,
	"avatar_url" text,
	"headline" text,
	"bio" text,
	"location" text,
	"twitter" text,
	"github" text,
	"linkedin" text,
	"website" text,
	"merged_into_id" integer,
	"review_status" text DEFAULT 'unreviewed' NOT NULL,
	"checked_at" timestamp with time zone,
	"checked_by" text,
	"locked_fields" text[] DEFAULT '{}'::text[] NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "people_slug_unique" UNIQUE("slug")
);
--> statement-breakpoint
CREATE TABLE "program_activity" (
	"id" bigint PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "program_activity_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 9223372036854775807 START WITH 1 CACHE 1),
	"program_id" integer NOT NULL,
	"captured_at" timestamp with time zone DEFAULT now() NOT NULL,
	"sample_size" integer NOT NULL,
	"window_seconds" double precision,
	"tx_per_hour" double precision,
	"failed_share" double precision,
	"latest_tx_at" timestamp with time zone,
	"provider" text NOT NULL,
	"method" text NOT NULL
);
--> statement-breakpoint
CREATE TABLE "programs" (
	"id" integer PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "programs_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 START WITH 1 CACHE 1),
	"address" text NOT NULL,
	"name" text,
	"kind" text,
	"description" text,
	"loader" text,
	"upgrade_authority" text,
	"program_data_address" text,
	"last_deploy_slot" bigint,
	"onchain_checked_at" timestamp with time zone,
	"verified_build" boolean,
	"verified_repo" text,
	"verified_commit" text,
	"verified_at" timestamp with time zone,
	"review_status" text DEFAULT 'unreviewed' NOT NULL,
	"checked_at" timestamp with time zone,
	"checked_by" text,
	"locked_fields" text[] DEFAULT '{}'::text[] NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "programs_address_unique" UNIQUE("address")
);
--> statement-breakpoint
CREATE TABLE "project_metrics" (
	"id" bigint PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "project_metrics_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 9223372036854775807 START WITH 1 CACHE 1),
	"project_id" integer NOT NULL,
	"captured_at" timestamp with time zone DEFAULT now() NOT NULL,
	"tvl_solana" double precision,
	"tvl_total" double precision,
	"tvl_change_1d" double precision,
	"tvl_change_7d" double precision,
	"fees_30d" double precision,
	"revenue_30d" double precision,
	"products" jsonb,
	"provider" text NOT NULL
);
--> statement-breakpoint
CREATE TABLE "project_people" (
	"id" integer PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "project_people_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 START WITH 1 CACHE 1),
	"project_id" integer NOT NULL,
	"person_id" integer NOT NULL,
	"role" text NOT NULL,
	"is_current" boolean DEFAULT true NOT NULL,
	"started_on" date,
	"ended_on" date,
	"review_status" text DEFAULT 'unreviewed' NOT NULL,
	"checked_at" timestamp with time zone,
	"checked_by" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "project_people_unique" UNIQUE("project_id","person_id","role")
);
--> statement-breakpoint
CREATE TABLE "project_programs" (
	"id" integer PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "project_programs_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 START WITH 1 CACHE 1),
	"project_id" integer NOT NULL,
	"program_id" integer NOT NULL,
	"relation" text DEFAULT 'operates' NOT NULL,
	"note" text,
	"review_status" text DEFAULT 'unreviewed' NOT NULL,
	"checked_at" timestamp with time zone,
	"checked_by" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "project_programs_unique" UNIQUE("project_id","program_id")
);
--> statement-breakpoint
CREATE TABLE "projects" (
	"id" integer PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "projects_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 START WITH 1 CACHE 1),
	"slug" text NOT NULL,
	"name" text NOT NULL,
	"tagline" text,
	"description" text,
	"logo_url" text,
	"category" text,
	"tags" text[] DEFAULT '{}'::text[] NOT NULL,
	"status" text,
	"founded_year" integer,
	"website" text,
	"twitter" text,
	"github_orgs" text[] DEFAULT '{}'::text[] NOT NULL,
	"discord" text,
	"telegram" text,
	"docs" text,
	"parent_id" integer,
	"defillama_key" text,
	"defillama_ids" text[] DEFAULT '{}'::text[] NOT NULL,
	"defillama_slugs" text[] DEFAULT '{}'::text[] NOT NULL,
	"coingecko_id" text,
	"merged_into_id" integer,
	"review_status" text DEFAULT 'unreviewed' NOT NULL,
	"checked_at" timestamp with time zone,
	"checked_by" text,
	"locked_fields" text[] DEFAULT '{}'::text[] NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "projects_slug_unique" UNIQUE("slug"),
	CONSTRAINT "projects_defillama_key_unique" UNIQUE("defillama_key")
);
--> statement-breakpoint
CREATE TABLE "round_investors" (
	"id" integer PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "round_investors_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 START WITH 1 CACHE 1),
	"round_id" integer NOT NULL,
	"organization_id" integer,
	"person_id" integer,
	"is_lead" boolean DEFAULT false NOT NULL,
	"name_as_reported" text,
	"review_status" text DEFAULT 'unreviewed' NOT NULL,
	"checked_at" timestamp with time zone,
	"checked_by" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "round_investors_one_party" CHECK (("round_investors"."organization_id" is null) <> ("round_investors"."person_id" is null))
);
--> statement-breakpoint
CREATE TABLE "sources" (
	"id" integer PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "sources_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 START WITH 1 CACHE 1),
	"url" text NOT NULL,
	"title" text,
	"publisher" text,
	"kind" text NOT NULL,
	"published_at" timestamp with time zone,
	"first_seen_at" timestamp with time zone DEFAULT now() NOT NULL,
	"link_checked_at" timestamp with time zone,
	"http_status" integer,
	"review_status" text DEFAULT 'unreviewed' NOT NULL,
	"reviewed_by" text,
	"reviewed_at" timestamp with time zone,
	"notes" text,
	CONSTRAINT "sources_url_unique" UNIQUE("url")
);
--> statement-breakpoint
CREATE TABLE "sync_state" (
	"job" text NOT NULL,
	"subject_type" text NOT NULL,
	"subject_id" integer NOT NULL,
	"synced_at" timestamp with time zone DEFAULT now() NOT NULL,
	"ok" boolean DEFAULT true NOT NULL,
	CONSTRAINT "sync_state_job_subject_type_subject_id_pk" PRIMARY KEY("job","subject_type","subject_id")
);
--> statement-breakpoint
CREATE TABLE "tokens" (
	"id" integer PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "tokens_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 START WITH 1 CACHE 1),
	"mint" text NOT NULL,
	"project_id" integer,
	"symbol" text,
	"name" text,
	"decimals" integer,
	"standard" text,
	"logo_url" text,
	"coingecko_id" text,
	"is_primary" boolean DEFAULT false NOT NULL,
	"launched_at" timestamp with time zone,
	"review_status" text DEFAULT 'unreviewed' NOT NULL,
	"checked_at" timestamp with time zone,
	"checked_by" text,
	"locked_fields" text[] DEFAULT '{}'::text[] NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "tokens_mint_unique" UNIQUE("mint")
);
--> statement-breakpoint
ALTER TABLE "event_links" ADD CONSTRAINT "event_links_event_id_events_id_fk" FOREIGN KEY ("event_id") REFERENCES "public"."events"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "evidence" ADD CONSTRAINT "evidence_source_id_sources_id_fk" FOREIGN KEY ("source_id") REFERENCES "public"."sources"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "funding_rounds" ADD CONSTRAINT "funding_rounds_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "funding_rounds" ADD CONSTRAINT "funding_rounds_merged_into_id_funding_rounds_id_fk" FOREIGN KEY ("merged_into_id") REFERENCES "public"."funding_rounds"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "market_snapshots" ADD CONSTRAINT "market_snapshots_token_id_tokens_id_fk" FOREIGN KEY ("token_id") REFERENCES "public"."tokens"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "news_mentions" ADD CONSTRAINT "news_mentions_news_id_news_id_fk" FOREIGN KEY ("news_id") REFERENCES "public"."news"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "organization_people" ADD CONSTRAINT "organization_people_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "organization_people" ADD CONSTRAINT "organization_people_person_id_people_id_fk" FOREIGN KEY ("person_id") REFERENCES "public"."people"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "organizations" ADD CONSTRAINT "organizations_merged_into_id_organizations_id_fk" FOREIGN KEY ("merged_into_id") REFERENCES "public"."organizations"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "people" ADD CONSTRAINT "people_merged_into_id_people_id_fk" FOREIGN KEY ("merged_into_id") REFERENCES "public"."people"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "program_activity" ADD CONSTRAINT "program_activity_program_id_programs_id_fk" FOREIGN KEY ("program_id") REFERENCES "public"."programs"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "project_metrics" ADD CONSTRAINT "project_metrics_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "project_people" ADD CONSTRAINT "project_people_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "project_people" ADD CONSTRAINT "project_people_person_id_people_id_fk" FOREIGN KEY ("person_id") REFERENCES "public"."people"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "project_programs" ADD CONSTRAINT "project_programs_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "project_programs" ADD CONSTRAINT "project_programs_program_id_programs_id_fk" FOREIGN KEY ("program_id") REFERENCES "public"."programs"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "projects" ADD CONSTRAINT "projects_parent_id_projects_id_fk" FOREIGN KEY ("parent_id") REFERENCES "public"."projects"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "projects" ADD CONSTRAINT "projects_merged_into_id_projects_id_fk" FOREIGN KEY ("merged_into_id") REFERENCES "public"."projects"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "round_investors" ADD CONSTRAINT "round_investors_round_id_funding_rounds_id_fk" FOREIGN KEY ("round_id") REFERENCES "public"."funding_rounds"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "round_investors" ADD CONSTRAINT "round_investors_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "round_investors" ADD CONSTRAINT "round_investors_person_id_people_id_fk" FOREIGN KEY ("person_id") REFERENCES "public"."people"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tokens" ADD CONSTRAINT "tokens_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "aliases_subject_idx" ON "aliases" USING btree ("subject_type","subject_id");--> statement-breakpoint
CREATE INDEX "changes_at_idx" ON "changes" USING btree ("at");--> statement-breakpoint
CREATE INDEX "changes_subject_idx" ON "changes" USING btree ("subject_type","subject_id");--> statement-breakpoint
CREATE INDEX "event_links_subject_idx" ON "event_links" USING btree ("subject_type","subject_id");--> statement-breakpoint
CREATE INDEX "events_starts_idx" ON "events" USING btree ("starts_on");--> statement-breakpoint
CREATE INDEX "evidence_subject_idx" ON "evidence" USING btree ("subject_type","subject_id");--> statement-breakpoint
CREATE INDEX "evidence_source_idx" ON "evidence" USING btree ("source_id");--> statement-breakpoint
CREATE INDEX "rounds_project_idx" ON "funding_rounds" USING btree ("project_id");--> statement-breakpoint
CREATE INDEX "rounds_date_idx" ON "funding_rounds" USING btree ("announced_on");--> statement-breakpoint
CREATE INDEX "import_runs_job_idx" ON "import_runs" USING btree ("job","started_at");--> statement-breakpoint
CREATE INDEX "market_snapshots_token_idx" ON "market_snapshots" USING btree ("token_id","captured_at");--> statement-breakpoint
CREATE INDEX "news_published_idx" ON "news" USING btree ("published_at");--> statement-breakpoint
CREATE INDEX "news_mentions_subject_idx" ON "news_mentions" USING btree ("subject_type","subject_id");--> statement-breakpoint
CREATE INDEX "organization_people_person_idx" ON "organization_people" USING btree ("person_id");--> statement-breakpoint
CREATE INDEX "organizations_investor_idx" ON "organizations" USING btree ("is_investor");--> statement-breakpoint
CREATE INDEX "program_activity_program_idx" ON "program_activity" USING btree ("program_id","captured_at");--> statement-breakpoint
CREATE INDEX "project_metrics_project_idx" ON "project_metrics" USING btree ("project_id","captured_at");--> statement-breakpoint
CREATE INDEX "project_people_person_idx" ON "project_people" USING btree ("person_id");--> statement-breakpoint
CREATE INDEX "project_programs_program_idx" ON "project_programs" USING btree ("program_id");--> statement-breakpoint
CREATE INDEX "projects_category_idx" ON "projects" USING btree ("category");--> statement-breakpoint
CREATE INDEX "projects_name_idx" ON "projects" USING btree ("name");--> statement-breakpoint
CREATE UNIQUE INDEX "round_investors_org_unique" ON "round_investors" USING btree ("round_id","organization_id") WHERE "round_investors"."organization_id" is not null;--> statement-breakpoint
CREATE UNIQUE INDEX "round_investors_person_unique" ON "round_investors" USING btree ("round_id","person_id") WHERE "round_investors"."person_id" is not null;--> statement-breakpoint
CREATE INDEX "round_investors_org_idx" ON "round_investors" USING btree ("organization_id");--> statement-breakpoint
CREATE INDEX "round_investors_person_idx" ON "round_investors" USING btree ("person_id");--> statement-breakpoint
CREATE INDEX "sources_kind_idx" ON "sources" USING btree ("kind");--> statement-breakpoint
CREATE INDEX "tokens_project_idx" ON "tokens" USING btree ("project_id");