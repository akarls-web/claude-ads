"use client";

import { useParams } from "next/navigation";
import Link from "next/link";
import { trpc } from "@/lib/trpc";
import {
  ArrowLeft,
  Loader2,
  AlertTriangle,
  CheckCircle2,
  XCircle,
  Info,
  Zap,
  BarChart3,
  ChevronDown,
  ChevronRight,
  Download,
  FileText,
  Globe,
  Layers,
  ExternalLink,
} from "lucide-react";
import { formatScore, gradeColor, gradeBg, cn } from "@/lib/utils";
import { useState, useCallback } from "react";

/* ── SEO Site Report types from rawData ── */
interface SeoPageSummary {
  url: string;
  label: string;
  source: string;
  score: number;
  grade: string;
  totalChecks: number;
  passCount: number;
  warningCount: number;
  failCount: number;
  categoryScores: Record<string, number>;
  fetchStatus: "ok" | "error";
  responseTimeMs?: number;
  error?: string;
}

interface SeoOpportunity {
  checkId: string;
  category: string;
  description: string;
  severity: string;
  affectedPages: number;
  totalPages: number;
  recommendation: string;
}

interface SeoRawData {
  websiteUrl?: string;
  pagesCrawled?: number;
  categoryScores?: Record<string, number>;
  pages?: SeoPageSummary[];
  topOpportunities?: SeoOpportunity[];
  quickWins?: SeoOpportunity[];
  actionPlan?: { phase: string; items: string[] }[];
}

const severityIcon = {
  critical: <XCircle className="h-4 w-4 text-red-600" strokeWidth={1.75} />,
  high: <AlertTriangle className="h-4 w-4 text-orange-500" strokeWidth={1.75} />,
  medium: <Info className="h-4 w-4 text-yellow-500" strokeWidth={1.75} />,
  low: <Info className="h-4 w-4 text-blue-400" strokeWidth={1.75} />,
  info: <Info className="h-4 w-4 text-text-placeholder" strokeWidth={1.75} />,
};

const severityLabel: Record<string, string> = {
  critical: "Critical",
  high: "High",
  medium: "Medium",
  low: "Low",
  info: "Info",
};

const resultBadge: Record<string, string> = {
  pass: "bg-green-50 text-green-700 border-green-200",
  fail: "bg-red-50 text-red-700 border-red-200",
  warning: "bg-yellow-50 text-yellow-700 border-yellow-200",
  manual: "bg-purple-50 text-purple-700 border-purple-200",
  info: "bg-blue-50 text-blue-700 border-blue-200",
  "not-applicable": "bg-gray-50 text-gray-500 border-gray-200",
};

export default function AuditDetailPage() {
  const params = useParams();
  const auditId = params.id as string;
  const audit = trpc.audit.get.useQuery({ id: auditId });
  const [expandedCategories, setExpandedCategories] = useState<
    Record<string, boolean>
  >({});
  const [downloading, setDownloading] = useState(false);

  const handleDownloadPdf = useCallback(async () => {
    setDownloading(true);
    try {
      const res = await fetch(`/api/audit/${auditId}/pdf`);
      if (!res.ok) throw new Error("Download failed");
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = res.headers.get("Content-Disposition")?.match(/filename="(.+)"/)?.[1] ?? "audit-report.pdf";
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
    } catch (e) {
      console.error("PDF download error:", e);
    } finally {
      setDownloading(false);
    }
  }, [auditId]);

  if (audit.isLoading) {
    return (
      <div className="flex min-h-[50vh] items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-brand" />
      </div>
    );
  }

  if (audit.error || !audit.data) {
    return (
      <div className="mx-auto max-w-3xl py-16 text-center">
        <XCircle className="mx-auto mb-4 h-12 w-12 text-red-400" />
        <h2 className="text-h2 font-bold text-text-primary">
          Audit not found
        </h2>
        <p className="mt-2 text-body text-text-secondary">
          {audit.error?.message ?? "This audit doesn't exist or you don't have access."}
        </p>
        <Link
          href="/audits"
          className="mt-6 inline-flex items-center gap-2 text-small font-medium text-brand hover:text-brand-light"
        >
          <ArrowLeft className="h-4 w-4" strokeWidth={1.75} />
          Back to audits
        </Link>
      </div>
    );
  }

  const { audit: a, checks } = audit.data;
  const isSeo = a.auditType === "seo";
  const raw = (a.rawData ?? {}) as SeoRawData & Record<string, unknown>;

  // Parse category scores from rawData
  const categoryScores: Record<string, number> =
    (raw.categoryScores as Record<string, number>) ?? {};

  // SEO site-level data
  const seoPages: SeoPageSummary[] = isSeo ? (raw.pages ?? []) : [];
  const seoOpportunities: SeoOpportunity[] = isSeo ? (raw.topOpportunities ?? []) : [];
  const seoActionPlan = isSeo ? (raw.actionPlan ?? []) : [];

  // Group checks by category
  const grouped = checks.reduce(
    (acc, check) => {
      const cat = check.category ?? "Other";
      if (!acc[cat]) acc[cat] = [];
      acc[cat].push(check);
      return acc;
    },
    {} as Record<string, typeof checks>,
  );

  const toggleCategory = (cat: string) => {
    setExpandedCategories((prev) => ({ ...prev, [cat]: !prev[cat] }));
  };

  // Quick wins
  const quickWins = checks.filter(
    (c) => c.isQuickWin && c.result === "fail",
  );

  return (
    <div className="mx-auto max-w-4xl space-y-8">
      {/* Back link */}
      <Link
        href="/audits"
        className="inline-flex items-center gap-1.5 text-small font-medium text-text-secondary hover:text-brand transition-colors"
      >
        <ArrowLeft className="h-4 w-4" strokeWidth={1.75} />
        Back to audits
      </Link>

      {/* Header */}
      <div className="flex flex-col gap-6 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h1 className="text-h1 font-heading font-bold tracking-tight text-text-primary">
            {a.reportId}
          </h1>
          <p className="mt-1 text-body text-text-secondary">
            {a.customerName ?? a.customerId} &middot;{" "}
            {new Date(a.createdAt).toLocaleDateString("en-US", {
              year: "numeric",
              month: "long",
              day: "numeric",
            })}
          </p>
        </div>

        {/* Actions */}
        {a.status === "completed" && (
          <div className="flex items-center gap-3">
            <Link
              href={`/audit/${auditId}/report`}
              className="inline-flex items-center gap-2 rounded-md bg-brand px-4 py-2 text-small font-medium text-white transition-colors hover:bg-brand-light focus-visible:ring-2 focus-visible:ring-brand focus-visible:ring-offset-2"
            >
              <FileText className="h-4 w-4" strokeWidth={1.75} />
              View Report
            </Link>
            <button
              onClick={handleDownloadPdf}
              disabled={downloading}
              className="inline-flex items-center gap-2 rounded-md border border-brand bg-white px-4 py-2 text-small font-medium text-brand transition-colors hover:bg-brand-wash focus-visible:ring-2 focus-visible:ring-brand focus-visible:ring-offset-2 disabled:opacity-50"
            >
              {downloading ? (
                <Loader2 className="h-4 w-4 animate-spin" strokeWidth={1.75} />
              ) : (
                <Download className="h-4 w-4" strokeWidth={1.75} />
              )}
              Download PDF
            </button>
          </div>
        )}

        {/* Score badge */}
        {a.status === "completed" && a.score !== null && (
          <div className="flex items-center gap-4">
            <div className="text-right">
              <p className="text-caption font-medium uppercase tracking-wider text-text-placeholder">
                Health Score
              </p>
              <p className="text-display font-heading font-bold text-text-primary">
                {formatScore(a.score)}
              </p>
            </div>
            <div
              className={`flex h-16 w-16 items-center justify-center rounded-xl text-h1 font-black ${gradeBg(a.grade ?? "F")}`}
            >
              {a.grade}
            </div>
          </div>
        )}
      </div>

      {/* Status banner for non-completed */}
      {a.status === "running" && (
        <div className="flex items-center gap-3 rounded-lg border border-brand-subtle bg-brand-wash p-4">
          <Loader2 className="h-5 w-5 animate-spin text-brand" />
          <p className="text-small font-medium text-brand">
            Audit is running… this page will update when complete.
          </p>
        </div>
      )}
      {a.status === "failed" && (
        <div className="flex items-center gap-3 rounded-lg border border-red-200 bg-red-50 p-4">
          <XCircle className="h-5 w-5 text-red-600" strokeWidth={1.75} />
          <p className="text-small font-medium text-red-700">
            Audit failed. Check your account connection and try again.
          </p>
        </div>
      )}

      {/* Category breakdown */}
      {Object.keys(categoryScores).length > 0 && (
        <div>
          <h2 className="mb-4 flex items-center gap-2 text-h3 font-semibold text-text-primary">
            <BarChart3 className="h-5 w-5 text-brand" strokeWidth={1.75} />
            Category Scores
          </h2>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {Object.entries(categoryScores).map(([cat, score]) => (
              <div
                key={cat}
                className="rounded-lg border border-border-light bg-white p-4"
              >
                <p className="text-caption font-medium uppercase tracking-wider text-text-placeholder">
                  {cat.replace(/_/g, " ")}
                </p>
                <div className="mt-2 flex items-end gap-2">
                  <span className="text-h2 font-bold text-text-primary">
                    {Math.round(score)}
                  </span>
                  <span className="mb-0.5 text-caption text-text-placeholder">
                    / 100
                  </span>
                </div>
                <div className="mt-2 h-1.5 w-full rounded-full bg-gray-100">
                  <div
                    className="h-1.5 rounded-full bg-brand transition-all"
                    style={{ width: `${Math.min(100, Math.round(score))}%` }}
                  />
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* ── SEO: Pages Crawled ── */}
      {isSeo && seoPages.length > 0 && (
        <div>
          <h2 className="mb-4 flex items-center gap-2 text-h3 font-semibold text-text-primary">
            <Layers className="h-5 w-5 text-brand" strokeWidth={1.75} />
            Pages Crawled
            <span className="rounded-full bg-brand-wash px-2 py-0.5 text-caption font-bold text-brand">
              {seoPages.length}
            </span>
          </h2>
          <div className="grid gap-3 sm:grid-cols-2">
            {seoPages.map((p) => {
              const scoreColor =
                p.score >= 80 ? "text-green-600" : p.score >= 60 ? "text-yellow-600" : p.score >= 40 ? "text-orange-500" : "text-red-600";
              return (
                <div
                  key={p.url}
                  className={cn(
                    "rounded-lg border bg-white p-4 transition-shadow hover:shadow-sm",
                    p.fetchStatus === "error" ? "border-red-200 bg-red-50/30" : "border-border-light",
                  )}
                >
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-small font-semibold text-text-primary" title={p.url}>
                        {p.label || p.url}
                      </p>
                      <a
                        href={p.url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="mt-0.5 inline-flex items-center gap-1 truncate text-caption text-text-placeholder hover:text-brand"
                      >
                        {new URL(p.url).pathname}
                        <ExternalLink className="h-3 w-3 shrink-0" strokeWidth={1.75} />
                      </a>
                    </div>
                    {p.fetchStatus === "ok" && (
                      <div className="text-right shrink-0">
                        <span className={cn("text-h3 font-bold", scoreColor)}>
                          {Math.round(p.score)}
                        </span>
                        <span className="text-caption text-text-placeholder">/100</span>
                      </div>
                    )}
                  </div>
                  {p.fetchStatus === "error" ? (
                    <p className="mt-2 text-caption text-red-600">{p.error ?? "Failed to fetch"}</p>
                  ) : (
                    <div className="mt-3 flex items-center gap-3">
                      <span className="flex items-center gap-1 text-caption font-medium text-green-600">
                        <CheckCircle2 className="h-3.5 w-3.5" /> {p.passCount}
                      </span>
                      {p.failCount > 0 && (
                        <span className="flex items-center gap-1 text-caption font-medium text-red-600">
                          <XCircle className="h-3.5 w-3.5" /> {p.failCount}
                        </span>
                      )}
                      {p.warningCount > 0 && (
                        <span className="flex items-center gap-1 text-caption font-medium text-yellow-600">
                          <AlertTriangle className="h-3.5 w-3.5" /> {p.warningCount}
                        </span>
                      )}
                      <span className="text-caption text-text-placeholder">
                        · {p.source}
                      </span>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* ── SEO: Top Opportunities ── */}
      {isSeo && seoOpportunities.length > 0 && (
        <div>
          <h2 className="mb-4 flex items-center gap-2 text-h3 font-semibold text-text-primary">
            <Globe className="h-5 w-5 text-brand" strokeWidth={1.75} />
            Top Opportunities
          </h2>
          <div className="space-y-2">
            {seoOpportunities.slice(0, 10).map((opp, i) => (
              <div
                key={`${opp.checkId}-${i}`}
                className="rounded-lg border border-border-light bg-white p-4"
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0 flex-1">
                    <p className="text-small font-semibold text-text-primary">
                      {opp.description}
                    </p>
                    {opp.recommendation && (
                      <p className="mt-1 text-caption text-text-secondary">
                        {opp.recommendation}
                      </p>
                    )}
                  </div>
                  <div className="shrink-0 text-right">
                    <span className={cn(
                      "rounded-full px-2 py-0.5 text-caption font-bold",
                      opp.severity === "critical" ? "bg-red-50 text-red-700" :
                      opp.severity === "high" ? "bg-orange-50 text-orange-700" :
                      "bg-yellow-50 text-yellow-700",
                    )}>
                      {opp.affectedPages}/{opp.totalPages} pages
                    </span>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Quick Wins */}
      {quickWins.length > 0 && (
        <div>
          <h2 className="mb-4 flex items-center gap-2 text-h3 font-semibold text-text-primary">
            <Zap className="h-5 w-5 text-yellow-500" strokeWidth={1.75} />
            Quick Wins
            <span className="rounded-full bg-yellow-50 px-2 py-0.5 text-caption font-bold text-yellow-700">
              {quickWins.length}
            </span>
          </h2>
          <div className="space-y-2">
            {quickWins.map((qw) => (
              <div
                key={qw.id}
                className="rounded-lg border border-yellow-200 bg-yellow-50/50 p-4"
              >
                <div className="flex items-start gap-3">
                  <Zap
                    className="mt-0.5 h-4 w-4 shrink-0 text-yellow-500"
                    strokeWidth={1.75}
                  />
                  <div>
                    <p className="text-small font-semibold text-text-primary">
                      [{qw.checkId}] {qw.description}
                    </p>
                    {qw.recommendation && (
                      <p className="mt-1 text-small text-text-secondary">
                        {qw.recommendation}
                      </p>
                    )}
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Detailed Checks by Category */}
      {Object.keys(grouped).length > 0 && (
        <div>
          <h2 className="mb-4 text-h3 font-semibold text-text-primary">
            All Checks ({checks.length})
          </h2>
          <div className="space-y-2">
            {Object.entries(grouped).map(([category, catChecks]) => {
              const isOpen = expandedCategories[category] ?? false;
              const passCount = catChecks.filter(
                (c) => c.result === "pass",
              ).length;
              const failCount = catChecks.filter(
                (c) => c.result === "fail",
              ).length;

              return (
                <div
                  key={category}
                  className="overflow-hidden rounded-lg border border-border-light bg-white"
                >
                  <button
                    onClick={() => toggleCategory(category)}
                    className="flex w-full items-center justify-between px-4 py-3 text-left transition-colors hover:bg-brand-wash/30"
                  >
                    <div className="flex items-center gap-3">
                      {isOpen ? (
                        <ChevronDown
                          className="h-4 w-4 text-text-placeholder"
                          strokeWidth={1.75}
                        />
                      ) : (
                        <ChevronRight
                          className="h-4 w-4 text-text-placeholder"
                          strokeWidth={1.75}
                        />
                      )}
                      <span className="text-small font-semibold text-text-primary">
                        {category.replace(/_/g, " ")}
                      </span>
                      <span className="text-caption text-text-placeholder">
                        ({catChecks.length} checks)
                      </span>
                    </div>
                    <div className="flex items-center gap-2">
                      {passCount > 0 && (
                        <span className="flex items-center gap-1 text-caption text-green-600">
                          <CheckCircle2 className="h-3.5 w-3.5" />
                          {passCount}
                        </span>
                      )}
                      {failCount > 0 && (
                        <span className="flex items-center gap-1 text-caption text-red-600">
                          <XCircle className="h-3.5 w-3.5" />
                          {failCount}
                        </span>
                      )}
                    </div>
                  </button>

                  {isOpen && (
                    <div className="divide-y divide-border-light border-t border-border-light">
                      {catChecks.map((check) => (
                        <div
                          key={check.id}
                          className="flex items-start gap-3 px-4 py-3"
                        >
                          {severityIcon[check.severity ?? "info"]}
                          <div className="min-w-0 flex-1">
                            <div className="flex items-center gap-2">
                              <span className="text-caption font-mono text-text-placeholder">
                                {check.checkId}
                              </span>
                              <span
                                className={`rounded border px-1.5 py-0.5 text-[11px] font-bold uppercase ${resultBadge[check.result ?? "info"]}`}
                              >
                                {check.result}
                              </span>
                              <span className="text-[11px] text-text-placeholder">
                                {severityLabel[check.severity ?? "info"]}
                              </span>
                            </div>
                            <p className="mt-0.5 text-small font-medium text-text-primary">
                              {check.description}
                            </p>
                            {check.recommendation &&
                              check.result === "fail" && (
                                <p className="mt-1 text-caption text-text-secondary">
                                  💡 {check.recommendation}
                                </p>
                              )}
                            {check.details &&
                              check.result !== "pass" && (() => {
                                const lines = check.details.split("\n").filter((l: string) => l.trim());
                                if (lines.length === 0) return null;
                                return (
                                  <div className="mt-2 space-y-1 rounded-md border border-border-light bg-brand-wash/40 px-3 py-2">
                                    {lines.map((line: string, i: number) => (
                                      <div
                                        key={i}
                                        className="flex items-start gap-2 text-caption text-text-secondary"
                                      >
                                        <span className="mt-0.5 shrink-0 text-text-placeholder">
                                          {line.startsWith("…") ? "" : "›"}
                                        </span>
                                        <span className="font-mono text-[11px] leading-relaxed">
                                          {line}
                                        </span>
                                      </div>
                                    ))}
                                  </div>
                                );
                              })()}
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
