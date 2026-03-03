-- Migration: Multi-client / multi-audit schema
-- Renames google_accounts → connections, adds clients table,
-- adds audit_type + connection_id to audits, migrates existing data.

-- 1. Create new enums
CREATE TYPE "public"."platform_type" AS ENUM('google_ads', 'google_search_console', 'meta_ads', 'manual');
--> statement-breakpoint
CREATE TYPE "public"."audit_type" AS ENUM('google_ads', 'meta_ads', 'seo', 'local_seo', 'ai_visibility');
--> statement-breakpoint

-- 2. Create clients table
CREATE TABLE "clients" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "user_id" text NOT NULL,
  "name" text NOT NULL,
  "industry" text,
  "website" text,
  "logo_url" text,
  "notes" text,
  "is_active" boolean DEFAULT true,
  "created_at" timestamp DEFAULT now() NOT NULL,
  "updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint

-- 3. Rename google_accounts → connections
ALTER TABLE "google_accounts" RENAME TO "connections";
--> statement-breakpoint

-- 4. Rename columns in connections
ALTER TABLE "connections" RENAME COLUMN "customer_id" TO "external_id";
--> statement-breakpoint
ALTER TABLE "connections" RENAME COLUMN "customer_name" TO "account_name";
--> statement-breakpoint

-- 5. Add platform + client_id columns to connections
ALTER TABLE "connections" ADD COLUMN "platform" "platform_type" NOT NULL DEFAULT 'google_ads';
--> statement-breakpoint
ALTER TABLE "connections" ADD COLUMN "client_id" uuid;
--> statement-breakpoint

-- 6. Add connection_id, client_id, audit_type to audits
ALTER TABLE "audits" ADD COLUMN "connection_id" uuid;
--> statement-breakpoint
ALTER TABLE "audits" ADD COLUMN "client_id" uuid;
--> statement-breakpoint
ALTER TABLE "audits" ADD COLUMN "audit_type" "audit_type" NOT NULL DEFAULT 'google_ads';
--> statement-breakpoint

-- 7. Migrate data: copy google_account_id → connection_id for existing audits
UPDATE "audits" SET "connection_id" = "google_account_id" WHERE "google_account_id" IS NOT NULL;
--> statement-breakpoint

-- 8. Create a default client per user from existing connections
INSERT INTO "clients" ("id", "user_id", "name", "created_at", "updated_at")
SELECT DISTINCT gen_random_uuid(), "user_id", 'Default Client', now(), now()
FROM "connections"
WHERE "user_id" IS NOT NULL
ON CONFLICT DO NOTHING;
--> statement-breakpoint

-- 9. Link existing connections to their user's default client
UPDATE "connections" c
SET "client_id" = cl."id"
FROM "clients" cl
WHERE cl."user_id" = c."user_id"
  AND cl."name" = 'Default Client'
  AND c."client_id" IS NULL;
--> statement-breakpoint

-- 10. Link existing audits to their user's default client
UPDATE "audits" a
SET "client_id" = cl."id"
FROM "clients" cl
WHERE cl."user_id" = a."user_id"
  AND cl."name" = 'Default Client'
  AND a."client_id" IS NULL;
--> statement-breakpoint

-- 11. Add foreign key constraints
ALTER TABLE "connections" ADD CONSTRAINT "connections_client_id_clients_id_fk" FOREIGN KEY ("client_id") REFERENCES "clients"("id") ON DELETE CASCADE;
--> statement-breakpoint
ALTER TABLE "audits" ADD CONSTRAINT "audits_connection_id_connections_id_fk" FOREIGN KEY ("connection_id") REFERENCES "connections"("id");
--> statement-breakpoint
ALTER TABLE "audits" ADD CONSTRAINT "audits_client_id_clients_id_fk" FOREIGN KEY ("client_id") REFERENCES "clients"("id");
--> statement-breakpoint

-- 12. Update the existing FK constraint name (google_accounts → connections)
-- The original FK from audits.google_account_id → google_accounts.id still works
-- because the table was renamed. We keep the column for now but it will be dropped later.
