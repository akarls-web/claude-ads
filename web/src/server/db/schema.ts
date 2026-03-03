import {
  pgTable,
  text,
  timestamp,
  uuid,
  integer,
  jsonb,
  pgEnum,
  boolean,
  real,
} from "drizzle-orm/pg-core";

// ---------- Enums ----------

export const auditStatusEnum = pgEnum("audit_status", [
  "pending",
  "running",
  "completed",
  "failed",
]);

export const gradeEnum = pgEnum("grade", ["A", "B", "C", "D", "F"]);

export const checkResultEnum = pgEnum("check_result", [
  "pass",
  "warning",
  "fail",
  "skipped",
  "manual",
]);

export const severityEnum = pgEnum("severity", [
  "critical",
  "high",
  "medium",
  "low",
]);

export const platformTypeEnum = pgEnum("platform_type", [
  "google_ads",
  "google_search_console",
  "meta_ads",
  "manual",
]);

export const auditTypeEnum = pgEnum("audit_type", [
  "google_ads",
  "meta_ads",
  "seo",
  "local_seo",
  "ai_visibility",
]);

// ---------- Tables ----------

/** Clients — each user can have multiple clients (businesses being audited) */
export const clients = pgTable("clients", {
  id: uuid("id").defaultRandom().primaryKey(),
  userId: text("user_id").notNull(), // Clerk user ID
  name: text("name").notNull(),
  industry: text("industry"),
  website: text("website"),
  logoUrl: text("logo_url"),
  notes: text("notes"),
  isActive: boolean("is_active").default(true),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

/** Connections — platform credentials linked to a client */
export const connections = pgTable("connections", {
  id: uuid("id").defaultRandom().primaryKey(),
  userId: text("user_id").notNull(), // Clerk user ID
  clientId: uuid("client_id").references(() => clients.id, {
    onDelete: "cascade",
  }),
  platform: platformTypeEnum("platform").notNull().default("google_ads"),
  externalId: text("external_id").notNull(), // Platform-specific account ID (e.g. Google Ads CID)
  accountName: text("account_name"),
  accessToken: text("access_token").notNull(),
  refreshToken: text("refresh_token").notNull(),
  tokenExpiresAt: timestamp("token_expires_at"),
  isActive: boolean("is_active").default(true),
  connectedAt: timestamp("connected_at").defaultNow(),
  lastSyncedAt: timestamp("last_synced_at"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

/**
 * Backward-compat alias — existing code references `googleAccounts`.
 * This points to the renamed `connections` table.
 * TODO: Remove once all consumers migrate to `connections` directly.
 */
export const googleAccounts = connections;

export const audits = pgTable("audits", {
  id: uuid("id").defaultRandom().primaryKey(),
  userId: text("user_id").notNull(),
  clientId: uuid("client_id").references(() => clients.id),
  connectionId: uuid("connection_id").references(() => connections.id),
  auditType: auditTypeEnum("audit_type").notNull().default("google_ads"),
  // Legacy column — kept nullable for migration, will be dropped later
  googleAccountId: uuid("google_account_id"),
  reportId: text("report_id").notNull(), // SX-ADS-YYYYMMDD-SEQ
  status: auditStatusEnum("status").default("pending").notNull(),
  score: real("score"),
  grade: gradeEnum("grade"),
  businessType: text("business_type"),
  dateRangeStart: timestamp("date_range_start"),
  dateRangeEnd: timestamp("date_range_end"),
  totalChecks: integer("total_checks").default(0),
  passCount: integer("pass_count").default(0),
  warningCount: integer("warning_count").default(0),
  failCount: integer("fail_count").default(0),
  skippedCount: integer("skipped_count").default(0),
  manualCount: integer("manual_count").default(0),
  summary: text("summary"),
  rawData: jsonb("raw_data"), // Cached audit data snapshot
  aiAnalysis: jsonb("ai_analysis"), // Claude-generated narrative analysis
  startedAt: timestamp("started_at"),
  completedAt: timestamp("completed_at"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

export const auditChecks = pgTable("audit_checks", {
  id: uuid("id").defaultRandom().primaryKey(),
  auditId: uuid("audit_id")
    .references(() => audits.id, { onDelete: "cascade" })
    .notNull(),
  checkId: text("check_id").notNull(), // e.g. G01, G42, SX01
  category: text("category").notNull(),
  description: text("description").notNull(),
  result: checkResultEnum("result").notNull(),
  severity: severityEnum("severity").notNull(),
  details: text("details"),
  recommendation: text("recommendation"),
  isQuickWin: boolean("is_quick_win").default(false),
  estimatedFixMinutes: integer("estimated_fix_minutes"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

// ---------- Types ----------

export type Client = typeof clients.$inferSelect;
export type NewClient = typeof clients.$inferInsert;
export type Connection = typeof connections.$inferSelect;
export type NewConnection = typeof connections.$inferInsert;
/** @deprecated Use Connection instead */
export type GoogleAccount = typeof connections.$inferSelect;
/** @deprecated Use NewConnection instead */
export type NewGoogleAccount = typeof connections.$inferInsert;
export type Audit = typeof audits.$inferSelect;
export type NewAudit = typeof audits.$inferInsert;
export type AuditCheck = typeof auditChecks.$inferSelect;
export type NewAuditCheck = typeof auditChecks.$inferInsert;
