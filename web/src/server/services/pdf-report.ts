/**
 * SterlingX Paid Ads Audit — PDF Report Generator
 *
 * Generates a branded multi-page PDF audit report matching the agency
 * deliverable template:
 *   1. Cover page
 *   2. Executive Summary (category table + account snapshot)
 *   3–8. Section deep-dives (Check | Status | Finding tables + narratives)
 *   9. Quick Wins (Priority 1 Immediate + Priority 2 Near-Term)
 *   10. Summary Matrix (all checks compact table)
 */

import PDFDocument from "pdfkit";

// ─── Brand Tokens ────────────────────────────────────────

const B = {
  primary: "#193762",      // Midnight Blue
  accent: "#4180C2",       // Horizon Blue
  accentSubtle: "#D2E2F3", // Light Midnight tint
  accentWash: "#EDF2F8",   // Very light Midnight tint
  text: "#193762",         // Midnight Blue for headings
  textSec: "#3D5A80",      // Mid-blue body
  textMuted: "#BCB5AA",    // Sandstone
  border: "#D7D5D6",       // Fog Gray
  white: "#FFFFFF",
  green: "#4AA988",        // Emerald
  greenLight: "#E0F2EB",
  red: "#C6385A",          // Signal
  redLight: "#F8E0E6",
  yellow: "#EEAE22",       // Harvest
  yellowLight: "#FDF4DD",
  orange: "#E8913A",
  gray: "#6B7280",
  purple: "#7C3AED",
  purpleLight: "#EDE9FE",
  carbon: "#0A3449",
  fog: "#D7D5D6",
};

// Category ordering + weights + abbreviations (matches example)
const CATEGORIES = [
  { key: "Conversion Tracking", weight: "25%", abbr: "Conv." },
  { key: "Wasted Spend", weight: "20%", abbr: "Waste" },
  { key: "Account Structure", weight: "15%", abbr: "Structure" },
  { key: "Keywords & Quality Score", weight: "15%", abbr: "Keywords" },
  { key: "Ads & Assets", weight: "15%", abbr: "Ads" },
  { key: "Settings & Targeting", weight: "10%", abbr: "Settings" },
];

const GRADE_DESC: Record<string, string> = {
  A: "Excellent — minor optimizations only",
  B: "Good — some improvement opportunities",
  C: "Average — notable issues need attention",
  D: "Below Average — significant improvements needed",
  F: "Critical — urgent intervention required",
};

// ─── Types ───────────────────────────────────────────────

interface AuditCheck {
  checkId: string;
  category: string;
  description: string;
  result: string;
  severity: string;
  details: string | null;
  recommendation: string | null;
  isQuickWin: boolean | null;
  estimatedFixMinutes: number | null;
}

interface AuditData {
  audit: {
    reportId: string;
    score: number | null;
    grade: string | null;
    status: string;
    summary: string | null;
    totalChecks: number | null;
    passCount: number | null;
    warningCount: number | null;
    failCount: number | null;
    skippedCount: number | null;
    customerName: string | null;
    customerId: string | null;
    createdAt: Date;
    rawData: Record<string, unknown> | null;
    aiAnalysis: Record<string, unknown> | null;
  };
  checks: AuditCheck[];
}

// AI analysis shape (from ai-analysis.ts)
interface AIAnalysis {
  executiveSummary?: string;
  overallAssessment?: string;
  categoryAnalyses?: {
    category: string;
    score: number;
    headline: string;
    narrative: string;
    criticalFindings: string[];
    actionItems: string[];
  }[];
  priorityActions?: {
    immediate: string[];
    nearTerm: string[];
    strategic: string[];
  };
  wastedSpendInsights?: string;
  estimatedImpact?: string;
}

// ─── Helpers ─────────────────────────────────────────────

function statusColor(r: string): string {
  const m: Record<string, string> = { pass: B.green, fail: B.red, warning: B.yellow, skipped: B.gray, manual: B.purple };
  return m[r] ?? B.gray;
}

function statusBg(r: string): string {
  const m: Record<string, string> = { pass: B.greenLight, fail: B.redLight, warning: B.yellowLight, manual: B.purpleLight };
  return m[r] ?? "#F3F4F6";
}

function statusLabel(r: string): string {
  const m: Record<string, string> = { pass: "PASS", fail: "FAIL", warning: "WARNING", skipped: "SKIPPED", manual: "MANUAL" };
  return m[r] ?? r.toUpperCase();
}

function gradeColor(g: string): string {
  const m: Record<string, string> = { A: B.green, B: "#4AA988", C: B.yellow, D: B.orange, F: B.red };
  return m[g] ?? B.gray;
}

function sevOrder(s: string): number {
  const m: Record<string, number> = { critical: 0, high: 1, medium: 2, low: 3 };
  return m[s] ?? 4;
}

// ─── Layout Constants ────────────────────────────────────

const PW = 595.28; // A4 width
const PH = 841.89;
const ML = 50;
const MR = 50;
const CW = PW - ML - MR; // usable content width
const RX = PW - MR;
const CONTENT_TOP = 34;       // Below header line
const CONTENT_BOTTOM = PH - 65; // Above footer (leave room for footer drawing)

// ─── Shared drawing helpers ──────────────────────────────

/** Standard page header + footer (all pages except cover).
 *  All text uses lineBreak:false to prevent pdfkit from auto-adding pages
 *  inside this function (which would re-trigger the pageAdded event). */
function hf(doc: PDFKit.PDFDocument, a: AuditData["audit"], pg: number) {
  const d = new Date(a.createdAt).toLocaleDateString("en-US", { year: "numeric", month: "long", day: "numeric" });

  // Thin purple accent bar
  doc.save();
  doc.rect(0, 0, PW, 3).fill(B.primary);

  // Header line
  doc.font("Helvetica-Bold").fontSize(7).fillColor(B.primary).text("Google Ads Audit Report", ML, 10, { lineBreak: false });
  doc.font("Helvetica").fontSize(7).fillColor(B.textMuted).text(`${a.customerName ?? ""}  |  ${d}`, ML + 130, 10, { lineBreak: false });
  doc.font("Helvetica").fontSize(7).fillColor(B.textMuted).text(`${pg}`, RX - 20, 10, { width: 20, align: "right", lineBreak: false });
  doc.moveTo(ML, 22).lineTo(RX, 22).lineWidth(0.4).strokeColor(B.border).stroke();

  // Footer
  const fy = PH - 30;
  doc.moveTo(ML, fy).lineTo(RX, fy).lineWidth(0.4).strokeColor(B.border).stroke();
  doc.font("Helvetica").fontSize(6.5).fillColor(B.textMuted).text("SterlingX  |  Confidential", ML, fy + 6, { lineBreak: false });
  doc.font("Helvetica").fontSize(6.5).fillColor(B.textMuted).text(`Page ${pg}`, RX - 40, fy + 6, { width: 40, align: "right", lineBreak: false });
  doc.restore();

  // CRITICAL: Reset cursor to content area so pdfkit's auto-break
  // doesn't think we're at the bottom of the page (footer text moves
  // doc.y to ~820, which triggers immediate auto page breaks).
  doc.x = ML;
  doc.y = CONTENT_TOP;
}

/** Page-break guard. If y + needed overflows, add a new page.
 *  The pageAdded event listener handles hf() and pg.v++ automatically. */
function brk(doc: PDFKit.PDFDocument, y: number, needed: number, _a: AuditData["audit"], _pg: { v: number }): number {
  if (y + needed > CONTENT_BOTTOM) {
    doc.addPage(); // pageAdded event draws header/footer + increments pg
    return CONTENT_TOP;
  }
  return y;
}

/** Start a new page ONLY if we aren't already at the top of a fresh page.
 *  Prevents blank pages when auto page-breaks already advanced the page. */
function newPage(doc: PDFKit.PDFDocument): void {
  // If cursor is near the top of content area, we're already on a fresh page
  if (doc.y <= CONTENT_TOP + 10) return;
  doc.addPage();
}


/** Draw solid-colored table header bar. Returns bottom Y. */
function tHead(doc: PDFKit.PDFDocument, y: number, cols: { x: number; w: number; label: string }[]): number {
  doc.rect(ML, y, CW, 18).fill(B.primary);
  doc.font("Helvetica-Bold").fontSize(7.5).fillColor(B.white);
  for (const c of cols) doc.text(c.label, c.x + 4, y + 5, { width: c.w - 8 });
  return y + 18;
}

/**
 * Measure the height a row would need given its cell texts,
 * then draw the row. Returns bottom Y.
 */
function tRow(
  doc: PDFKit.PDFDocument,
  y: number,
  cols: { x: number; w: number }[],
  cells: { text: string; color?: string; font?: string; size?: number }[],
  bg?: string,
): number {
  const pad = 4;
  const defaultSize = 7.5;

  // Measure tallest cell
  let maxH = 0;
  for (let i = 0; i < cells.length; i++) {
    const c = cells[i];
    doc.font(c.font ?? "Helvetica").fontSize(c.size ?? defaultSize);
    const h = doc.heightOfString(c.text, { width: cols[i].w - pad * 2 });
    if (h > maxH) maxH = h;
  }
  const rowH = Math.max(16, maxH + pad * 2);

  if (bg) doc.rect(ML, y, CW, rowH).fill(bg);

  for (let i = 0; i < cells.length; i++) {
    const c = cells[i];
    doc.font(c.font ?? "Helvetica").fontSize(c.size ?? defaultSize).fillColor(c.color ?? B.text);
    doc.text(c.text, cols[i].x + pad, y + pad, { width: cols[i].w - pad * 2 });
  }

  return y + rowH;
}

/** Draw a thin horizontal rule */
function hr(doc: PDFKit.PDFDocument, y: number, color?: string): number {
  doc.moveTo(ML, y).lineTo(RX, y).lineWidth(0.4).strokeColor(color ?? B.border).stroke();
  return y + 2;
}

// ─── Main Generator ─────────────────────────────────────

export function generateAuditPdf(data: AuditData): PDFKit.PDFDocument {
  const doc = new PDFDocument({
    size: "A4",
    margins: { top: CONTENT_TOP, bottom: PH - CONTENT_BOTTOM, left: ML, right: MR },
    bufferPages: true,
    info: {
      Title: `SterlingX Audit — ${data.audit.reportId}`,
      Author: "SterlingX",
      Subject: "Google Ads Audit Report",
    },
  });

  const a = data.audit;
  const checks = data.checks;
  const catScores = (a.rawData as Record<string, unknown>)?.categoryScores as Record<string, number> | undefined;
  const ai = (a.aiAnalysis ?? {}) as AIAnalysis;

  // Group checks by category
  const grouped: Record<string, AuditCheck[]> = {};
  for (const c of checks) {
    if (!grouped[c.category]) grouped[c.category] = [];
    grouped[c.category].push(c);
  }

  const pg = { v: 1 };

  // ─── PAGE 1: COVER ──────────────────────────────────
  pageCover(doc, a);

  // Register pageAdded event AFTER cover page — every subsequent page
  // (manual doc.addPage() OR pdfkit auto-break) automatically gets
  // header/footer drawn and the page counter incremented.
  // A reentrant guard prevents infinite recursion when hf() text
  // drawing accidentally triggers another auto page break.
  let _insidePageAdded = false;
  doc.on("pageAdded", () => {
    if (_insidePageAdded) return; // prevent infinite recursion
    _insidePageAdded = true;
    pg.v++;
    hf(doc, a, pg.v);
    _insidePageAdded = false;
  });

  // ─── PAGE 2: EXECUTIVE SUMMARY ──────────────────────
  doc.addPage(); // → pageAdded fires → pg.v=2, hf() drawn
  pageExecSummary(doc, a, catScores, grouped, checks, ai, pg);

  // ─── PAGES 3+: SECTION PAGES ───────────────────────
  let secNum = 1;
  for (const cat of CATEGORIES) {
    const list = grouped[cat.key];
    if (!list || list.length === 0) continue;
    newPage(doc);
    pageSection(doc, a, list, cat.key, secNum, catScores?.[cat.key], cat.weight, ai, pg);
    secNum++;
  }
  // Any extra categories
  for (const [cat, list] of Object.entries(grouped)) {
    if (CATEGORIES.some((c) => c.key === cat)) continue;
    if (list.length === 0) continue;
    newPage(doc);
    pageSection(doc, a, list, cat, secNum, catScores?.[cat], "", ai, pg);
    secNum++;
  }

  // ─── QUICK WINS ─────────────────────────────────────
  const qw = checks
    .filter((c) => c.isQuickWin && c.result === "fail")
    .sort((a, b) => sevOrder(a.severity) - sevOrder(b.severity));
  const failRecs = checks.filter((c) => c.result === "fail" && c.recommendation);

  if (qw.length > 0 || failRecs.length > 0) {
    newPage(doc);
    pageQuickWins(doc, a, qw, failRecs, ai, pg);
  }

  // ─── SUMMARY MATRIX ─────────────────────────────────
  newPage(doc);
  pageSummaryMatrix(doc, a, checks, pg);

  doc.end();
  return doc;
}

// ═══════════════════════════════════════════════════════════
// PAGE 1 — COVER
// ═══════════════════════════════════════════════════════════

function pageCover(doc: PDFKit.PDFDocument, a: AuditData["audit"]) {
  // Top purple banner
  doc.rect(0, 0, PW, 6).fill(B.primary);

  // Brand mark
  doc.font("Helvetica-Bold").fontSize(26).fillColor(B.primary).text("X", ML, 36);
  doc.font("Helvetica-Bold").fontSize(10).fillColor(B.primary).text("SterlingX", ML + 28, 46);

  // Title
  doc.font("Helvetica-Bold").fontSize(28).fillColor(B.text).text("Google Ads Audit Report", ML, 140, { width: CW });
  const dateStr = new Date(a.createdAt).toLocaleDateString("en-US", { year: "numeric", month: "long", day: "numeric" });
  doc.font("Helvetica").fontSize(14).fillColor(B.textSec).text(`${a.customerName ?? "Account " + (a.customerId ?? "")}  —  ${dateStr}`, ML, 178, { width: CW });

  // Score + Grade block
  if (a.score !== null && a.grade) {
    const sy = 260;
    const gc = gradeColor(a.grade);

    // Grade circle
    doc.circle(ML + 45, sy + 35, 38).fill(gc);
    doc.font("Helvetica-Bold").fontSize(38).fillColor(B.white).text(a.grade, ML + 24, sy + 16, { width: 42, align: "center" });

    // Numeric score
    doc.font("Helvetica-Bold").fontSize(44).fillColor(B.text).text(`${Math.round(a.score)}`, ML + 105, sy + 6);
    doc.font("Helvetica").fontSize(13).fillColor(B.textMuted).text("/ 100", ML + 105, sy + 52);

    // Description
    doc.font("Helvetica").fontSize(11).fillColor(B.textSec).text(GRADE_DESC[a.grade] ?? "", ML + 190, sy + 22, { width: 290 });
  }

  // Stats bar
  const by = 400;
  const items = [
    { label: "Total Checks", val: `${a.totalChecks ?? 0}` },
    { label: "Passed", val: `${a.passCount ?? 0}`, c: B.green },
    { label: "Warnings", val: `${a.warningCount ?? 0}`, c: B.yellow },
    { label: "Failed", val: `${a.failCount ?? 0}`, c: B.red },
    { label: "Manual", val: `${(a as Record<string, unknown>).manualCount ?? 0}`, c: B.purple },
    { label: "Skipped", val: `${a.skippedCount ?? 0}`, c: B.gray },
  ];
  const sw = CW / items.length;
  for (let i = 0; i < items.length; i++) {
    const ix = ML + i * sw;
    doc.font("Helvetica-Bold").fontSize(26).fillColor(items[i].c ?? B.text).text(items[i].val, ix, by, { width: sw - 4 });
    doc.font("Helvetica").fontSize(8).fillColor(B.textMuted).text(items[i].label, ix, by + 32, { width: sw - 4 });
  }

  hr(doc, by + 52);

  // Report meta
  doc.font("Helvetica").fontSize(8).fillColor(B.textMuted).text(`Report ID: ${a.reportId}`, ML, by + 60);
  doc.font("Helvetica").fontSize(8).fillColor(B.textMuted).text("Confidential — Prepared by SterlingX", ML, by + 72);

  // Footer
  const fy = PH - 30;
  hr(doc, fy);
  doc.font("Helvetica").fontSize(6.5).fillColor(B.textMuted).text("SterlingX  |  Confidential", ML, fy + 6);
}

// ═══════════════════════════════════════════════════════════
// PAGE 2 — EXECUTIVE SUMMARY
// ═══════════════════════════════════════════════════════════

function pageExecSummary(
  doc: PDFKit.PDFDocument,
  a: AuditData["audit"],
  catScores: Record<string, number> | undefined,
  grouped: Record<string, AuditCheck[]>,
  checks: AuditCheck[],
  ai: AIAnalysis,
  pg: { v: number },
) {
  let y = 34;

  doc.font("Helvetica-Bold").fontSize(16).fillColor(B.text).text("Executive Summary", ML, y);
  y += 26;

  // AI-generated executive summary narrative
  if (ai.executiveSummary) {
    doc.font("Helvetica").fontSize(8.5).fillColor(B.textSec);
    doc.text(ai.executiveSummary, ML, y, { width: CW });
    y = doc.y + 12;
    y = brk(doc, y, 40, a, pg);
  }

  // ── Category Breakdown Table ──
  // Category | Score | Weight | Key Finding
  const cc = [
    { x: ML, w: 125, label: "Category" },
    { x: ML + 125, w: 55, label: "Score" },
    { x: ML + 180, w: 45, label: "Weight" },
    { x: ML + 225, w: CW - 225, label: "Key Finding" },
  ];
  y = tHead(doc, y, cc);

  let alt = false;
  for (const cat of CATEGORIES) {
    const score = catScores?.[cat.key];
    const list = grouped[cat.key] ?? [];
    const scoreStr = score !== undefined ? `${Math.round(score)}/100` : "—";

    // Key finding: first fail, then first warning, then first check
    const fail0 = list.find((c) => c.result === "fail");
    const warn0 = list.find((c) => c.result === "warning");
    const top = fail0 ?? warn0 ?? list[0];
    const finding = top ? truncate(top.details ?? top.description, 120) : "No issues found";

    y = tRow(doc, y, cc, [
      { text: cat.key, font: "Helvetica-Bold" },
      { text: scoreStr, font: "Helvetica-Bold" },
      { text: cat.weight },
      { text: finding },
    ], alt ? B.accentWash : undefined);
    alt = !alt;
  }

  // Totals row
  y = tRow(doc, y, cc, [
    { text: "Weighted Total", font: "Helvetica-Bold", color: B.primary },
    { text: `${a.score !== null ? Math.round(a.score) : 0}/100`, font: "Helvetica-Bold", color: B.primary },
    { text: "" },
    { text: GRADE_DESC[a.grade ?? ""] ?? "", color: B.primary },
  ], B.accentSubtle);

  y += 18;

  // ── Account Snapshot Table ──
  y = brk(doc, y, 180, a, pg);

  doc.font("Helvetica-Bold").fontSize(13).fillColor(B.text).text("Account Snapshot", ML, y);
  y += 20;

  const sc = [
    { x: ML, w: 180, label: "Metric" },
    { x: ML + 180, w: 85, label: "Value" },
    { x: ML + 265, w: 85, label: "Benchmark" },
    { x: ML + 350, w: CW - 350, label: "Status" },
  ];
  y = tHead(doc, y, sc);

  const total = a.totalChecks ?? 0;
  const pass = a.passCount ?? 0;
  const fail = a.failCount ?? 0;
  const warn = a.warningCount ?? 0;
  const pRate = total > 0 ? Number(((pass / total) * 100).toFixed(1)) : 0;
  const score = a.score !== null ? Math.round(a.score) : 0;
  const qwCount = checks.filter((c) => c.isQuickWin && c.result === "fail").length;

  const snapRows = [
    { m: "Total Checks Run", v: `${total}`, b: "—", s: "—", sc: B.text },
    { m: "Pass Rate", v: `${pRate}%`, b: "≥75%", s: pRate >= 75 ? "PASS" : pRate >= 50 ? "WARNING" : "FAIL", sc: pRate >= 75 ? B.green : pRate >= 50 ? B.yellow : B.red },
    { m: "Failed Checks", v: `${fail}`, b: "0", s: fail === 0 ? "PASS" : fail <= 5 ? "WARNING" : "FAIL", sc: fail === 0 ? B.green : fail <= 5 ? B.yellow : B.red },
    { m: "Warnings", v: `${warn}`, b: "≤5", s: warn <= 5 ? "PASS" : "WARNING", sc: warn <= 5 ? B.green : B.yellow },
    { m: "Quick Wins Available", v: `${qwCount}`, b: "—", s: "—", sc: B.text },
    { m: "Health Score", v: `${score}/100`, b: "≥75", s: score >= 75 ? "PASS" : score >= 50 ? "WARNING" : "FAIL", sc: score >= 75 ? B.green : score >= 50 ? B.yellow : B.red },
  ];

  alt = false;
  for (const r of snapRows) {
    y = tRow(doc, y, sc, [
      { text: r.m },
      { text: r.v, font: "Helvetica-Bold" },
      { text: r.b, color: B.textMuted },
      { text: r.s, font: "Helvetica-Bold", color: r.sc },
    ], alt ? B.accentWash : undefined);
    alt = !alt;
  }

  // AI-generated overall assessment
  if (ai.overallAssessment) {
    y += 10;
    y = brk(doc, y, 40, a, pg);
    doc.font("Helvetica-Bold").fontSize(9).fillColor(B.primary).text("Assessment", ML, y);
    y += 13;
    doc.font("Helvetica").fontSize(8).fillColor(B.textSec);
    doc.text(ai.overallAssessment, ML, y, { width: CW });
    y = doc.y + 4;
  }

  // AI-generated estimated impact
  if (ai.estimatedImpact) {
    y += 6;
    y = brk(doc, y, 40, a, pg);
    doc.roundedRect(ML, y, CW, 3, 0).fill(B.green);
    y += 6;
    doc.font("Helvetica-Bold").fontSize(9).fillColor(B.green).text("Estimated Impact", ML, y);
    y += 13;
    doc.font("Helvetica").fontSize(8).fillColor(B.textSec);
    doc.text(ai.estimatedImpact, ML, y, { width: CW });
    y = doc.y + 4;
  }
}

// ═══════════════════════════════════════════════════════════
// SECTION PAGES — DEEP DIVES
// ═══════════════════════════════════════════════════════════

function pageSection(
  doc: PDFKit.PDFDocument,
  a: AuditData["audit"],
  list: AuditCheck[],
  category: string,
  secNum: number,
  catScore: number | undefined,
  weight: string,
  ai: AIAnalysis,
  pg: { v: number },
) {
  let y = 34;

  // Section title
  doc.font("Helvetica-Bold").fontSize(15).fillColor(B.text).text(`Section ${secNum} — ${category}`, ML, y);
  y += 20;

  // Subtitle: score + weight
  const parts = [];
  if (catScore !== undefined) parts.push(`Score: ${Math.round(catScore)}/100`);
  if (weight) parts.push(`Weight: ${weight}`);
  if (parts.length) {
    doc.font("Helvetica").fontSize(9).fillColor(B.textSec).text(parts.join("  |  "), ML, y);
    y += 14;
  }

  // Quick category stats
  const passed = list.filter((c) => c.result === "pass").length;
  const failed = list.filter((c) => c.result === "fail").length;
  const warned = list.filter((c) => c.result === "warning").length;
  const manualCt = list.filter((c) => c.result === "manual").length;
  doc.font("Helvetica").fontSize(8).fillColor(B.textMuted);
  doc.text(`${list.length} checks  |  ${passed} passed  |  ${warned} warnings  |  ${failed} failed${manualCt > 0 ? `  |  ${manualCt} manual` : ""}`, ML, y);
  y += 16;

  // ── Check | Status | Finding table ──
  const cols = [
    { x: ML, w: 170, label: "Check" },
    { x: ML + 170, w: 60, label: "Status" },
    { x: ML + 230, w: CW - 230, label: "Finding" },
  ];
  y = tHead(doc, y, cols);

  let alt = false;
  for (const ck of list) {
    const finding = ck.details ?? "—";
    const st = statusLabel(ck.result);
    const sc = statusColor(ck.result);

    // Measure height needed
    doc.font("Helvetica").fontSize(7.5);
    const h1 = doc.heightOfString(ck.description, { width: cols[0].w - 8 });
    const h2 = doc.heightOfString(finding, { width: cols[2].w - 8 });
    const rowH = Math.max(16, Math.max(h1, h2) + 8);

    // Page break?
    if (y + rowH > CONTENT_BOTTOM) {
      doc.addPage(); // pageAdded event handles hf() + pg.v++
      y = CONTENT_TOP;
      y = tHead(doc, y, cols);
      alt = false;
    }

    const bg = alt ? B.accentWash : undefined;
    alt = !alt;
    if (bg) doc.rect(ML, y, CW, rowH).fill(bg);

    doc.font("Helvetica").fontSize(7.5).fillColor(B.text);
    doc.text(ck.description, cols[0].x + 4, y + 4, { width: cols[0].w - 8 });

    // Status pill
    const pillW = 48;
    const pillX = cols[1].x + 6;
    const pillY = y + 3;
    doc.roundedRect(pillX, pillY, pillW, 12, 3).fill(statusBg(ck.result));
    doc.font("Helvetica-Bold").fontSize(6.5).fillColor(sc);
    doc.text(st, pillX, pillY + 3, { width: pillW, align: "center" });

    doc.font("Helvetica").fontSize(7.5).fillColor(B.text);
    doc.text(finding, cols[2].x + 4, y + 4, { width: cols[2].w - 8 });

    y += rowH;
  }

  // ── Narrative: Critical Findings + Action Required ──
  const critical = list
    .filter((c) => c.result === "fail" && c.recommendation)
    .sort((a, b) => sevOrder(a.severity) - sevOrder(b.severity));

  if (critical.length > 0) {
    y += 10;
    y = brk(doc, y, 70, a, pg);

    const top = critical[0];

    // Red accent bar
    doc.rect(ML, y, CW, 3).fill(B.red);
    y += 6;

    // Critical Finding label
    doc.font("Helvetica-Bold").fontSize(9).fillColor(B.red).text("Critical Finding", ML, y);
    y += 13;

    doc.font("Helvetica").fontSize(8.5).fillColor(B.text);
    doc.text(top.details ?? top.description, ML + 8, y, { width: CW - 16 });
    y = doc.y + 6;

    // Action Required box
    doc.roundedRect(ML, y, CW, 3, 0).fill(B.primary);
    y += 6;
    doc.font("Helvetica-Bold").fontSize(9).fillColor(B.primary).text("Action Required", ML, y);
    y += 13;
    doc.font("Helvetica").fontSize(8.5).fillColor(B.textSec);
    doc.text(top.recommendation ?? "", ML + 8, y, { width: CW - 16 });
    y = doc.y + 8;

    // Additional failed checks bullets
    if (critical.length > 1) {
      y = brk(doc, y, 20, a, pg);
      doc.font("Helvetica-Bold").fontSize(9).fillColor(B.text).text("Additional Issues", ML, y);
      y += 13;
      for (let i = 1; i < critical.length && i <= 6; i++) {
        y = brk(doc, y, 18, a, pg);
        const c = critical[i];
        doc.font("Helvetica").fontSize(7.5).fillColor(B.textSec);
        doc.text(`• [${c.checkId}] ${c.description}: ${truncate(c.recommendation ?? c.details ?? "", 150)}`, ML + 6, y, { width: CW - 12 });
        y = doc.y + 3;
      }
    }
  }

  // ── AI Category Narrative ──
  const catAnalysis = ai.categoryAnalyses?.find(
    (ca) => ca.category.toLowerCase() === category.toLowerCase(),
  );
  if (catAnalysis?.narrative) {
    y += 8;
    y = brk(doc, y, 60, a, pg);

    doc.roundedRect(ML, y, CW, 3, 0).fill(B.primary);
    y += 6;
    doc.font("Helvetica-Bold").fontSize(9).fillColor(B.primary);
    doc.text(catAnalysis.headline || "AI Analysis", ML, y);
    y += 13;

    doc.font("Helvetica").fontSize(8.5).fillColor(B.textSec);
    doc.text(catAnalysis.narrative, ML + 8, y, { width: CW - 16 });
    y = doc.y + 4;

    if (catAnalysis.actionItems?.length) {
      y = brk(doc, y, 16, a, pg);
      doc.font("Helvetica-Bold").fontSize(8).fillColor(B.text).text("Recommended Actions", ML, y);
      y += 12;
      for (const item of catAnalysis.actionItems.slice(0, 5)) {
        y = brk(doc, y, 14, a, pg);
        doc.font("Helvetica").fontSize(7.5).fillColor(B.textSec);
        doc.text(`▸ ${item}`, ML + 6, y, { width: CW - 12 });
        y = doc.y + 3;
      }
    }
  }
}

// ═══════════════════════════════════════════════════════════
// QUICK WINS PAGE
// ═══════════════════════════════════════════════════════════

function pageQuickWins(
  doc: PDFKit.PDFDocument,
  a: AuditData["audit"],
  qw: AuditCheck[],
  failRecs: AuditCheck[],
  ai: AIAnalysis,
  pg: { v: number },
) {
  let y = 34;

  doc.font("Helvetica-Bold").fontSize(16).fillColor(B.text).text("Quick Wins — Sorted by Impact", ML, y);
  y += 26;

  // ── Priority 1: Immediate (critical + high) ──
  const p1 = qw.filter((c) => c.severity === "critical" || c.severity === "high");
  const p2 = qw.filter((c) => c.severity === "medium" || c.severity === "low");

  if (p1.length > 0) {
    doc.font("Helvetica-Bold").fontSize(11).fillColor(B.primary).text("Priority 1 — Immediate (This Week)", ML, y);
    y += 18;

    for (let i = 0; i < p1.length; i++) {
      y = brk(doc, y, 50, a, pg);
      const c = p1[i];

      // Number + description
      doc.font("Helvetica-Bold").fontSize(9.5).fillColor(B.primary).text(`${i + 1}.`, ML, y, { continued: true });
      doc.font("Helvetica-Bold").fontSize(9.5).fillColor(B.text).text(` ${c.description}`, { width: CW - 20 });
      y = doc.y + 2;

      if (c.recommendation) {
        doc.font("Helvetica").fontSize(8.5).fillColor(B.textSec);
        doc.text(c.recommendation, ML + 14, y, { width: CW - 28 });
        y = doc.y + 2;
      }
      if (c.estimatedFixMinutes) {
        doc.font("Helvetica-Oblique").fontSize(7.5).fillColor(B.textMuted);
        doc.text(`Est. fix time: ~${c.estimatedFixMinutes} min`, ML + 14, y);
        y = doc.y + 6;
      } else {
        y += 4;
      }
    }
  }

  // ── Priority 2: Near-Term ──
  if (p2.length > 0) {
    y += 6;
    y = brk(doc, y, 40, a, pg);

    doc.font("Helvetica-Bold").fontSize(11).fillColor(B.primary).text("Priority 2 — Near-Term (Next 2 Weeks)", ML, y);
    y += 18;

    const off = p1.length;
    for (let i = 0; i < p2.length; i++) {
      y = brk(doc, y, 50, a, pg);
      const c = p2[i];

      doc.font("Helvetica-Bold").fontSize(9.5).fillColor(B.primary).text(`${off + i + 1}.`, ML, y, { continued: true });
      doc.font("Helvetica-Bold").fontSize(9.5).fillColor(B.text).text(` ${c.description}`, { width: CW - 20 });
      y = doc.y + 2;

      if (c.recommendation) {
        doc.font("Helvetica").fontSize(8.5).fillColor(B.textSec);
        doc.text(c.recommendation, ML + 14, y, { width: CW - 28 });
        y = doc.y + 2;
      }
      if (c.estimatedFixMinutes) {
        doc.font("Helvetica-Oblique").fontSize(7.5).fillColor(B.textMuted);
        doc.text(`Est. fix time: ~${c.estimatedFixMinutes} min`, ML + 14, y);
        y = doc.y + 6;
      } else {
        y += 4;
      }
    }
  }

  // ── Additional Recommendations (failed but not quick-win) ──
  const extras = failRecs.filter((c) => !qw.some((q) => q.checkId === c.checkId));
  if (extras.length > 0) {
    y += 10;
    y = brk(doc, y, 30, a, pg);

    doc.font("Helvetica-Bold").fontSize(11).fillColor(B.primary).text("Additional Recommendations", ML, y);
    y += 18;

    const off2 = qw.length;
    for (let i = 0; i < extras.length; i++) {
      y = brk(doc, y, 40, a, pg);
      const c = extras[i];

      doc.font("Helvetica-Bold").fontSize(9.5).fillColor(B.primary).text(`${off2 + i + 1}.`, ML, y, { continued: true });
      doc.font("Helvetica-Bold").fontSize(9.5).fillColor(B.text).text(` ${c.description}`, { width: CW - 20 });
      y = doc.y + 2;

      if (c.recommendation) {
        doc.font("Helvetica").fontSize(8.5).fillColor(B.textSec);
        doc.text(c.recommendation, ML + 14, y, { width: CW - 28 });
        y = doc.y + 6;
      }
    }
  }

  // ── AI Strategic Actions ──
  if (ai.priorityActions?.strategic?.length) {
    y += 10;
    y = brk(doc, y, 40, a, pg);

    doc.font("Helvetica-Bold").fontSize(11).fillColor(B.primary).text("Strategic — Long-Term Improvements", ML, y);
    y += 18;

    for (let i = 0; i < ai.priorityActions.strategic.length; i++) {
      y = brk(doc, y, 20, a, pg);
      doc.font("Helvetica").fontSize(8.5).fillColor(B.textSec);
      doc.text(`▸ ${ai.priorityActions.strategic[i]}`, ML + 6, y, { width: CW - 12 });
      y = doc.y + 4;
    }
  }

  // ── AI Wasted Spend Insights ──
  if (ai.wastedSpendInsights) {
    y += 10;
    y = brk(doc, y, 60, a, pg);

    doc.roundedRect(ML, y, CW, 3, 0).fill(B.red);
    y += 6;
    doc.font("Helvetica-Bold").fontSize(9).fillColor(B.red).text("Wasted Spend Analysis", ML, y);
    y += 13;
    doc.font("Helvetica").fontSize(8.5).fillColor(B.textSec);
    doc.text(ai.wastedSpendInsights, ML + 8, y, { width: CW - 16 });
    y = doc.y + 4;
  }
}

// ═══════════════════════════════════════════════════════════
// SUMMARY MATRIX — ALL CHECKS
// ═══════════════════════════════════════════════════════════

function pageSummaryMatrix(
  doc: PDFKit.PDFDocument,
  a: AuditData["audit"],
  checks: AuditCheck[],
  pg: { v: number },
) {
  let y = 34;

  doc.font("Helvetica-Bold").fontSize(16).fillColor(B.text);
  doc.text(`Summary Matrix — All ${checks.length} Checks`, ML, y);
  y += 26;

  // # | Category | Check | Status
  const cols = [
    { x: ML, w: 22, label: "#" },
    { x: ML + 22, w: 65, label: "Category" },
    { x: ML + 87, w: CW - 142, label: "Check" },
    { x: ML + CW - 55, w: 55, label: "Status" },
  ];
  y = tHead(doc, y, cols);

  const abbrMap: Record<string, string> = {};
  for (const c of CATEGORIES) abbrMap[c.key] = c.abbr;

  for (let i = 0; i < checks.length; i++) {
    const ck = checks[i];
    const hasDetails = (ck.result === "fail" || ck.result === "warning" || ck.result === "manual") && ck.details;
    const rowH = 14;
    const detailH = hasDetails ? 12 : 0;
    const totalH = rowH + detailH;

    if (y + totalH > CONTENT_BOTTOM) {
      doc.addPage(); // pageAdded event handles hf() + pg.v++
      y = CONTENT_TOP;
      y = tHead(doc, y, cols);
    }

    const bg = i % 2 === 1 ? B.accentWash : undefined;
    if (bg) doc.rect(ML, y, CW, totalH).fill(bg);

    const abbr = abbrMap[ck.category] ?? ck.category.slice(0, 10);
    const sc = statusColor(ck.result);

    doc.font("Helvetica").fontSize(6.5).fillColor(B.textMuted);
    doc.text(`${i + 1}`, cols[0].x + 3, y + 3, { width: cols[0].w - 6 });

    doc.font("Helvetica").fontSize(6.5).fillColor(B.textSec);
    doc.text(abbr, cols[1].x + 3, y + 3, { width: cols[1].w - 6 });

    doc.font("Helvetica").fontSize(6.5).fillColor(B.text);
    doc.text(ck.description, cols[2].x + 3, y + 3, { width: cols[2].w - 6 });

    doc.font("Helvetica-Bold").fontSize(6.5).fillColor(sc);
    doc.text(statusLabel(ck.result), cols[3].x + 3, y + 3, { width: cols[3].w - 6 });

    // Details sub-row for fail/warning/manual checks
    if (hasDetails) {
      doc.font("Helvetica").fontSize(5.5).fillColor(B.textMuted);
      const detailText = truncate(ck.details!, 160);
      doc.text(`↳ ${detailText}`, cols[1].x + 3, y + rowH + 1, { width: CW - cols[1].x + ML - 6 });
    }

    y += totalH;
  }
}

// ─── Utility ─────────────────────────────────────────────

function truncate(s: string, max: number): string {
  return s.length > max ? s.slice(0, max - 1) + "…" : s;
}
