/**
 * Migration script: Multi-client / multi-audit schema
 * Run with: npx tsx --env-file=.env scripts/migrate-multi-client.ts
 */
import { neon } from "@neondatabase/serverless";

const DATABASE_URL = process.env.DATABASE_URL;
if (!DATABASE_URL) {
  console.error("DATABASE_URL not found in environment");
  process.exit(1);
}

const sql = neon(DATABASE_URL);

async function migrate() {
  console.log("🚀 Starting multi-client schema migration...\n");

  // 1. Create new enums
  console.log("1. Creating platform_type enum...");
  await sql`
    DO $$ BEGIN
      CREATE TYPE "public"."platform_type" AS ENUM('google_ads', 'google_search_console', 'meta_ads', 'manual');
    EXCEPTION WHEN duplicate_object THEN NULL;
    END $$;
  `;

  console.log("2. Creating audit_type enum...");
  await sql`
    DO $$ BEGIN
      CREATE TYPE "public"."audit_type" AS ENUM('google_ads', 'meta_ads', 'seo', 'local_seo', 'ai_visibility');
    EXCEPTION WHEN duplicate_object THEN NULL;
    END $$;
  `;

  // 2. Create clients table
  console.log("3. Creating clients table...");
  await sql`
    CREATE TABLE IF NOT EXISTS "clients" (
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
  `;

  // 3. Rename google_accounts → connections
  console.log("4. Renaming google_accounts → connections...");
  await sql`ALTER TABLE IF EXISTS "google_accounts" RENAME TO "connections";`;

  // 4. Rename columns
  console.log("5. Renaming customer_id → external_id...");
  await sql`ALTER TABLE "connections" RENAME COLUMN "customer_id" TO "external_id";`;

  console.log("6. Renaming customer_name → account_name...");
  await sql`ALTER TABLE "connections" RENAME COLUMN "customer_name" TO "account_name";`;

  // 5. Add platform + client_id to connections
  console.log("7. Adding platform column to connections...");
  await sql`
    DO $$ BEGIN
      ALTER TABLE "connections" ADD COLUMN "platform" "platform_type" NOT NULL DEFAULT 'google_ads';
    EXCEPTION WHEN duplicate_column THEN NULL;
    END $$;
  `;

  console.log("8. Adding client_id column to connections...");
  await sql`
    DO $$ BEGIN
      ALTER TABLE "connections" ADD COLUMN "client_id" uuid;
    EXCEPTION WHEN duplicate_column THEN NULL;
    END $$;
  `;

  // 6. Add connection_id, client_id, audit_type to audits
  console.log("9. Adding connection_id to audits...");
  await sql`
    DO $$ BEGIN
      ALTER TABLE "audits" ADD COLUMN "connection_id" uuid;
    EXCEPTION WHEN duplicate_column THEN NULL;
    END $$;
  `;

  console.log("10. Adding client_id to audits...");
  await sql`
    DO $$ BEGIN
      ALTER TABLE "audits" ADD COLUMN "client_id" uuid;
    EXCEPTION WHEN duplicate_column THEN NULL;
    END $$;
  `;

  console.log("11. Adding audit_type to audits...");
  await sql`
    DO $$ BEGIN
      ALTER TABLE "audits" ADD COLUMN "audit_type" "audit_type" NOT NULL DEFAULT 'google_ads';
    EXCEPTION WHEN duplicate_column THEN NULL;
    END $$;
  `;

  // 7. Migrate data: copy google_account_id → connection_id
  console.log("12. Copying google_account_id → connection_id...");
  const updated = await sql`
    UPDATE "audits"
    SET "connection_id" = "google_account_id"
    WHERE "google_account_id" IS NOT NULL
      AND "connection_id" IS NULL;
  `;
  console.log(`    Updated ${updated.length} audit rows`);

  // 8. Create default client per user
  console.log("13. Creating default clients for existing users...");
  const inserted = await sql`
    INSERT INTO "clients" ("user_id", "name")
    SELECT DISTINCT "user_id", 'Default Client'
    FROM "connections"
    WHERE "user_id" IS NOT NULL
      AND NOT EXISTS (
        SELECT 1 FROM "clients" WHERE "clients"."user_id" = "connections"."user_id"
      );
  `;
  console.log(`    Created ${inserted.length} default clients`);

  // 9. Link connections to their default client
  console.log("14. Linking connections to default clients...");
  await sql`
    UPDATE "connections" c
    SET "client_id" = cl."id"
    FROM "clients" cl
    WHERE cl."user_id" = c."user_id"
      AND cl."name" = 'Default Client'
      AND c."client_id" IS NULL;
  `;

  // 10. Link audits to their default client
  console.log("15. Linking audits to default clients...");
  await sql`
    UPDATE "audits" a
    SET "client_id" = cl."id"
    FROM "clients" cl
    WHERE cl."user_id" = a."user_id"
      AND cl."name" = 'Default Client'
      AND a."client_id" IS NULL;
  `;

  // 11. Add foreign key constraints (idempotent)
  console.log("16. Adding foreign key constraints...");
  await sql`
    DO $$ BEGIN
      ALTER TABLE "connections" ADD CONSTRAINT "connections_client_id_clients_id_fk"
        FOREIGN KEY ("client_id") REFERENCES "clients"("id") ON DELETE CASCADE;
    EXCEPTION WHEN duplicate_object THEN NULL;
    END $$;
  `;

  await sql`
    DO $$ BEGIN
      ALTER TABLE "audits" ADD CONSTRAINT "audits_connection_id_connections_id_fk"
        FOREIGN KEY ("connection_id") REFERENCES "connections"("id");
    EXCEPTION WHEN duplicate_object THEN NULL;
    END $$;
  `;

  await sql`
    DO $$ BEGIN
      ALTER TABLE "audits" ADD CONSTRAINT "audits_client_id_clients_id_fk"
        FOREIGN KEY ("client_id") REFERENCES "clients"("id");
    EXCEPTION WHEN duplicate_object THEN NULL;
    END $$;
  `;

  console.log("\n✅ Migration complete!");

  // Verify
  const tables = await sql`
    SELECT table_name FROM information_schema.tables
    WHERE table_schema = 'public'
    ORDER BY table_name;
  `;
  console.log("\nTables:", tables.map((t) => (t as { table_name: string }).table_name).join(", "));

  const clientCount = await sql`SELECT count(*) as cnt FROM clients;`;
  const connCount = await sql`SELECT count(*) as cnt FROM connections;`;
  const auditCount = await sql`SELECT count(*) as cnt FROM audits;`;
  console.log(`Clients: ${clientCount[0].cnt}, Connections: ${connCount[0].cnt}, Audits: ${auditCount[0].cnt}`);
}

migrate().catch((err) => {
  console.error("Migration failed:", err);
  process.exit(1);
});
