import { z } from "zod";
import { eq, and, desc } from "drizzle-orm";
import { TRPCError } from "@trpc/server";
import { router, protectedProcedure } from "../trpc";
import { db } from "../db";
import { audits, auditChecks, connections } from "../db/schema";
import { GoogleAdsService } from "../services/google-ads";
import { runAudit } from "../services/audit-engine";
import { generateAIAnalysis } from "../services/ai-analysis";

function generateReportId(): string {
  const now = new Date();
  const date = now.toISOString().slice(0, 10).replace(/-/g, "");
  const seq = Math.floor(Math.random() * 9999)
    .toString()
    .padStart(4, "0");
  return `SX-ADS-${date}-${seq}`;
}

export const auditRouter = router({
  list: protectedProcedure.query(async ({ ctx }) => {
    const rows = await db
      .select({
        id: audits.id,
        reportId: audits.reportId,
        status: audits.status,
        score: audits.score,
        grade: audits.grade,
        auditType: audits.auditType,
        clientId: audits.clientId,
        customerId: connections.externalId,
        customerName: connections.accountName,
        createdAt: audits.createdAt,
      })
      .from(audits)
      .leftJoin(connections, eq(audits.connectionId, connections.id))
      .where(eq(audits.userId, ctx.userId))
      .orderBy(desc(audits.createdAt))
      .limit(50);
    return rows;
  }),

  get: protectedProcedure
    .input(z.object({ id: z.string().uuid() }))
    .query(async ({ ctx, input }) => {
      const rows = await db
        .select({
          id: audits.id,
          reportId: audits.reportId,
          status: audits.status,
          score: audits.score,
          grade: audits.grade,
          auditType: audits.auditType,
          rawData: audits.rawData,
          aiAnalysis: audits.aiAnalysis,
          summary: audits.summary,
          customerId: connections.externalId,
          customerName: connections.accountName,
          createdAt: audits.createdAt,
        })
        .from(audits)
        .leftJoin(connections, eq(audits.connectionId, connections.id))
        .where(
          and(eq(audits.id, input.id), eq(audits.userId, ctx.userId))
        );

      const audit = rows[0];
      if (!audit) {
        throw new TRPCError({ code: "NOT_FOUND", message: "Audit not found" });
      }

      const checks = await db
        .select()
        .from(auditChecks)
        .where(eq(auditChecks.auditId, audit.id));

      return { audit, checks };
    }),

  run: protectedProcedure
    .input(
      z.object({
        googleAccountId: z.string().uuid(),
        dateRangeStart: z.string().optional(),
        dateRangeEnd: z.string().optional(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      // Verify connection belongs to user
      const [account] = await db
        .select()
        .from(connections)
        .where(
          and(
            eq(connections.id, input.googleAccountId),
            eq(connections.userId, ctx.userId),
            eq(connections.isActive, true)
          )
        );

      if (!account) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "Google Ads account not found",
        });
      }

      // Create audit record
      const reportId = generateReportId();
      const [audit] = await db
        .insert(audits)
        .values({
          userId: ctx.userId,
          connectionId: account.id,
          clientId: account.clientId,
          auditType: "google_ads",
          reportId,
          status: "running",
          startedAt: new Date(),
        })
        .returning();

      try {
        // Fetch data from Google Ads API
        const adsService = await GoogleAdsService.fromRefreshToken(
          account.refreshToken
        );
        const rawData = await adsService.fetchAllAuditData(account.externalId);

        // Run audit engine
        const report = runAudit(rawData);

        // Save check results
        const checkInserts = report.checks.map((c) => ({
          auditId: audit.id,
          checkId: c.checkId,
          category: c.category,
          description: c.description,
          result: c.result as "pass" | "warning" | "fail" | "skipped",
          severity: c.severity as "critical" | "high" | "medium" | "low",
          details: c.details,
          recommendation: c.recommendation,
          isQuickWin: c.isQuickWin,
          estimatedFixMinutes: c.estimatedFixMinutes,
        }));

        if (checkInserts.length > 0) {
          await db.insert(auditChecks).values(checkInserts);
        }

        // Build a lightweight data summary (skip bulky raw rows to stay under Neon's 64 MB limit)
        const dataSummary = {
          fetchedAt: rawData.fetchedAt,
          categoryScores: report.categoryScores,
          counts: {
            campaigns: Array.isArray(rawData.campaigns) ? rawData.campaigns.length : 0,
            adGroups: Array.isArray(rawData.adGroups) ? rawData.adGroups.length : 0,
            keywords: Array.isArray(rawData.keywords) ? rawData.keywords.length : 0,
            searchTerms: Array.isArray(rawData.searchTerms) ? rawData.searchTerms.length : 0,
            ads: Array.isArray(rawData.ads) ? rawData.ads.length : 0,
            conversions: Array.isArray(rawData.conversions) ? rawData.conversions.length : 0,
            negativeKeywords: Array.isArray(rawData.negativeKeywords) ? rawData.negativeKeywords.length : 0,
            assetGroups: Array.isArray(rawData.assetGroups) ? rawData.assetGroups.length : 0,
            changeHistory: Array.isArray(rawData.changeHistory) ? rawData.changeHistory.length : 0,
          },
        };

        // Run AI-powered narrative analysis (Claude)
        const aiAnalysis = await generateAIAnalysis({
          customerName: account.accountName ?? `Account ${account.externalId}`,
          customerId: account.externalId,
          score: report.score,
          grade: report.grade,
          totalChecks: report.totalChecks,
          passCount: report.passCount,
          warningCount: report.warningCount,
          failCount: report.failCount,
          skippedCount: report.skippedCount,
          manualCount: report.manualCount,
          categoryScores: report.categoryScores,
          checks: report.checks.map((c) => ({
            checkId: c.checkId,
            category: c.category,
            description: c.description,
            result: c.result,
            severity: c.severity,
            details: c.details,
            recommendation: c.recommendation,
            isQuickWin: c.isQuickWin,
          })),
          dataCounts: dataSummary.counts,
        });

        // Update audit with results
        const [updatedAudit] = await db
          .update(audits)
          .set({
            status: "completed",
            score: report.score,
            grade: report.grade as "A" | "B" | "C" | "D" | "F",
            totalChecks: report.totalChecks,
            passCount: report.passCount,
            warningCount: report.warningCount,
            failCount: report.failCount,
            skippedCount: report.skippedCount,
            manualCount: report.manualCount,
            summary: report.summary,
            rawData: dataSummary,
            aiAnalysis,
            completedAt: new Date(),
            updatedAt: new Date(),
          })
          .where(eq(audits.id, audit.id))
          .returning();

        return {
          audit: updatedAudit,
          report,
        };
      } catch (err) {
        console.error("[audit.run] FAILED:", err);
        // Mark as failed
        await db
          .update(audits)
          .set({
            status: "failed",
            summary: `Audit failed: ${err instanceof Error ? err.message : "Unknown error"}`,
            completedAt: new Date(),
            updatedAt: new Date(),
          })
          .where(eq(audits.id, audit.id));

        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: `Audit failed: ${err instanceof Error ? err.message : "Unknown error"}`,
        });
      }
    }),
});
