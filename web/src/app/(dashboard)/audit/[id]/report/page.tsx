"use client";

import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import { trpc } from "@/lib/trpc";
import { formatScore, gradeColor, gradeBg, cn } from "@/lib/utils";
import { useState, useRef, useCallback, useEffect } from "react";
import {
  ArrowLeft,
  Loader2,
  XCircle,
  AlertTriangle,
  CheckCircle2,
  Info,
  Zap,
  BarChart3,
  ChevronDown,
  ChevronRight,
  Download,
  Printer,
  Target,
  TrendingUp,
  DollarSign,
  FileText,
  ArrowUp,
  ClipboardList,
} from "lucide-react";
import { SterlingXLogo } from "@/components/ui/sterlingx-logo";

/* ────────────────────────────────────────────────────────────
 *  TYPES
 * ──────────────────────────────────────────────────────────── */

interface CategoryAnalysis {
  category: string;
  score: number;
  headline: string;
  narrative: string;
  criticalFindings: string[];
  actionItems: string[];
}

interface AIAnalysis {
  executiveSummary?: string;
  overallAssessment?: string;
  categoryAnalyses?: CategoryAnalysis[];
  priorityActions?: {
    immediate: string[];
    nearTerm: string[];
    strategic: string[];
  };
  wastedSpendInsights?: string;
  estimatedImpact?: string;
}

interface AuditCheck {
  id: string;
  checkId: string;
  category: string | null;
  description: string | null;
  result: string | null;
  severity: string | null;
  details: string | null;
  recommendation: string | null;
  isQuickWin: boolean | null;
  estimatedFixMinutes: number | null;
}

/* ────────────────────────────────────────────────────────────
 *  CONSTANTS
 * ──────────────────────────────────────────────────────────── */

const CATEGORIES = [
  { key: "Conversion Tracking", weight: "25%" },
  { key: "Wasted Spend", weight: "20%" },
  { key: "Account Structure", weight: "15%" },
  { key: "Keywords & Quality Score", weight: "15%" },
  { key: "Ads & Assets", weight: "15%" },
  { key: "Settings & Targeting", weight: "10%" },
  { key: "SterlingX Governance", weight: "" },
  { key: "SterlingX Reporting", weight: "" },
  { key: "SterlingX Operations", weight: "" },
];

const NAV_SECTIONS = [
  { id: "summary", label: "Executive Summary", icon: FileText },
  { id: "categories", label: "Category Scores", icon: BarChart3 },
  { id: "details", label: "Detailed Findings", icon: Target },
  { id: "quickwins", label: "Quick Wins", icon: Zap },
  { id: "actions", label: "Action Plan", icon: TrendingUp },
  { id: "matrix", label: "Summary Matrix", icon: BarChart3 },
];

const severityOrder: Record<string, number> = {
  critical: 0,
  high: 1,
  medium: 2,
  low: 3,
  info: 4,
};

const severityClasses: Record<string, string> = {
  critical: "bg-red-100 text-red-800 border-red-200",
  high: "bg-orange-100 text-orange-800 border-orange-200",
  medium: "bg-yellow-100 text-yellow-800 border-yellow-200",
  low: "bg-blue-100 text-blue-800 border-blue-200",
  info: "bg-gray-100 text-gray-600 border-gray-200",
};

const resultClasses: Record<string, string> = {
  pass: "bg-emerald/10 text-emerald border-emerald/20",
  fail: "bg-signal/10 text-signal border-signal/20",
  warning: "bg-harvest/10 text-harvest border-harvest/20",
  manual: "bg-purple-100 text-purple-700 border-purple-200",
  info: "bg-blue-50 text-blue-700 border-blue-200",
  "not-applicable": "bg-gray-50 text-gray-500 border-gray-200",
};

/* ────────────────────────────────────────────────────────────
 *  HELPER COMPONENTS
 * ──────────────────────────────────────────────────────────── */

function SectionHeading({
  id,
  icon: Icon,
  children,
}: {
  id: string;
  icon: React.ComponentType<{ className?: string; strokeWidth?: number }>;
  children: React.ReactNode;
}) {
  return (
    <h2
      id={id}
      className="scroll-mt-24 flex items-center gap-3 text-h2 font-heading font-bold tracking-tight text-text-primary print:text-xl"
    >
      <Icon className="h-6 w-6 text-brand" strokeWidth={1.75} />
      {children}
    </h2>
  );
}

function Badge({
  children,
  className,
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <span
      className={cn(
        "inline-flex items-center rounded-md border px-2 py-0.5 text-xs font-bold uppercase",
        className,
      )}
    >
      {children}
    </span>
  );
}

function ScoreRing({
  score,
  grade,
  size = "lg",
}: {
  score: number;
  grade: string;
  size?: "sm" | "lg";
}) {
  const radius = size === "lg" ? 54 : 32;
  const stroke = size === "lg" ? 8 : 5;
  const circumference = 2 * Math.PI * radius;
  const progress = (Math.min(100, Math.max(0, score)) / 100) * circumference;
  const svgSize = (radius + stroke) * 2;

  const gradeColorMap: Record<string, string> = {
    A: "#4AA988",
    B: "#4AA988",
    C: "#EEAE22",
    D: "#F97316",
    F: "#C6385A",
  };
  const color = gradeColorMap[grade] ?? "#193762";

  return (
    <div className="relative flex items-center justify-center">
      <svg width={svgSize} height={svgSize} className="-rotate-90">
        <circle
          cx={radius + stroke}
          cy={radius + stroke}
          r={radius}
          fill="none"
          stroke="#E8E8E8"
          strokeWidth={stroke}
        />
        <circle
          cx={radius + stroke}
          cy={radius + stroke}
          r={radius}
          fill="none"
          stroke={color}
          strokeWidth={stroke}
          strokeDasharray={circumference}
          strokeDashoffset={circumference - progress}
          strokeLinecap="round"
          className="transition-all duration-1000 ease-out"
        />
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center">
        <span
          className={cn(
            "font-heading font-black",
            size === "lg" ? "text-4xl" : "text-lg",
          )}
          style={{ color }}
        >
          {grade}
        </span>
        <span
          className={cn(
            "font-semibold text-text-secondary",
            size === "lg" ? "text-sm" : "text-xs",
          )}
        >
          {formatScore(score)}/100
        </span>
      </div>
    </div>
  );
}

function ProgressBar({
  value,
  max = 100,
  className,
}: {
  value: number;
  max?: number;
  className?: string;
}) {
  const pct = Math.min(100, (value / max) * 100);
  const color =
    pct >= 80
      ? "#4AA988"
      : pct >= 60
        ? "#EEAE22"
        : pct >= 40
          ? "#F97316"
          : "#C6385A";
  return (
    <div
      className={cn("h-2 w-full rounded-full bg-gray-100", className)}
    >
      <div
        className="h-2 rounded-full transition-all duration-700"
        style={{ width: `${pct}%`, backgroundColor: color }}
      />
    </div>
  );
}

/* ────────────────────────────────────────────────────────────
 *  MAIN PAGE
 * ──────────────────────────────────────────────────────────── */

export default function AuditReportPage() {
  const params = useParams();
  const router = useRouter();
  const auditId = params.id as string;
  const audit = trpc.audit.get.useQuery({ id: auditId });

  const [expandedSections, setExpandedSections] = useState<
    Record<string, boolean>
  >({});
  const [downloading, setDownloading] = useState(false);
  const [activeSection, setActiveSection] = useState("summary");
  const reportRef = useRef<HTMLDivElement>(null);

  // ── Scroll spy ──
  useEffect(() => {
    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (entry.isIntersecting) {
            setActiveSection(entry.target.id);
          }
        }
      },
      { rootMargin: "-100px 0px -60% 0px", threshold: 0.1 },
    );
    const ids = NAV_SECTIONS.map((s) => s.id);
    for (const id of ids) {
      const el = document.getElementById(id);
      if (el) observer.observe(el);
    }
    return () => observer.disconnect();
  }, [audit.data]);

  const scrollTo = useCallback((id: string) => {
    document.getElementById(id)?.scrollIntoView({ behavior: "smooth" });
  }, []);

  const handlePrint = useCallback(() => window.print(), []);

  const handleDownloadPdf = useCallback(async () => {
    setDownloading(true);
    try {
      const res = await fetch(`/api/audit/${auditId}/pdf`);
      if (!res.ok) throw new Error("Download failed");
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download =
        res.headers.get("Content-Disposition")?.match(/filename="(.+)"/)?.[1] ??
        "audit-report.pdf";
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

  const toggleSection = (key: string) => {
    setExpandedSections((prev) => ({ ...prev, [key]: !prev[key] }));
  };

  // ── Loading ──
  if (audit.isLoading) {
    return (
      <div className="flex min-h-[60vh] items-center justify-center">
        <div className="text-center">
          <Loader2 className="mx-auto h-10 w-10 animate-spin text-brand" />
          <p className="mt-4 text-body text-text-secondary">
            Loading report…
          </p>
        </div>
      </div>
    );
  }

  // ── Error ──
  if (audit.error || !audit.data) {
    return (
      <div className="mx-auto max-w-3xl py-16 text-center">
        <XCircle className="mx-auto mb-4 h-12 w-12 text-signal" />
        <h2 className="text-h2 font-heading font-bold text-text-primary">
          Report not found
        </h2>
        <p className="mt-2 text-body text-text-secondary">
          {audit.error?.message ??
            "This audit doesn't exist or isn't completed yet."}
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
  const ai = (a.aiAnalysis as AIAnalysis) ?? {};
  const categoryScores: Record<string, number> =
    ((a.rawData as Record<string, unknown>)?.categoryScores as Record<
      string,
      number
    >) ?? {};

  // Group checks by category
  const grouped: Record<string, AuditCheck[]> = {};
  for (const c of checks) {
    const cat = c.category ?? "Other";
    if (!grouped[cat]) grouped[cat] = [];
    grouped[cat].push(c as AuditCheck);
  }

  // Quick wins (failed + marked quick_win)
  const quickWins = (checks as AuditCheck[]).filter(
    (c) => c.isQuickWin && c.result === "fail",
  );

  // Stats
  const passCount = checks.filter((c) => c.result === "pass").length;
  const failCount = checks.filter((c) => c.result === "fail").length;
  const warnCount = checks.filter((c) => c.result === "warning").length;
  const manualCount = checks.filter((c) => c.result === "manual").length;

  return (
    <>
      {/* ── Sticky Nav (desktop) ── */}
      <nav className="fixed left-0 top-16 z-30 hidden w-56 border-r border-border-light bg-white/95 backdrop-blur lg:block print:hidden"
        style={{ height: "calc(100vh - 4rem)" }}
      >
        <div className="flex h-full flex-col justify-between p-4">
          <div className="space-y-1">
            <p className="mb-3 text-caption font-bold uppercase tracking-wider text-text-placeholder">
              Report Sections
            </p>
            {NAV_SECTIONS.map((s) => (
              <button
                key={s.id}
                onClick={() => scrollTo(s.id)}
                className={cn(
                  "flex w-full items-center gap-2 rounded-md px-3 py-2 text-left text-small transition-colors",
                  activeSection === s.id
                    ? "bg-brand-wash font-semibold text-brand"
                    : "text-text-secondary hover:bg-brand-wash/50 hover:text-brand",
                )}
              >
                <s.icon className="h-4 w-4 shrink-0" strokeWidth={1.75} />
                {s.label}
              </button>
            ))}
          </div>
          <div className="space-y-2 border-t border-border-light pt-4">
            <button
              onClick={handlePrint}
              className="flex w-full items-center gap-2 rounded-md px-3 py-2 text-small text-text-secondary transition-colors hover:bg-brand-wash/50 hover:text-brand"
            >
              <Printer className="h-4 w-4" strokeWidth={1.75} />
              Print Report
            </button>
            <button
              onClick={handleDownloadPdf}
              disabled={downloading}
              className="flex w-full items-center gap-2 rounded-md px-3 py-2 text-small text-text-secondary transition-colors hover:bg-brand-wash/50 hover:text-brand disabled:opacity-50"
            >
              {downloading ? (
                <Loader2 className="h-4 w-4 animate-spin" strokeWidth={1.75} />
              ) : (
                <Download className="h-4 w-4" strokeWidth={1.75} />
              )}
              Download PDF
            </button>
          </div>
        </div>
      </nav>

      {/* ── Report Content ── */}
      <div ref={reportRef} className="lg:ml-56 print:ml-0">
        <div className="mx-auto max-w-4xl space-y-12 pb-20">

          {/* Back link */}
          <div className="flex items-center justify-between print:hidden">
            <Link
              href={`/audit/${auditId}`}
              className="inline-flex items-center gap-1.5 text-small font-medium text-text-secondary transition-colors hover:text-brand"
            >
              <ArrowLeft className="h-4 w-4" strokeWidth={1.75} />
              Back to audit
            </Link>
            <div className="flex items-center gap-2 lg:hidden">
              <button
                onClick={handlePrint}
                className="rounded-md border border-border-light p-2 text-text-secondary transition-colors hover:text-brand"
              >
                <Printer className="h-4 w-4" strokeWidth={1.75} />
              </button>
              <button
                onClick={handleDownloadPdf}
                disabled={downloading}
                className="rounded-md border border-border-light p-2 text-text-secondary transition-colors hover:text-brand disabled:opacity-50"
              >
                {downloading ? (
                  <Loader2 className="h-4 w-4 animate-spin" strokeWidth={1.75} />
                ) : (
                  <Download className="h-4 w-4" strokeWidth={1.75} />
                )}
              </button>
            </div>
          </div>

          {/* ════════════════════════════════════════════════════
           *  COVER / HEADER
           * ════════════════════════════════════════════════════ */}
          <header className="rounded-xl border border-border-light bg-white p-8 shadow-sm print:border-0 print:shadow-none">
            <div className="flex flex-col gap-8 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <div className="mb-4">
                  <SterlingXLogo size={28} />
                </div>
                <p className="text-caption font-bold uppercase tracking-widest text-brand">
                  Google Ads Audit Report
                </p>
                <h1 className="mt-2 text-display font-heading font-bold tracking-tight text-text-primary">
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

              {a.score !== null && (
                <ScoreRing
                  score={a.score}
                  grade={a.grade ?? "F"}
                  size="lg"
                />
              )}
            </div>

            {/* Quick stats bar */}
            <div className="mt-8 grid grid-cols-2 gap-4 border-t border-border-light pt-6 sm:grid-cols-4">
              <div>
                <p className="text-caption font-medium text-text-placeholder">
                  Total Checks
                </p>
                <p className="text-h2 font-bold text-text-primary">
                  {checks.length}
                </p>
              </div>
              <div>
                <p className="text-caption font-medium text-text-placeholder">
                  Passed
                </p>
                <p className="text-h2 font-bold text-emerald">{passCount}</p>
              </div>
              <div>
                <p className="text-caption font-medium text-text-placeholder">
                  Failed
                </p>
                <p className="text-h2 font-bold text-signal">{failCount}</p>
              </div>
              <div>
                <p className="text-caption font-medium text-text-placeholder">
                  Warnings
                </p>
                <p className="text-h2 font-bold text-harvest">{warnCount}</p>
              </div>
              {manualCount > 0 && (
                <div>
                  <p className="text-caption font-medium text-text-placeholder">
                    Manual
                  </p>
                  <p className="text-h2 font-bold text-purple-600">{manualCount}</p>
                </div>
              )}
            </div>
          </header>

          {/* ════════════════════════════════════════════════════
           *  EXECUTIVE SUMMARY
           * ════════════════════════════════════════════════════ */}
          <section id="summary" className="space-y-6 print:break-before-page">
            <SectionHeading id="summary-heading" icon={FileText}>
              Executive Summary
            </SectionHeading>

            {ai.executiveSummary && (
              <div className="rounded-lg border border-brand/10 bg-brand-wash/30 p-6">
                <p className="whitespace-pre-line text-body leading-relaxed text-text-primary">
                  {ai.executiveSummary}
                </p>
              </div>
            )}

            {ai.overallAssessment && (
              <div className="rounded-lg border border-border-light bg-white p-6">
                <h3 className="mb-3 text-h3 font-heading font-semibold text-text-primary">
                  Overall Assessment
                </h3>
                <p className="whitespace-pre-line text-body leading-relaxed text-text-secondary">
                  {ai.overallAssessment}
                </p>
              </div>
            )}

            {ai.estimatedImpact && (
              <div className="flex items-start gap-3 rounded-lg border border-emerald/20 bg-emerald/5 p-5">
                <TrendingUp className="mt-0.5 h-5 w-5 shrink-0 text-emerald" strokeWidth={1.75} />
                <div>
                  <p className="text-small font-bold text-emerald">
                    Estimated Impact
                  </p>
                  <p className="mt-1 whitespace-pre-line text-small text-text-primary">
                    {ai.estimatedImpact}
                  </p>
                </div>
              </div>
            )}
          </section>

          {/* ════════════════════════════════════════════════════
           *  CATEGORY SCORES
           * ════════════════════════════════════════════════════ */}
          {Object.keys(categoryScores).length > 0 && (
            <section id="categories" className="space-y-6">
              <SectionHeading id="categories-heading" icon={BarChart3}>
                Category Scores
              </SectionHeading>

              <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                {CATEGORIES.map((cat) => {
                  const score = categoryScores[cat.key] ?? 0;
                  const catAnalysis = ai.categoryAnalyses?.find(
                    (ca) => ca.category === cat.key,
                  );
                  return (
                    <div
                      key={cat.key}
                      className="group rounded-lg border border-border-light bg-white p-5 transition-shadow hover:shadow-md"
                    >
                      <div className="flex items-start justify-between">
                        <div className="flex-1">
                          <p className="text-caption font-bold uppercase tracking-wider text-text-placeholder">
                            {cat.key}
                          </p>
                          {cat.weight && (
                            <p className="text-[11px] text-text-placeholder">
                              Weight: {cat.weight}
                            </p>
                          )}
                        </div>
                        <div className="text-right">
                          <span className="text-h2 font-bold text-text-primary">
                            {Math.round(score)}
                          </span>
                          <span className="text-caption text-text-placeholder">
                            /100
                          </span>
                        </div>
                      </div>
                      <ProgressBar value={score} className="mt-3" />
                      {catAnalysis?.headline && (
                        <p className="mt-3 text-caption leading-snug text-text-secondary">
                          {catAnalysis.headline}
                        </p>
                      )}
                    </div>
                  );
                })}
              </div>
            </section>
          )}

          {/* ════════════════════════════════════════════════════
           *  DETAILED FINDINGS (per category)
           * ════════════════════════════════════════════════════ */}
          <section id="details" className="space-y-6 print:break-before-page">
            <SectionHeading id="details-heading" icon={Target}>
              Detailed Findings
            </SectionHeading>

            <div className="space-y-4">
              {CATEGORIES.map((cat, catIdx) => {
                const catChecks = grouped[cat.key];
                if (!catChecks || catChecks.length === 0) return null;

                const isOpen = expandedSections[cat.key] ?? true; // all open by default
                const catPass = catChecks.filter((c) => c.result === "pass").length;
                const catFail = catChecks.filter((c) => c.result === "fail").length;
                const catWarn = catChecks.filter((c) => c.result === "warning").length;
                const catManual = catChecks.filter((c) => c.result === "manual").length;
                const catScore = categoryScores[cat.key];
                const catAnalysis = ai.categoryAnalyses?.find(
                  (ca) => ca.category === cat.key,
                );

                // Sort: failures first, then by severity
                const sorted = [...catChecks].sort((a, b) => {
                  const aFail = a.result === "fail" ? 0 : a.result === "warning" ? 1 : a.result === "manual" ? 2 : 3;
                  const bFail = b.result === "fail" ? 0 : b.result === "warning" ? 1 : b.result === "manual" ? 2 : 3;
                  if (aFail !== bFail) return aFail - bFail;
                  return (severityOrder[a.severity ?? "info"] ?? 4) -
                    (severityOrder[b.severity ?? "info"] ?? 4);
                });

                return (
                  <div
                    key={cat.key}
                    className="overflow-hidden rounded-lg border border-border-light bg-white print:break-inside-avoid"
                  >
                    {/* Category header */}
                    <button
                      onClick={() => toggleSection(cat.key)}
                      className="flex w-full items-center justify-between px-5 py-4 text-left transition-colors hover:bg-brand-wash/30 print:hover:bg-transparent"
                    >
                      <div className="flex items-center gap-3">
                        {isOpen ? (
                          <ChevronDown className="h-5 w-5 text-text-placeholder print:hidden" strokeWidth={1.75} />
                        ) : (
                          <ChevronRight className="h-5 w-5 text-text-placeholder print:hidden" strokeWidth={1.75} />
                        )}
                        <div>
                          <span className="text-body font-bold text-text-primary">
                            Section {catIdx + 1} — {cat.key}
                          </span>
                          {cat.weight && (
                            <span className="ml-2 text-caption text-text-placeholder">
                              ({cat.weight})
                            </span>
                          )}
                        </div>
                      </div>
                      <div className="flex items-center gap-3">
                        {catScore !== undefined && (
                          <span className="text-small font-bold text-text-primary">
                            {Math.round(catScore)}/100
                          </span>
                        )}
                        <div className="flex items-center gap-2">
                          {catPass > 0 && (
                            <span className="flex items-center gap-1 text-caption font-medium text-emerald">
                              <CheckCircle2 className="h-3.5 w-3.5" />
                              {catPass}
                            </span>
                          )}
                          {catFail > 0 && (
                            <span className="flex items-center gap-1 text-caption font-medium text-signal">
                              <XCircle className="h-3.5 w-3.5" />
                              {catFail}
                            </span>
                          )}
                          {catWarn > 0 && (
                            <span className="flex items-center gap-1 text-caption font-medium text-harvest">
                              <AlertTriangle className="h-3.5 w-3.5" />
                              {catWarn}
                            </span>
                          )}
                          {catManual > 0 && (
                            <span className="flex items-center gap-1 text-caption font-medium text-purple-600">
                              <ClipboardList className="h-3.5 w-3.5" />
                              {catManual}
                            </span>
                          )}
                        </div>
                      </div>
                    </button>

                    {/* Expanded content */}
                    {isOpen && (
                      <div className="border-t border-border-light">
                        {/* Check table */}
                        <div className="overflow-x-auto">
                          <table className="w-full text-small">
                            <thead>
                              <tr className="bg-brand/5">
                                <th className="px-5 py-2.5 text-left text-caption font-bold uppercase tracking-wider text-text-placeholder">
                                  Check
                                </th>
                                <th className="px-3 py-2.5 text-left text-caption font-bold uppercase tracking-wider text-text-placeholder">
                                  Status
                                </th>
                                <th className="px-3 py-2.5 text-left text-caption font-bold uppercase tracking-wider text-text-placeholder">
                                  Severity
                                </th>
                                <th className="px-5 py-2.5 text-left text-caption font-bold uppercase tracking-wider text-text-placeholder">
                                  Finding
                                </th>
                              </tr>
                            </thead>
                            <tbody className="divide-y divide-border-light">
                              {sorted.map((check, i) => (
                                <tr
                                  key={check.id}
                                  className={cn(
                                    "transition-colors",
                                    i % 2 === 1
                                      ? "bg-brand-wash/20"
                                      : "bg-white",
                                  )}
                                >
                                  <td className="whitespace-nowrap px-5 py-3">
                                    <span className="font-mono text-caption text-text-placeholder">
                                      {check.checkId}
                                    </span>
                                    <p className="mt-0.5 text-small font-medium text-text-primary">
                                      {check.description}
                                    </p>
                                  </td>
                                  <td className="px-3 py-3">
                                    <Badge
                                      className={
                                        resultClasses[check.result ?? "info"]
                                      }
                                    >
                                      {check.result}
                                    </Badge>
                                  </td>
                                  <td className="px-3 py-3">
                                    <Badge
                                      className={
                                        severityClasses[check.severity ?? "info"]
                                      }
                                    >
                                      {check.severity}
                                    </Badge>
                                  </td>
                                  <td className="max-w-xs px-5 py-3">
                                    {check.details && (
                                      <p className="text-caption text-text-secondary">
                                        {check.details}
                                      </p>
                                    )}
                                    {check.recommendation &&
                                      (check.result === "fail" || check.result === "manual") && (
                                        <p className="mt-1 text-caption text-brand">
                                          💡 {check.recommendation}
                                        </p>
                                      )}
                                  </td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        </div>

                        {/* Category Analysis: AI narrative or derived from checks */}
                        {(() => {
                          const failedChecks = sorted.filter((c) => c.result === "fail");
                          const warnChecks = sorted.filter((c) => c.result === "warning");
                          const manualChecks = sorted.filter((c) => c.result === "manual");
                          const issueChecks = [...failedChecks, ...warnChecks, ...manualChecks];
                          const derivedFindings = issueChecks.map((c) => `[${c.checkId}] ${c.description}: ${c.details ?? (c.result === "fail" ? "Failed" : c.result === "manual" ? "Manual review required" : "Needs attention")}`);
                          const derivedActions = issueChecks.filter((c) => c.recommendation).map((c) => c.recommendation!);
                          const derivedNarrative =
                            catFail > 0
                              ? `${cat.key} has ${catFail} failed check${catFail !== 1 ? "s" : ""} and ${catWarn} warning${catWarn !== 1 ? "s" : ""} out of ${catChecks.length} total. ${failedChecks.map((c) => c.description).join(", ")}. Address the failed checks above to improve this category's score.`
                              : catWarn > 0
                                ? `${cat.key} passed ${catPass} of ${catChecks.length} checks with ${catWarn} warning${catWarn !== 1 ? "s" : ""} requiring attention: ${warnChecks.map((c) => c.description).join(", ")}. Review and resolve these warnings to strengthen this category.`
                                : `${cat.key} is in excellent shape — all ${catChecks.length} checks passed.`;

                          const findings = (catAnalysis?.criticalFindings?.length ?? 0) > 0 ? catAnalysis!.criticalFindings : derivedFindings;
                          const actions = (catAnalysis?.actionItems?.length ?? 0) > 0 ? catAnalysis!.actionItems : derivedActions;
                          const narrative = catAnalysis?.narrative || derivedNarrative;
                          const hasAiFindings = (catAnalysis?.criticalFindings?.length ?? 0) > 0;

                          return (findings.length > 0 || actions.length > 0 || narrative) ? (
                            <div className="border-t border-border-light px-5 py-5">
                              {findings.length > 0 && (
                                <div className="mb-4">
                                  <h4 className={`mb-2 text-small font-bold ${hasAiFindings || catFail > 0 ? "text-signal" : "text-harvest"}`}>
                                    {hasAiFindings ? "Critical Findings" : catFail > 0 ? "Critical Findings" : "Key Findings"}
                                  </h4>
                                  <ul className="space-y-1">
                                    {findings.map((f, i) => (
                                      <li
                                        key={i}
                                        className="flex items-start gap-2 text-small text-text-primary"
                                      >
                                        {hasAiFindings || catFail > 0 ? (
                                          <XCircle className="mt-0.5 h-3.5 w-3.5 shrink-0 text-signal" />
                                        ) : (
                                          <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0 text-harvest" />
                                        )}
                                        {f}
                                      </li>
                                    ))}
                                  </ul>
                                </div>
                              )}

                              {actions.length > 0 && (
                                <div className="mb-4">
                                  <h4 className="mb-2 text-small font-bold text-brand">
                                    Action Items
                                  </h4>
                                  <ul className="space-y-1">
                                    {actions.map((item, i) => (
                                      <li
                                        key={i}
                                        className="flex items-start gap-2 text-small text-text-primary"
                                      >
                                        <ChevronRight className="mt-0.5 h-3.5 w-3.5 shrink-0 text-brand" />
                                        {item}
                                      </li>
                                    ))}
                                  </ul>
                                </div>
                              )}

                              {narrative && (
                                <div className="rounded-md bg-brand-wash/30 p-4">
                                  <p className="text-caption font-bold uppercase tracking-wider text-text-placeholder">
                                    Analysis
                                  </p>
                                  <p className="mt-2 whitespace-pre-line text-small leading-relaxed text-text-secondary">
                                    {narrative}
                                  </p>
                                </div>
                              )}
                            </div>
                          ) : null;
                        })()}
                      </div>
                    )}
                  </div>
                );
              })}

              {/* Other categories not in the standard list */}
              {Object.entries(grouped)
                .filter(
                  ([cat]) => !CATEGORIES.some((c) => c.key === cat),
                )
                .map(([cat, catChecks], extraIdx) => {
                  const isOpen = expandedSections[cat] ?? true;
                  const catPass = catChecks.filter((c) => c.result === "pass").length;
                  const catFail = catChecks.filter((c) => c.result === "fail").length;
                  const catWarn = catChecks.filter((c) => c.result === "warning").length;
                  const catManual = catChecks.filter((c) => c.result === "manual").length;
                  const catScore = categoryScores[cat];
                  const catAnalysis = ai.categoryAnalyses?.find(
                    (ca) => ca.category === cat,
                  );
                  const sorted = [...catChecks].sort((a, b) => {
                    const aFail = a.result === "fail" ? 0 : a.result === "warning" ? 1 : a.result === "manual" ? 2 : 3;
                    const bFail = b.result === "fail" ? 0 : b.result === "warning" ? 1 : b.result === "manual" ? 2 : 3;
                    if (aFail !== bFail) return aFail - bFail;
                    return (severityOrder[a.severity ?? "info"] ?? 4) -
                      (severityOrder[b.severity ?? "info"] ?? 4);
                  });

                  return (
                    <div
                      key={cat}
                      className="overflow-hidden rounded-lg border border-border-light bg-white print:break-inside-avoid"
                    >
                      {/* Category header */}
                      <button
                        onClick={() => toggleSection(cat)}
                        className="flex w-full items-center justify-between px-5 py-4 text-left transition-colors hover:bg-brand-wash/30 print:hover:bg-transparent"
                      >
                        <div className="flex items-center gap-3">
                          {isOpen ? (
                            <ChevronDown className="h-5 w-5 text-text-placeholder print:hidden" strokeWidth={1.75} />
                          ) : (
                            <ChevronRight className="h-5 w-5 text-text-placeholder print:hidden" strokeWidth={1.75} />
                          )}
                          <div>
                            <span className="text-body font-bold text-text-primary">
                              Section {CATEGORIES.length + extraIdx + 1} — {cat}
                            </span>
                          </div>
                        </div>
                        <div className="flex items-center gap-3">
                          {catScore !== undefined && (
                            <span className="text-small font-bold text-text-primary">
                              {Math.round(catScore)}/100
                            </span>
                          )}
                          <div className="flex items-center gap-2">
                            {catPass > 0 && (
                              <span className="flex items-center gap-1 text-caption font-medium text-emerald">
                                <CheckCircle2 className="h-3.5 w-3.5" />
                                {catPass}
                              </span>
                            )}
                            {catFail > 0 && (
                              <span className="flex items-center gap-1 text-caption font-medium text-signal">
                                <XCircle className="h-3.5 w-3.5" />
                                {catFail}
                              </span>
                            )}
                            {catWarn > 0 && (
                              <span className="flex items-center gap-1 text-caption font-medium text-harvest">
                                <AlertTriangle className="h-3.5 w-3.5" />
                                {catWarn}
                              </span>
                            )}
                            {catManual > 0 && (
                              <span className="flex items-center gap-1 text-caption font-medium text-purple-600">
                                <ClipboardList className="h-3.5 w-3.5" />
                                {catManual}
                              </span>
                            )}
                          </div>
                        </div>
                      </button>

                      {/* Expanded content */}
                      {isOpen && (
                        <div className="border-t border-border-light">
                          {/* Check table */}
                          <div className="overflow-x-auto">
                            <table className="w-full text-small">
                              <thead>
                                <tr className="bg-brand/5">
                                  <th className="px-5 py-2.5 text-left text-caption font-bold uppercase tracking-wider text-text-placeholder">
                                    Check
                                  </th>
                                  <th className="px-3 py-2.5 text-left text-caption font-bold uppercase tracking-wider text-text-placeholder">
                                    Status
                                  </th>
                                  <th className="px-3 py-2.5 text-left text-caption font-bold uppercase tracking-wider text-text-placeholder">
                                    Severity
                                  </th>
                                  <th className="px-5 py-2.5 text-left text-caption font-bold uppercase tracking-wider text-text-placeholder">
                                    Finding
                                  </th>
                                </tr>
                              </thead>
                              <tbody className="divide-y divide-border-light">
                                {sorted.map((check, i) => (
                                  <tr
                                    key={check.id}
                                    className={cn(
                                      "transition-colors",
                                      i % 2 === 1
                                        ? "bg-brand-wash/20"
                                        : "bg-white",
                                    )}
                                  >
                                    <td className="whitespace-nowrap px-5 py-3">
                                      <span className="font-mono text-caption text-text-placeholder">
                                        {check.checkId}
                                      </span>
                                      <p className="mt-0.5 text-small font-medium text-text-primary">
                                        {check.description}
                                      </p>
                                    </td>
                                    <td className="px-3 py-3">
                                      <Badge
                                        className={
                                          resultClasses[check.result ?? "info"]
                                        }
                                      >
                                        {check.result}
                                      </Badge>
                                    </td>
                                    <td className="px-3 py-3">
                                      <Badge
                                        className={
                                          severityClasses[check.severity ?? "info"]
                                        }
                                      >
                                        {check.severity}
                                      </Badge>
                                    </td>
                                    <td className="max-w-xs px-5 py-3">
                                      {check.details && (
                                        <p className="text-caption text-text-secondary">
                                          {check.details}
                                        </p>
                                      )}
                                      {check.recommendation &&
                                        (check.result === "fail" || check.result === "manual") && (
                                          <p className="mt-1 text-caption text-brand">
                                            💡 {check.recommendation}
                                          </p>
                                        )}
                                    </td>
                                  </tr>
                                ))}
                              </tbody>
                            </table>
                          </div>

                          {/* Category Analysis: AI narrative or derived from checks */}
                          {(() => {
                            const failedChecks = sorted.filter((c) => c.result === "fail");
                            const warnChecks = sorted.filter((c) => c.result === "warning");
                            const manualChecks = sorted.filter((c) => c.result === "manual");
                            const issueChecks = [...failedChecks, ...warnChecks, ...manualChecks];
                            const derivedFindings = issueChecks.map((c) => `[${c.checkId}] ${c.description}: ${c.details ?? (c.result === "fail" ? "Failed" : c.result === "manual" ? "Manual review required" : "Needs attention")}`);
                            const derivedActions = issueChecks.filter((c) => c.recommendation).map((c) => c.recommendation!);
                            const derivedNarrative =
                              catFail > 0
                                ? `${cat} has ${catFail} failed check${catFail !== 1 ? "s" : ""} and ${catWarn} warning${catWarn !== 1 ? "s" : ""} out of ${catChecks.length} total. ${failedChecks.map((c) => c.description).join(", ")}. Address the failed checks above to improve this category's score.`
                                : catWarn > 0
                                  ? `${cat} passed ${catPass} of ${catChecks.length} checks with ${catWarn} warning${catWarn !== 1 ? "s" : ""} requiring attention: ${warnChecks.map((c) => c.description).join(", ")}. Review and resolve these warnings to strengthen this category.`
                                  : `${cat} is in excellent shape — all ${catChecks.length} checks passed.`;

                            const findings = (catAnalysis?.criticalFindings?.length ?? 0) > 0 ? catAnalysis!.criticalFindings : derivedFindings;
                            const actions = (catAnalysis?.actionItems?.length ?? 0) > 0 ? catAnalysis!.actionItems : derivedActions;
                            const narrative = catAnalysis?.narrative || derivedNarrative;
                            const hasAiFindings = (catAnalysis?.criticalFindings?.length ?? 0) > 0;

                            return (findings.length > 0 || actions.length > 0 || narrative) ? (
                              <div className="border-t border-border-light px-5 py-5">
                                {findings.length > 0 && (
                                  <div className="mb-4">
                                    <h4 className={`mb-2 text-small font-bold ${hasAiFindings || catFail > 0 ? "text-signal" : "text-harvest"}`}>
                                      {hasAiFindings ? "Critical Findings" : catFail > 0 ? "Critical Findings" : "Key Findings"}
                                    </h4>
                                    <ul className="space-y-1">
                                      {findings.map((f, i) => (
                                        <li
                                          key={i}
                                          className="flex items-start gap-2 text-small text-text-primary"
                                        >
                                          {hasAiFindings || catFail > 0 ? (
                                            <XCircle className="mt-0.5 h-3.5 w-3.5 shrink-0 text-signal" />
                                          ) : (
                                            <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0 text-harvest" />
                                          )}
                                          {f}
                                        </li>
                                      ))}
                                    </ul>
                                  </div>
                                )}

                                {actions.length > 0 && (
                                  <div className="mb-4">
                                    <h4 className="mb-2 text-small font-bold text-brand">
                                      Action Items
                                    </h4>
                                    <ul className="space-y-1">
                                      {actions.map((item, i) => (
                                        <li
                                          key={i}
                                          className="flex items-start gap-2 text-small text-text-primary"
                                        >
                                          <ChevronRight className="mt-0.5 h-3.5 w-3.5 shrink-0 text-brand" />
                                          {item}
                                        </li>
                                      ))}
                                    </ul>
                                  </div>
                                )}

                                {narrative && (
                                  <div className="rounded-md bg-brand-wash/30 p-4">
                                    <p className="text-caption font-bold uppercase tracking-wider text-text-placeholder">
                                      Analysis
                                    </p>
                                    <p className="mt-2 whitespace-pre-line text-small leading-relaxed text-text-secondary">
                                      {narrative}
                                    </p>
                                  </div>
                                )}
                              </div>
                            ) : null;
                          })()}
                        </div>
                      )}
                    </div>
                  );
                })}
            </div>
          </section>

          {/* ════════════════════════════════════════════════════
           *  QUICK WINS
           * ════════════════════════════════════════════════════ */}
          {quickWins.length > 0 && (
            <section id="quickwins" className="space-y-6 print:break-before-page">
              <SectionHeading id="quickwins-heading" icon={Zap}>
                Quick Wins
                <span className="ml-2 rounded-full bg-harvest/10 px-2.5 py-0.5 text-caption font-bold text-harvest">
                  {quickWins.length}
                </span>
              </SectionHeading>

              <p className="text-body text-text-secondary">
                High-impact fixes that can be implemented quickly.
                {quickWins.reduce(
                  (sum, qw) => sum + (qw.estimatedFixMinutes ?? 0),
                  0,
                ) > 0 && (
                  <span className="ml-1 font-medium text-brand">
                    Est. total time:{" "}
                    {Math.round(
                      quickWins.reduce(
                        (sum, qw) => sum + (qw.estimatedFixMinutes ?? 0),
                        0,
                      ) / 60,
                    )}{" "}
                    hours
                  </span>
                )}
              </p>

              <div className="space-y-3">
                {quickWins
                  .sort(
                    (a, b) =>
                      (severityOrder[a.severity ?? "info"] ?? 4) -
                      (severityOrder[b.severity ?? "info"] ?? 4),
                  )
                  .map((qw, i) => (
                    <div
                      key={qw.id}
                      className="flex items-start gap-4 rounded-lg border border-harvest/20 bg-harvest/5 p-5 transition-shadow hover:shadow-sm"
                    >
                      <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-harvest/20 text-caption font-bold text-harvest">
                        {i + 1}
                      </div>
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-2">
                          <span className="font-mono text-caption text-text-placeholder">
                            {qw.checkId}
                          </span>
                          <Badge
                            className={
                              severityClasses[qw.severity ?? "info"]
                            }
                          >
                            {qw.severity}
                          </Badge>
                          {qw.estimatedFixMinutes && (
                            <span className="text-caption text-text-placeholder">
                              ~{qw.estimatedFixMinutes} min
                            </span>
                          )}
                        </div>
                        <p className="mt-1 text-small font-semibold text-text-primary">
                          {qw.description}
                        </p>
                        {qw.recommendation && (
                          <p className="mt-1 text-small text-text-secondary">
                            {qw.recommendation}
                          </p>
                        )}
                      </div>
                    </div>
                  ))}
              </div>
            </section>
          )}

          {/* ════════════════════════════════════════════════════
           *  ACTION PLAN (AI Priority Actions)
           * ════════════════════════════════════════════════════ */}
          {ai.priorityActions && (
            <section id="actions" className="space-y-6 print:break-before-page">
              <SectionHeading id="actions-heading" icon={TrendingUp}>
                Action Plan
              </SectionHeading>

              <div className="space-y-6">
                {/* Immediate */}
                {ai.priorityActions.immediate.length > 0 && (
                  <div className="rounded-lg border border-signal/20 bg-white p-6">
                    <h3 className="mb-4 flex items-center gap-2 text-h3 font-heading font-semibold text-signal">
                      <div className="h-2 w-2 rounded-full bg-signal" />
                      Priority 1 — Immediate (This Week)
                    </h3>
                    <ol className="space-y-3">
                      {ai.priorityActions.immediate.map((action, i) => (
                        <li
                          key={i}
                          className="flex items-start gap-3 text-small text-text-primary"
                        >
                          <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-signal/10 text-caption font-bold text-signal">
                            {i + 1}
                          </span>
                          {action}
                        </li>
                      ))}
                    </ol>
                  </div>
                )}

                {/* Near-term */}
                {ai.priorityActions.nearTerm.length > 0 && (
                  <div className="rounded-lg border border-harvest/20 bg-white p-6">
                    <h3 className="mb-4 flex items-center gap-2 text-h3 font-heading font-semibold text-harvest">
                      <div className="h-2 w-2 rounded-full bg-harvest" />
                      Priority 2 — Near-Term (Next 2 Weeks)
                    </h3>
                    <ol className="space-y-3">
                      {ai.priorityActions.nearTerm.map((action, i) => (
                        <li
                          key={i}
                          className="flex items-start gap-3 text-small text-text-primary"
                        >
                          <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-harvest/10 text-caption font-bold text-harvest">
                            {i + 1}
                          </span>
                          {action}
                        </li>
                      ))}
                    </ol>
                  </div>
                )}

                {/* Strategic */}
                {ai.priorityActions.strategic.length > 0 && (
                  <div className="rounded-lg border border-brand/20 bg-white p-6">
                    <h3 className="mb-4 flex items-center gap-2 text-h3 font-heading font-semibold text-brand">
                      <div className="h-2 w-2 rounded-full bg-brand" />
                      Strategic — Long-Term Improvements
                    </h3>
                    <ol className="space-y-3">
                      {ai.priorityActions.strategic.map((action, i) => (
                        <li
                          key={i}
                          className="flex items-start gap-3 text-small text-text-primary"
                        >
                          <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-brand/10 text-caption font-bold text-brand">
                            {i + 1}
                          </span>
                          {action}
                        </li>
                      ))}
                    </ol>
                  </div>
                )}
              </div>

              {/* Wasted Spend Insights */}
              {ai.wastedSpendInsights && (
                <div className="flex items-start gap-3 rounded-lg border border-signal/20 bg-signal/5 p-5">
                  <DollarSign className="mt-0.5 h-5 w-5 shrink-0 text-signal" strokeWidth={1.75} />
                  <div>
                    <p className="text-small font-bold text-signal">
                      Wasted Spend Analysis
                    </p>
                    <p className="mt-1 whitespace-pre-line text-small leading-relaxed text-text-primary">
                      {ai.wastedSpendInsights}
                    </p>
                  </div>
                </div>
              )}
            </section>
          )}

          {/* ════════════════════════════════════════════════════
           *  SUMMARY MATRIX
           * ════════════════════════════════════════════════════ */}
          <section id="matrix" className="space-y-6 print:break-before-page">
            <SectionHeading id="matrix-heading" icon={BarChart3}>
              Summary Matrix
            </SectionHeading>

            <div className="overflow-x-auto rounded-lg border border-border-light bg-white">
              <table className="w-full text-small">
                <thead>
                  <tr className="bg-brand text-white">
                    <th className="px-4 py-3 text-left text-caption font-bold uppercase tracking-wider">
                      Check ID
                    </th>
                    <th className="px-4 py-3 text-left text-caption font-bold uppercase tracking-wider">
                      Category
                    </th>
                    <th className="px-3 py-3 text-center text-caption font-bold uppercase tracking-wider">
                      Result
                    </th>
                    <th className="px-3 py-3 text-center text-caption font-bold uppercase tracking-wider">
                      Severity
                    </th>
                    <th className="px-4 py-3 text-left text-caption font-bold uppercase tracking-wider">
                      Description
                    </th>
                    <th className="px-4 py-3 text-left text-caption font-bold uppercase tracking-wider">
                      Details
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border-light">
                  {[...checks]
                    .sort((a, b) => {
                      // Sort by category, then by result (fail first), then severity
                      const catA = a.category ?? "zzz";
                      const catB = b.category ?? "zzz";
                      if (catA !== catB) return catA.localeCompare(catB);
                      const rA = a.result === "fail" ? 0 : a.result === "warning" ? 1 : 2;
                      const rB = b.result === "fail" ? 0 : b.result === "warning" ? 1 : 2;
                      if (rA !== rB) return rA - rB;
                      return (
                        (severityOrder[a.severity ?? "info"] ?? 4) -
                        (severityOrder[b.severity ?? "info"] ?? 4)
                      );
                    })
                    .map((check, i) => (
                      <tr
                        key={check.id}
                        className={cn(
                          "transition-colors hover:bg-brand-wash/20",
                          i % 2 === 1 ? "bg-brand-wash/10" : "",
                        )}
                      >
                        <td className="whitespace-nowrap px-4 py-2.5 font-mono text-caption text-text-placeholder">
                          {check.checkId}
                        </td>
                        <td className="px-4 py-2.5 text-caption text-text-secondary">
                          {check.category}
                        </td>
                        <td className="px-3 py-2.5 text-center">
                          <Badge
                            className={resultClasses[check.result ?? "info"]}
                          >
                            {check.result}
                          </Badge>
                        </td>
                        <td className="px-3 py-2.5 text-center">
                          <Badge
                            className={
                              severityClasses[check.severity ?? "info"]
                            }
                          >
                            {check.severity}
                          </Badge>
                        </td>
                        <td className="max-w-sm px-4 py-2.5 text-caption text-text-primary">
                          {check.description}
                        </td>
                        <td className="max-w-md px-4 py-2.5 text-caption text-text-secondary">
                          {(check.result === "fail" || check.result === "warning" || check.result === "manual") && check.details ? (
                            <span className="leading-relaxed">{check.details}</span>
                          ) : check.result === "pass" ? (
                            <span className="text-text-placeholder italic">—</span>
                          ) : null}
                        </td>
                      </tr>
                    ))}
                </tbody>
              </table>
            </div>
          </section>

          {/* ── Footer ── */}
          <footer className="border-t border-border-light pt-8 text-center print:mt-12">
            <SterlingXLogo size={20} />
            <p className="mt-3 text-caption text-text-placeholder">
              Confidential — Prepared by SterlingX &middot;{" "}
              {new Date(a.createdAt).toLocaleDateString("en-US", {
                year: "numeric",
                month: "long",
                day: "numeric",
              })}
            </p>
          </footer>

          {/* Scroll to top */}
          <button
            onClick={() => window.scrollTo({ top: 0, behavior: "smooth" })}
            className="fixed bottom-6 right-6 z-40 rounded-full bg-brand p-3 text-white shadow-lg transition-all hover:bg-brand-light hover:shadow-brand print:hidden"
            aria-label="Scroll to top"
          >
            <ArrowUp className="h-5 w-5" strokeWidth={2} />
          </button>
        </div>
      </div>
    </>
  );
}
