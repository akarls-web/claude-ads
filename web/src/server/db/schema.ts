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

// ---------- Tables ----------

export const googleAccounts = pgTable("google_accounts", {
  id: uuid("id").defaultRandom().primaryKey(),
  userId: text("user_id").notNull(), // Clerk user ID
  customerId: text("customer_id").notNull(), // Google Ads Customer ID
  customerName: text("customer_name"),
  accessToken: text("access_token").notNull(),
  refreshToken: text("refresh_token").notNull(),
  tokenExpiresAt: timestamp("token_expires_at"),
  isActive: boolean("is_active").default(true),
  connectedAt: timestamp("connected_at").defaultNow(),
  lastSyncedAt: timestamp("last_synced_at"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

export const audits = pgTable("audits", {
  id: uuid("id").defaultRandom().primaryKey(),
  userId: text("user_id").notNull(),
  googleAccountId: uuid("google_account_id").references(
    () => googleAccounts.id
  ),
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
  rawData: jsonb("raw_data"), // Cached Google Ads data snapshot
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

export type GoogleAccount = typeof googleAccounts.$inferSelect;
export type NewGoogleAccount = typeof googleAccounts.$inferInsert;
export type Audit = typeof audits.$inferSelect;
export type NewAudit = typeof audits.$inferInsert;
export type AuditCheck = typeof auditChecks.$inferSelect;
export type NewAuditCheck = typeof auditChecks.$inferInsert;
