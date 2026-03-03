const { neon } = require("@neondatabase/serverless");

const DB_URL =
  process.env.DATABASE_URL ||
  "postgresql://neondb_owner:npg_vI5xtHaAWCi3@ep-steep-surf-ae0i0jto-pooler.c-2.us-east-2.aws.neon.tech/neondb?sslmode=require";

const REPORT_ID = process.argv[2] || "SX-ADS-20260303-9186";

(async () => {
  const sql = neon(DB_URL);

  const audits = await sql`SELECT * FROM audits WHERE report_id = ${REPORT_ID}`;
  const audit = audits[0];
  if (!audit) {
    console.error("Report not found:", REPORT_ID);
    process.exit(1);
  }

  const checks = await sql`SELECT * FROM audit_checks WHERE audit_id = ${audit.id} ORDER BY category, check_id`;

  let conn = null;
  if (audit.connection_id) {
    const rows = await sql`SELECT * FROM connections WHERE id = ${audit.connection_id}`;
    conn = rows[0] || null;
  }

  let client = null;
  if (audit.client_id) {
    const rows = await sql`SELECT * FROM clients WHERE id = ${audit.client_id}`;
    client = rows[0] || null;
  }

  const result = {
    report: {
      reportId: audit.report_id,
      auditType: audit.audit_type,
      status: audit.status,
      score: audit.score,
      grade: audit.grade,
      totalChecks: audit.total_checks,
      passCount: audit.pass_count,
      warningCount: audit.warning_count,
      failCount: audit.fail_count,
      skippedCount: audit.skipped_count,
      manualCount: audit.manual_count,
      summary: audit.summary,
      startedAt: audit.started_at,
      completedAt: audit.completed_at,
      createdAt: audit.created_at,
    },
    connection: conn
      ? {
          accountName: conn.account_name,
          externalId: conn.external_id,
          provider: conn.provider,
        }
      : null,
    client: client
      ? {
          name: client.name,
          website: client.website,
          industry: client.industry,
        }
      : null,
    rawData: audit.raw_data,
    aiAnalysis: audit.ai_analysis,
    checks: checks.map((c) => ({
      checkId: c.check_id,
      category: c.category,
      description: c.description,
      result: c.result,
      severity: c.severity,
      details: c.details,
      recommendation: c.recommendation,
      isQuickWin: c.is_quick_win,
      estimatedFixMinutes: c.estimated_fix_minutes,
    })),
  };

  console.log(JSON.stringify(result, null, 2));
})();
