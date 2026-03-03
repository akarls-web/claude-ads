CREATE TYPE "public"."audit_status" AS ENUM('pending', 'running', 'completed', 'failed');--> statement-breakpoint
CREATE TYPE "public"."check_result" AS ENUM('pass', 'warning', 'fail', 'skipped', 'manual');--> statement-breakpoint
CREATE TYPE "public"."grade" AS ENUM('A', 'B', 'C', 'D', 'F');--> statement-breakpoint
CREATE TYPE "public"."severity" AS ENUM('critical', 'high', 'medium', 'low');--> statement-breakpoint
CREATE TABLE "audit_checks" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"audit_id" uuid NOT NULL,
	"check_id" text NOT NULL,
	"category" text NOT NULL,
	"description" text NOT NULL,
	"result" "check_result" NOT NULL,
	"severity" "severity" NOT NULL,
	"details" text,
	"recommendation" text,
	"is_quick_win" boolean DEFAULT false,
	"estimated_fix_minutes" integer,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "audits" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" text NOT NULL,
	"google_account_id" uuid,
	"report_id" text NOT NULL,
	"status" "audit_status" DEFAULT 'pending' NOT NULL,
	"score" real,
	"grade" "grade",
	"business_type" text,
	"date_range_start" timestamp,
	"date_range_end" timestamp,
	"total_checks" integer DEFAULT 0,
	"pass_count" integer DEFAULT 0,
	"warning_count" integer DEFAULT 0,
	"fail_count" integer DEFAULT 0,
	"skipped_count" integer DEFAULT 0,
	"manual_count" integer DEFAULT 0,
	"summary" text,
	"raw_data" jsonb,
	"ai_analysis" jsonb,
	"started_at" timestamp,
	"completed_at" timestamp,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "google_accounts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" text NOT NULL,
	"customer_id" text NOT NULL,
	"customer_name" text,
	"access_token" text NOT NULL,
	"refresh_token" text NOT NULL,
	"token_expires_at" timestamp,
	"is_active" boolean DEFAULT true,
	"connected_at" timestamp DEFAULT now(),
	"last_synced_at" timestamp,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "audit_checks" ADD CONSTRAINT "audit_checks_audit_id_audits_id_fk" FOREIGN KEY ("audit_id") REFERENCES "public"."audits"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "audits" ADD CONSTRAINT "audits_google_account_id_google_accounts_id_fk" FOREIGN KEY ("google_account_id") REFERENCES "public"."google_accounts"("id") ON DELETE no action ON UPDATE no action;