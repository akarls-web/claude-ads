/**
 * SterlingX Paid Ads Audit Engine — Family Law Edition
 *
 * Implements 96 Google Ads audit checks + 15 SterlingX agency checks = 111 total.
 * Includes family law industry specialization (FL01-FL04),
 * lead gen conversion hardening (CT-FL1 through CT-FL10),
 * and enhanced settings & extensions checks (ST01-ST08).
 */

export type CheckResult = "pass" | "warning" | "fail" | "skipped" | "manual";
export type Severity = "critical" | "high" | "medium" | "low";
export type Grade = "A" | "B" | "C" | "D" | "F";

export interface AuditCheckResult {
  checkId: string;
  category: string;
  description: string;
  result: CheckResult;
  severity: Severity;
  details: string;
  recommendation: string;
  isQuickWin: boolean;
  estimatedFixMinutes: number;
}

export interface AuditReport {
  score: number;
  grade: Grade;
  totalChecks: number;
  passCount: number;
  warningCount: number;
  failCount: number;
  skippedCount: number;
  manualCount: number;
  checks: AuditCheckResult[];
  summary: string;
  quickWins: AuditCheckResult[];
  categoryScores: Record<string, number>;
}

// ─── Scoring Constants ───────────────────────────────────

const SEVERITY_MULTIPLIER: Record<Severity, number> = {
  critical: 5.0,
  high: 3.0,
  medium: 1.5,
  low: 1.0,
};

const CATEGORY_WEIGHTS: Record<string, number> = {
  "Conversion Tracking": 0.25,
  "Wasted Spend": 0.20,
  "Account Structure": 0.15,
  "Keywords & Quality Score": 0.15,
  "Ads & Assets": 0.15,
  "Settings & Targeting": 0.10,
};

// ─── Helper Functions ────────────────────────────────────

/* eslint-disable @typescript-eslint/no-explicit-any */

function microsToValue(micros: number | string | undefined): number {
  if (micros === undefined || micros === null) return 0;
  return Number(micros) / 1_000_000;
}

function safeDiv(n: number, d: number): number {
  return d === 0 ? 0 : n / d;
}

function gradeFromScore(score: number): Grade {
  if (score >= 90) return "A";
  if (score >= 75) return "B";
  if (score >= 60) return "C";
  if (score >= 40) return "D";
  return "F";
}

type AuditData = Record<string, any>;
type CheckFn = (data: AuditData) => AuditCheckResult;

function check(
  id: string,
  category: string,
  description: string,
  severity: Severity,
  fixMinutes: number,
  fn: (data: AuditData) => { result: CheckResult; details: string; recommendation: string },
): CheckFn {
  return (data: AuditData) => {
    try {
      const { result, details, recommendation } = fn(data);
      const isQuickWin =
        (severity === "critical" || severity === "high") &&
        fixMinutes <= 15 &&
        result === "fail";
      return { checkId: id, category, description, result, severity, details, recommendation, isQuickWin, estimatedFixMinutes: fixMinutes };
    } catch {
      return { checkId: id, category, description, result: "skipped" as CheckResult, severity, details: "Unable to evaluate — insufficient data", recommendation: "Provide data access for this check", isQuickWin: false, estimatedFixMinutes: fixMinutes };
    }
  };
}

// ═══════════════════════════════════════════════════════════
// CONVERSION TRACKING — 21 checks (25% weight)
// G42-G49, G-CT1-CT3, CT-FL1 through CT-FL10
// ═══════════════════════════════════════════════════════════

const conversionChecks: CheckFn[] = [
  // G42 — Conversion actions defined
  check("G42", "Conversion Tracking", "Conversion actions defined", "critical", 10, (d) => {
    const convs = d.conversions ?? [];
    const active = convs.filter((c: any) => c.conversionAction?.status === "ENABLED");
    if (active.length > 0) return { result: "pass", details: `${active.length} active conversion actions`, recommendation: "" };
    return { result: "fail", details: "No active conversion actions found", recommendation: "Set up conversion tracking immediately — without it you cannot optimize campaigns" };
  }),

  // G43 — Enhanced conversions enabled
  check("G43", "Conversion Tracking", "Enhanced conversions enabled", "critical", 5, (d) => {
    const convs = d.conversions ?? [];
    const hasEnhanced = convs.some((c: any) =>
      c.conversionAction?.type === "UPLOAD_CLICKS" || c.conversionAction?.type === "WEBPAGE"
    );
    if (hasEnhanced) return { result: "pass", details: "Enhanced conversions detected", recommendation: "" };
    return { result: "warning", details: "No enhanced conversions detected", recommendation: "Enable enhanced conversions to improve conversion measurement accuracy by 5-15%" };
  }),

  // G44 — Server-side tracking
  check("G44", "Conversion Tracking", "Server-side tracking active", "high", 30, (d) => {
    const convs = d.conversions ?? [];
    const serverSide = convs.some((c: any) =>
      c.conversionAction?.type === "UPLOAD_CLICKS" ||
      c.conversionAction?.type === "UPLOAD_CALLS" ||
      c.conversionAction?.type === "STORE_SALES"
    );
    if (serverSide) return { result: "pass", details: "Server-side conversion import detected", recommendation: "" };
    return { result: "warning", details: "No server-side conversion tracking detected", recommendation: "Implement server-side tracking via Google Ads API conversion import or server-side GTM for more reliable data" };
  }),

  // G45 — Consent Mode v2 (EU/EEA)
  check("G45", "Conversion Tracking", "Consent Mode v2 (EU/EEA)", "critical", 30, (d) => {
    const account = d.account?.[0];
    if (!account) return { result: "skipped", details: "Unable to detect consent mode status", recommendation: "Verify Consent Mode v2 is implemented for EU/EEA compliance" };
    return { result: "manual", details: "Cannot verify Consent Mode v2 remotely — manual check required", recommendation: "Ensure Consent Mode v2 is implemented with a supported CMP for GDPR compliance" };
  }),

  // G46 — Conversion window appropriate
  check("G46", "Conversion Tracking", "Conversion window matches sales cycle", "medium", 10, (d) => {
    const convs = d.conversions ?? [];
    if (convs.length === 0) return { result: "skipped", details: "No conversions to check", recommendation: "" };
    const primary = convs.filter((c: any) => c.conversionAction?.includeInConversionsMetric === true && c.conversionAction?.status === "ENABLED");
    if (primary.length === 0) return { result: "skipped", details: "No primary conversions", recommendation: "" };
    const hasWindowData = primary.some((c: any) => c.conversionAction?.clickThroughLookbackWindowDays != null);
    if (!hasWindowData) return { result: "warning", details: "Conversion window data not available via API", recommendation: "Verify window matches sales cycle: 30d for lead gen, 30-90d for family law" };
    const issues: string[] = [];
    for (const c of primary) {
      const window = c.conversionAction?.clickThroughLookbackWindowDays;
      const name = c.conversionAction?.name ?? "Unknown";
      if (window != null && (window < 30 || window > 90)) issues.push(`${name}: ${window}d`);
    }
    if (issues.length === 0) return { result: "pass", details: "All conversion windows within recommended range (30-90 days)", recommendation: "" };
    return { result: "warning", details: `Windows outside recommended range: ${issues.join(", ")}`, recommendation: "Set conversion window to 30 days for lead gen. Family law sales cycles can extend to 90 days for retained cases" };
  }),

  // G47 — Micro vs macro separation (Primary vs Secondary) + Count setting
  check("G47", "Conversion Tracking", "Micro vs macro conversion separation", "high", 10, (d) => {
    const convs = d.conversions ?? [];
    if (convs.length === 0) return { result: "skipped", details: "No conversions", recommendation: "" };
    const primary = convs.filter((c: any) => c.conversionAction?.includeInConversionsMetric === true);
    const secondary = convs.filter((c: any) => c.conversionAction?.includeInConversionsMetric === false);
    const issues: string[] = [];
    if (primary.length > 0 && secondary.length === 0) issues.push("All conversions marked as primary — micro-conversions may pollute bidding signals");
    if (primary.length === 0) issues.push("No primary conversion actions identified");
    if (issues.length === 0 && primary.length > 0 && secondary.length > 0) {
      return { result: "pass", details: `${primary.length} primary, ${secondary.length} secondary actions — properly separated`, recommendation: "" };
    }
    if (primary.length === 0) return { result: "fail", details: issues.join(". "), recommendation: "Designate your main revenue/lead actions as primary; mark micro-conversions as secondary" };
    return { result: "warning", details: issues.join(". "), recommendation: "Mark supporting actions (page views, scroll depth, AddToCart) as secondary to avoid bid signal pollution. For lead gen, ensure count is set to 'One' not 'Every'" };
  }),

  // G48 — Attribution model
  check("G48", "Conversion Tracking", "Data-driven attribution model active", "medium", 5, (d) => {
    const convs = d.conversions ?? [];
    if (convs.length === 0) return { result: "skipped", details: "No conversions", recommendation: "" };
    const primary = convs.filter((c: any) => c.conversionAction?.includeInConversionsMetric === true && c.conversionAction?.status === "ENABLED");
    if (primary.length === 0) return { result: "skipped", details: "No primary conversions", recommendation: "" };
    const hasModelData = primary.some((c: any) => c.conversionAction?.attributionModelSettings?.attributionModel);
    if (!hasModelData) return { result: "warning", details: "Attribution model data not available via API", recommendation: "Verify Data-Driven Attribution (DDA) is active for all conversion actions" };
    const nonDDA = primary.filter((c: any) => {
      const model = c.conversionAction?.attributionModelSettings?.attributionModel;
      return model && model !== "GOOGLE_SEARCH_ATTRIBUTION_DATA_DRIVEN" && model !== "EXTERNAL";
    });
    if (nonDDA.length === 0) return { result: "pass", details: "All primary conversions use Data-Driven Attribution", recommendation: "" };
    const models = nonDDA.map((c: any) => `${c.conversionAction?.name}: ${c.conversionAction?.attributionModelSettings?.attributionModel}`);
    return { result: "fail", details: `${nonDDA.length} conversions not using DDA: ${models.join(", ")}`, recommendation: "Switch all conversion actions to Data-Driven Attribution. Rule-based models were deprecated Sep 2025" };
  }),

  // G49 — Conversion value assignment
  check("G49", "Conversion Tracking", "Conversion values assigned", "high", 15, (d) => {
    const campaigns = d.campaigns ?? [];
    const hasValue = campaigns.some((c: any) => Number(c.metrics?.conversionsValue ?? 0) > 0);
    if (hasValue) return { result: "pass", details: "Conversion values are being tracked", recommendation: "" };
    const convs = d.conversions ?? [];
    if (convs.length === 0) return { result: "skipped", details: "No conversions", recommendation: "" };
    return { result: "warning", details: "No conversion value data detected", recommendation: "Set up dynamic values for e-commerce; assign static values for lead gen to enable value-based bidding" };
  }),

  // G-CT1 — No duplicate conversion counting
  check("G-CT1", "Conversion Tracking", "No duplicate conversion counting", "critical", 15, (d) => {
    const convs = d.conversions ?? [];
    const names = convs.map((c: any) => (c.conversionAction?.name ?? "").toLowerCase()).filter(Boolean);
    const seen = new Set<string>();
    const dupes: string[] = [];
    for (const n of names) { if (seen.has(n)) dupes.push(n); seen.add(n); }
    if (dupes.length === 0) return { result: "pass", details: "No duplicate conversion names detected", recommendation: "" };
    return { result: "fail", details: `Possible duplicate conversions: ${[...new Set(dupes)].join(", ")}`, recommendation: "Remove or consolidate duplicate conversion actions to prevent double-counting" };
  }),

  // G-CT2 — GA4 linked and flowing
  check("G-CT2", "Conversion Tracking", "GA4 linked and data flowing", "high", 15, (d) => {
    const account = d.account?.[0];
    const trackingId = account?.customer?.conversionTrackingSetting?.conversionTrackingId;
    const crossAccount = account?.customer?.conversionTrackingSetting?.crossAccountConversionTrackingId;
    if (trackingId || crossAccount) return { result: "pass", details: "Conversion tracking ID detected — GA4 likely linked", recommendation: "" };
    return { result: "fail", details: "No conversion tracking integration detected", recommendation: "Link GA4 to Google Ads for cross-platform attribution and audience sharing" };
  }),

  // G-CT3 — Google Tag firing correctly (enhanced with landing page HTML scan)
  check("G-CT3", "Conversion Tracking", "Google Tag firing on all pages", "critical", 15, (d) => {
    const convs = d.conversions ?? [];
    const lpAnalysis = d.landingPageAnalysis ?? [];
    const hasTag = convs.some((c: any) => c.conversionAction?.tagSnippets?.length > 0);
    if (hasTag) return { result: "pass", details: "Tag snippets configured for conversion actions", recommendation: "" };
    // Check landing pages for gtag/GTM
    if (lpAnalysis.length > 0) {
      const withTag = lpAnalysis.filter((lp: any) => lp.hasGtag || lp.hasGTM);
      if (withTag.length === lpAnalysis.length) {
        const tagType = withTag[0].hasGTM ? `GTM (${withTag[0].gtmContainerId ?? "detected"})` : "gtag.js";
        return { result: "pass", details: `${tagType} detected on ${withTag.length}/${lpAnalysis.length} landing pages`, recommendation: "" };
      }
      if (withTag.length > 0) {
        const missing = lpAnalysis.filter((lp: any) => !lp.hasGtag && !lp.hasGTM).map((lp: any) => lp.url);
        return { result: "warning", details: `Tag found on ${withTag.length}/${lpAnalysis.length} pages. Missing: ${missing.join(", ")}`, recommendation: "Ensure gtag.js or GTM fires on ALL landing pages including thank-you pages" };
      }
      return { result: "fail", details: `No Google Tag detected on ${lpAnalysis.length} landing pages analyzed`, recommendation: "Install Google Tag Manager or gtag.js across all landing pages" };
    }
    if (convs.length === 0) return { result: "skipped", details: "No conversions configured", recommendation: "" };
    return { result: "warning", details: "Cannot verify tag firing — no landing page data available", recommendation: "Use Google Tag Assistant to verify gtag.js or GTM fires correctly on all key pages" };
  }),

  // ── Lead Gen Conversion Hardening (CT-FL1 through CT-FL10) ──

  // CT-FL1 — Form fill = single conversion action
  check("CT-FL1", "Conversion Tracking", "Form fill = single conversion action", "high", 10, (d) => {
    const convs = d.conversions ?? [];
    const formActions = convs.filter((c: any) => {
      const name = (c.conversionAction?.name ?? "").toLowerCase();
      return /form|submit|lead|contact|inquiry|enquiry/.test(name) &&
        c.conversionAction?.status === "ENABLED" &&
        c.conversionAction?.category !== "PHONE_CALL";
    });
    if (formActions.length === 1) return { result: "pass", details: "Single form fill conversion action — properly configured", recommendation: "" };
    if (formActions.length === 0) return { result: "fail", details: "No form fill conversion action detected", recommendation: "Set up a GA4 form submission event imported into Google Ads as a single conversion action" };
    return { result: "warning", details: `${formActions.length} form fill conversion actions found — risk of double-counting`, recommendation: "Consolidate to one form fill conversion action. Multiple form actions inflate conversion counts and mislead bidding algorithms" };
  }),

  // CT-FL2 — Call tracking platform present
  check("CT-FL2", "Conversion Tracking", "Call tracking platform integrated", "high", 15, (d) => {
    const convs = d.conversions ?? [];
    const callConvs = convs.filter((c: any) => {
      const name = (c.conversionAction?.name ?? "").toLowerCase();
      const type = c.conversionAction?.type ?? "";
      const cat = c.conversionAction?.category ?? "";
      return cat === "PHONE_CALL" || type === "UPLOAD_CALLS" || /call|phone|callrail|ctm|calltrack/i.test(name);
    });
    if (callConvs.length > 0) return { result: "pass", details: `Call tracking detected: ${callConvs.length} call conversion actions`, recommendation: "" };
    return { result: "fail", details: "No call tracking integration detected (CallRail, CTM, or Google forwarding)", recommendation: "Implement call tracking via CallRail or CallTrackingMetrics. Connect integration to Google Ads so call conversions feed into bidding" };
  }),

  // CT-FL3 — Calls from Ads conversion action active
  check("CT-FL3", "Conversion Tracking", "Calls from Ads extension active & primary", "high", 10, (d) => {
    const convs = d.conversions ?? [];
    const callsFromAds = convs.filter((c: any) => {
      const name = (c.conversionAction?.name ?? "").toLowerCase();
      return /calls? from ads|call extension|click.?to.?call/.test(name) || c.conversionAction?.type === "AD_CALL";
    });
    if (callsFromAds.length > 0) {
      const isPrimary = callsFromAds.some((c: any) => c.conversionAction?.includeInConversionsMetric === true);
      if (isPrimary) return { result: "pass", details: "Calls from Ads conversion action is active and primary", recommendation: "" };
      return { result: "warning", details: "Calls from Ads exists but is not marked as primary", recommendation: "Mark Calls from Ads as a primary conversion action so it feeds into Smart Bidding optimization" };
    }
    return { result: "fail", details: "No Calls from Ads conversion action detected", recommendation: "Enable call extensions with a 'Calls from ads' conversion action. This captures phone calls directly from ad click-to-call" };
  }),

  // CT-FL4 — Offline conversion funnel staged (Qualified → Consultation → Closed)
  check("CT-FL4", "Conversion Tracking", "Offline conversion funnel staged", "medium", 20, (d) => {
    const convs = d.conversions ?? [];
    const offlineNames = convs
      .filter((c: any) => c.conversionAction?.type === "UPLOAD_CLICKS" || c.conversionAction?.type === "UPLOAD_CALLS" || c.conversionAction?.type === "STORE_SALES")
      .map((c: any) => (c.conversionAction?.name ?? "").toLowerCase());
    if (offlineNames.length === 0) return { result: "warning", details: "No offline conversions set up — cannot track lead quality past initial inquiry", recommendation: "Set up offline conversion import (CRM, Zapier, or manual upload) with staged events: Qualified Lead → Consultation → Closed/Funded" };
    const stages = {
      qualified: offlineNames.some((n: string) => /qualified|mql|sql|vetted/.test(n)),
      consultation: offlineNames.some((n: string) => /consult|appointment|meeting|booked/.test(n)),
      closed: offlineNames.some((n: string) => /closed|funded|won|retained|signed/.test(n)),
    };
    const stageCount = Object.values(stages).filter(Boolean).length;
    if (stageCount >= 2) return { result: "pass", details: `Offline funnel has ${stageCount}/3 stages: ${Object.entries(stages).filter(([,v]) => v).map(([k]) => k).join(", ")}`, recommendation: "" };
    if (stageCount === 1) return { result: "warning", details: `Only 1 offline funnel stage detected. Missing: ${Object.entries(stages).filter(([,v]) => !v).map(([k]) => k).join(", ")}`, recommendation: "Add additional funnel stages (Qualified Lead = $500, Consultation = $1,000, Closed/Funded = actual value) for accurate value-based bidding" };
    return { result: "warning", details: "Offline conversions exist but no recognizable funnel stages (qualified, consultation, closed)", recommendation: "Rename offline conversion actions to reflect funnel stages and assign values for value-based bidding optimization" };
  }),

  // CT-FL5 — Conversion count = "One" (lead gen standard)
  check("CT-FL5", "Conversion Tracking", "Conversion count set to 'One' (lead gen)", "critical", 5, (d) => {
    const convs = d.conversions ?? [];
    if (convs.length === 0) return { result: "skipped", details: "No conversions", recommendation: "" };
    const primary = convs.filter((c: any) => c.conversionAction?.includeInConversionsMetric === true && c.conversionAction?.status === "ENABLED");
    if (primary.length === 0) return { result: "skipped", details: "No primary conversions to check", recommendation: "" };
    const hasCountData = primary.some((c: any) => c.conversionAction?.countingType);
    if (!hasCountData) return { result: "warning", details: `${primary.length} primary conversions — counting type data not available`, recommendation: "Verify all primary conversions use 'Count: One' for lead gen" };
    const manyPerClick = primary.filter((c: any) => c.conversionAction?.countingType === "MANY_PER_CLICK");
    if (manyPerClick.length === 0) return { result: "pass", details: `All ${primary.length} primary conversions set to 'One per click'`, recommendation: "" };
    const names = manyPerClick.map((c: any) => c.conversionAction?.name).join(", ");
    return { result: "fail", details: `${manyPerClick.length} primary conversions set to 'Every': ${names}`, recommendation: "Switch all lead gen conversions to 'Count: One'. 'Every' counts repeat form fills/calls from the same person, inflating numbers and misleading Smart Bidding" };
  }),

  // CT-FL6 — Low-value actions not marked as Primary
  check("CT-FL6", "Conversion Tracking", "No low-value actions marked Primary", "critical", 10, (d) => {
    const convs = d.conversions ?? [];
    const primary = convs.filter((c: any) => c.conversionAction?.includeInConversionsMetric === true && c.conversionAction?.status === "ENABLED");
    const lowValue = primary.filter((c: any) => {
      const name = (c.conversionAction?.name ?? "").toLowerCase();
      return /scroll|page.?view|time.?on|button.?click|newsletter|signup|download|pdf|chat|video|watch|engaged/i.test(name);
    });
    if (lowValue.length === 0) return { result: "pass", details: "No low-value micro-conversions marked as primary", recommendation: "" };
    const names = lowValue.map((c: any) => c.conversionAction?.name).join(", ");
    return { result: "fail", details: `Low-value actions marked as primary: ${names}`, recommendation: "Move low-value actions (page scrolls, button clicks, newsletter signups) to secondary. They inflate conversion counts and mislead Smart Bidding" };
  }),

  // CT-FL7 — Custom Goal includes required primary actions
  check("CT-FL7", "Conversion Tracking", "Custom Goals include required actions", "medium", 10, (d) => {
    const convs = d.conversions ?? [];
    if (convs.length === 0) return { result: "skipped", details: "No conversions", recommendation: "" };
    // Custom Goals cannot be queried via API — flag for manual review
    return { result: "manual", details: "Custom Goal configuration requires manual review", recommendation: "If campaigns use Custom Goals, verify they include all 3 required primary actions: Form Fill, Website Calls (via tracking), and Calls from Ads. Custom Goals should NOT include low-value actions" };
  }),

  // CT-FL8 — Auto-tagging enabled
  check("CT-FL8", "Conversion Tracking", "Auto-tagging enabled", "critical", 2, (d) => {
    const account = d.account?.[0];
    if (!account) return { result: "skipped", details: "No account data", recommendation: "" };
    const autoTag = account.customer?.autoTaggingEnabled;
    if (autoTag === true) return { result: "pass", details: "Auto-tagging is enabled", recommendation: "" };
    if (autoTag === false) return { result: "fail", details: "Auto-tagging is disabled — conversion tracking and Analytics linking will not work properly", recommendation: "Enable auto-tagging immediately. It's required for Google Ads conversion tracking, GA4 integration, and accurate campaign attribution" };
    return { result: "warning", details: "Auto-tagging status could not be determined", recommendation: "Verify auto-tagging is enabled under Account Settings → Auto-tagging" };
  }),

  // CT-FL9 — Tracking template audit (now automated via API)
  check("CT-FL9", "Conversion Tracking", "Tracking template configuration", "medium", 10, (d) => {
    const campaigns = d.campaigns ?? [];
    const active = campaigns.filter((c: any) => c.campaign?.status === "ENABLED");
    if (active.length === 0) return { result: "skipped", details: "No active campaigns", recommendation: "" };
    const withTemplate = active.filter((c: any) => c.campaign?.trackingUrlTemplate);
    if (withTemplate.length === active.length) return { result: "pass", details: `All ${active.length} active campaigns have tracking templates configured`, recommendation: "" };
    if (withTemplate.length > 0) return { result: "warning", details: `${withTemplate.length}/${active.length} campaigns have tracking templates — inconsistent`, recommendation: "Standardize tracking templates across all campaigns. Campaign-level templates override account-level" };
    return { result: "warning", details: "No campaign-level tracking templates detected", recommendation: "Verify an account-level tracking template is set, or add campaign-level templates for consistent UTM tracking" };
  }),

  // CT-FL10 — Offline conversion data volume healthy
  check("CT-FL10", "Conversion Tracking", "Offline conversion volume healthy", "high", 15, (d) => {
    const convs = d.conversions ?? [];
    const campaigns = d.campaigns ?? [];
    const offlineConvs = convs.filter((c: any) =>
      c.conversionAction?.type === "UPLOAD_CLICKS" || c.conversionAction?.type === "UPLOAD_CALLS"
    );
    if (offlineConvs.length === 0) return { result: "skipped", details: "No offline conversions configured", recommendation: "" };
    const totalOnlineConvs = campaigns.reduce((sum: number, c: any) => sum + Number(c.metrics?.conversions ?? 0), 0);
    if (totalOnlineConvs === 0) return { result: "skipped", details: "No online conversion data to compare", recommendation: "" };
    // Cannot get offline conversion counts directly from this query — flag for manual review
    return { result: "manual", details: `Total account conversions: ${totalOnlineConvs.toFixed(0)} — verify offline volume is proportional`, recommendation: "Compare offline conversion volume to total leads. If Google Ads shows 40 leads but offline tracking shows only 5 qualified leads, investigate data flow issues (CRM sync, Zapier triggers, manual upload cadence)" };
  }),
];

// ═══════════════════════════════════════════════════════════
// WASTED SPEND / NEGATIVES — 8 checks (20% weight)
// G13-G19, G-WS1
// ═══════════════════════════════════════════════════════════

const wastedSpendChecks: CheckFn[] = [
  // G13 — Search term audit recency
  check("G13", "Wasted Spend", "Search term audit recency (<14 days)", "critical", 15, (d) => {
    const changeHistory = d.changeHistory ?? [];
    if (changeHistory.length > 0) return { result: "pass", details: "Recent account activity detected in last 14 days", recommendation: "" };
    return { result: "warning", details: "No recent change history — search term review may be overdue", recommendation: "Review search terms at least every 14 days and add negatives for irrelevant queries" };
  }),

  // G14 — Negative keyword lists exist
  check("G14", "Wasted Spend", "Negative keyword lists (≥3 themed)", "critical", 10, (d) => {
    const negatives = d.negativeKeywords ?? [];
    if (negatives.length >= 30) return { result: "pass", details: `${negatives.length} negative keywords found across campaigns`, recommendation: "" };
    if (negatives.length >= 10) return { result: "warning", details: `Only ${negatives.length} negative keywords — consider adding more`, recommendation: "Build themed negative keyword lists (competitors, free/cheap, jobs, irrelevant categories)" };
    return { result: "fail", details: `Only ${negatives.length} negative keywords across all campaigns`, recommendation: "Create at least 3 themed negative keyword lists with 10+ terms each" };
  }),

  // G15 — Account-level negatives applied
  check("G15", "Wasted Spend", "Account-level negatives applied", "high", 10, (d) => {
    const negatives = d.negativeKeywords ?? [];
    const campaigns = d.campaigns ?? [];
    const activeCampaigns = campaigns.filter((c: any) => c.campaign?.status === "ENABLED");
    if (activeCampaigns.length === 0) return { result: "skipped", details: "No active campaigns", recommendation: "" };
    // Check what % of campaigns have negatives
    const campaignIds = new Set(negatives.map((n: any) => String(n.campaign?.id)));
    const coveragePct = safeDiv(campaignIds.size, activeCampaigns.length) * 100;
    if (coveragePct >= 80) return { result: "pass", details: `Negatives applied to ${coveragePct.toFixed(0)}% of active campaigns`, recommendation: "" };
    if (coveragePct >= 40) return { result: "warning", details: `Negatives only applied to ${coveragePct.toFixed(0)}% of campaigns`, recommendation: "Apply shared negative keyword lists at account or all-campaign level for consistent filtering" };
    return { result: "fail", details: `Negatives only cover ${coveragePct.toFixed(0)}% of campaigns`, recommendation: "Apply negative keyword lists to all campaigns to prevent irrelevant spend" };
  }),

  // G16 — Wasted spend on irrelevant terms (<5%)
  check("G16", "Wasted Spend", "Wasted spend on irrelevant terms (<5%)", "critical", 15, (d) => {
    const searchTerms = d.searchTerms ?? [];
    if (searchTerms.length === 0) return { result: "skipped", details: "No search term data available", recommendation: "" };
    const totalCost = searchTerms.reduce((sum: number, st: any) => sum + microsToValue(st.metrics?.costMicros), 0);
    const noConvTerms = searchTerms.filter((st: any) => Number(st.metrics?.conversions ?? 0) === 0 && microsToValue(st.metrics?.costMicros) > 0);
    const wastedCost = noConvTerms.reduce((sum: number, st: any) => sum + microsToValue(st.metrics?.costMicros), 0);
    const wastedPct = safeDiv(wastedCost, totalCost) * 100;
    if (wastedPct < 5) return { result: "pass", details: `${wastedPct.toFixed(1)}% spend on non-converting terms`, recommendation: "" };
    if (wastedPct < 15) return { result: "warning", details: `${wastedPct.toFixed(1)}% wasted spend on non-converting terms`, recommendation: "Add negative keywords for non-converting search terms to reduce waste" };
    return { result: "fail", details: `${wastedPct.toFixed(1)}% wasted spend — significant waste detected`, recommendation: "Urgently review search terms — negate irrelevant queries, pause broad match keywords causing waste" };
  }),

  // G17 — Broad Match + Manual CPC pairing
  check("G17", "Wasted Spend", "No Broad Match + Manual CPC pairing", "critical", 5, (d) => {
    const keywords = d.keywords ?? [];
    const broadManual = keywords.filter((k: any) =>
      k.adGroupCriterion?.keyword?.matchType === "BROAD" &&
      k.campaign?.biddingStrategyType === "MANUAL_CPC"
    );
    if (broadManual.length === 0) return { result: "pass", details: "No broad match keywords using Manual CPC", recommendation: "" };
    return { result: "fail", details: `${broadManual.length} broad match keywords using Manual CPC — uncontrolled spend risk`, recommendation: "Switch broad match keywords to Smart Bidding (Target CPA/ROAS) or change to phrase/exact match" };
  }),

  // G18 — Close variant pollution
  check("G18", "Wasted Spend", "Close variant pollution controlled", "high", 15, (d) => {
    const searchTerms = d.searchTerms ?? [];
    const keywords = d.keywords ?? [];
    if (searchTerms.length === 0 || keywords.length === 0) return { result: "skipped", details: "Insufficient data for close variant analysis", recommendation: "" };
    // Check for search terms that don't match any keyword (rough heuristic)
    const kwTexts = new Set(keywords.map((k: any) => (k.adGroupCriterion?.keyword?.text ?? "").toLowerCase()));
    const nonExact = searchTerms.filter((st: any) => {
      const term = (st.searchTermView?.searchTerm ?? "").toLowerCase();
      return !kwTexts.has(term) && microsToValue(st.metrics?.costMicros) > 10;
    });
    const pct = safeDiv(nonExact.length, searchTerms.length) * 100;
    if (pct < 30) return { result: "pass", details: `${pct.toFixed(0)}% of search terms are close variants — within acceptable range`, recommendation: "" };
    if (pct < 60) return { result: "warning", details: `${pct.toFixed(0)}% of search terms are variants — minor close variant issues`, recommendation: "Review close variant triggers and add negative keywords where variants are irrelevant" };
    return { result: "fail", details: `${pct.toFixed(0)}% of search terms don't match keywords — significant variant pollution`, recommendation: "Switch broad match to phrase/exact and add negatives to block irrelevant close variants" };
  }),

  // G19 — Search term visibility
  check("G19", "Wasted Spend", "Search term visibility (>60% visible)", "medium", 10, (d) => {
    const searchTerms = d.searchTerms ?? [];
    const campaigns = d.campaigns ?? [];
    if (searchTerms.length === 0) return { result: "skipped", details: "No search term data", recommendation: "" };
    const searchCampaigns = campaigns.filter((c: any) => c.campaign?.advertisingChannelType === "SEARCH");
    const totalSpend = searchCampaigns.reduce((sum: number, c: any) => sum + microsToValue(c.metrics?.costMicros), 0);
    const visibleSpend = searchTerms.reduce((sum: number, st: any) => sum + microsToValue(st.metrics?.costMicros), 0);
    const visPct = safeDiv(visibleSpend, totalSpend) * 100;
    if (totalSpend === 0) return { result: "skipped", details: "No search campaign spend", recommendation: "" };
    if (visPct > 60) return { result: "pass", details: `${visPct.toFixed(0)}% of search spend has visible search terms`, recommendation: "" };
    if (visPct > 40) return { result: "warning", details: `Only ${visPct.toFixed(0)}% of search term spend is visible`, recommendation: "High hidden search term ratio — may indicate broad match or Dynamic Search Ads. Review and add negatives" };
    return { result: "fail", details: `Only ${visPct.toFixed(0)}% of search term spend is visible — too opaque`, recommendation: "Reduce use of broad match; enable search term reports and review hidden spend regularly" };
  }),

  // G-WS1 — Zero-conversion keywords with significant spend
  check("G-WS1", "Wasted Spend", "No zero-conversion keywords with high spend", "high", 10, (d) => {
    const keywords = d.keywords ?? [];
    const zeroConv = keywords.filter((k: any) =>
      Number(k.metrics?.clicks ?? 0) > 100 &&
      Number(k.metrics?.conversions ?? 0) === 0
    );
    if (zeroConv.length === 0) return { result: "pass", details: "No keywords with >100 clicks and 0 conversions", recommendation: "" };
    if (zeroConv.length <= 3) return { result: "warning", details: `${zeroConv.length} keywords with >100 clicks and 0 conversions`, recommendation: "Review and pause or restructure these underperforming keywords" };
    return { result: "fail", details: `${zeroConv.length} keywords with >100 clicks and 0 conversions — significant waste`, recommendation: "Pause keywords with high clicks and zero conversions immediately, then review targeting and landing pages" };
  }),
];

// ═══════════════════════════════════════════════════════════
// ACCOUNT STRUCTURE — 16 checks (15% weight)
// G01-G12, FL01-FL04
// ═══════════════════════════════════════════════════════════

const structureChecks: CheckFn[] = [
  // G01 — Campaign naming convention
  check("G01", "Account Structure", "Campaign naming convention", "medium", 15, (d) => {
    const campaigns = d.campaigns ?? [];
    const names = campaigns.map((c: any) => c.campaign?.name ?? "");
    const hasConvention = names.filter((n: string) => /[_\-|]/.test(n) && n.length > 5).length;
    const pct = safeDiv(hasConvention, names.length) * 100;
    if (pct >= 80) return { result: "pass", details: `${pct.toFixed(0)}% of campaigns follow naming convention`, recommendation: "" };
    if (pct >= 40) return { result: "warning", details: `Only ${pct.toFixed(0)}% of campaigns have structured names`, recommendation: "Use consistent naming: [Brand]_[Type]_[Geo]_[Target] (e.g., SEARCH_BRAND_US_2026Q1)" };
    return { result: "fail", details: "No consistent campaign naming convention detected", recommendation: "Implement structured naming convention across all campaigns for better organization and reporting" };
  }),

  // G02 — Ad group naming convention
  check("G02", "Account Structure", "Ad group naming convention", "medium", 15, (d) => {
    const adGroups = d.adGroups ?? [];
    if (adGroups.length === 0) return { result: "skipped", details: "No ad groups", recommendation: "" };
    const names = adGroups.map((ag: any) => ag.adGroup?.name ?? "");
    const hasConvention = names.filter((n: string) => /[_\-|]/.test(n) && n.length > 3).length;
    const pct = safeDiv(hasConvention, names.length) * 100;
    if (pct >= 80) return { result: "pass", details: `${pct.toFixed(0)}% of ad groups follow naming convention`, recommendation: "" };
    if (pct >= 40) return { result: "warning", details: `Only ${pct.toFixed(0)}% of ad groups have structured names`, recommendation: "Match ad group naming to campaign pattern for consistency" };
    return { result: "fail", details: "No consistent ad group naming convention", recommendation: "Name ad groups clearly by theme/keyword group to improve account navigability" };
  }),

  // G03 — Single theme ad groups (≤15 keywords + semantic coherence)
  check("G03", "Account Structure", "Single theme ad groups (≤15 keywords)", "high", 20, (d) => {
    const keywords = d.keywords ?? [];
    if (keywords.length === 0) return { result: "skipped", details: "No keyword data", recommendation: "" };

    // PPC stop words — common modifiers that don't indicate theme
    const stopWords = new Set([
      "lawyer", "lawyers", "attorney", "attorneys", "law", "firm", "legal",
      "near", "me", "best", "top", "good", "cheap", "free", "affordable",
      "cost", "how", "much", "does", "what", "is", "a", "an", "the", "to",
      "for", "in", "of", "and", "or", "my", "get", "find", "hire", "need",
      "help", "service", "services", "consultation", "consult", "online",
      "local", "office", "county", "state", "city",
    ]);

    // Group keywords by ad group, collecting texts
    const kwByGroup = new Map<string, string[]>();
    for (const k of keywords) {
      const agId = String(k.adGroup?.id ?? k.campaign?.id ?? "unknown");
      const text = (k.adGroupCriterion?.keyword?.text ?? "").toLowerCase().trim();
      if (!text) continue;
      if (!kwByGroup.has(agId)) kwByGroup.set(agId, []);
      kwByGroup.get(agId)!.push(text);
    }

    const total = kwByGroup.size;
    if (total === 0) return { result: "skipped", details: "No keyword data", recommendation: "" };

    let oversizedCount = 0;
    let incoherentCount = 0;
    const incoherentExamples: string[] = [];

    for (const [, texts] of kwByGroup) {
      // Size check
      if (texts.length > 15) oversizedCount++;

      // Semantic coherence: tokenize, strip stop words, find dominant theme
      if (texts.length < 3) continue; // too few to judge coherence
      const tokenFreq = new Map<string, number>();
      for (const text of texts) {
        const tokens = text.replace(/[^a-z0-9\s]/g, "").split(/\s+/).filter((t) => t.length >= 3 && !stopWords.has(t));
        // Use a set per keyword to count doc-frequency (not term-frequency)
        const unique = new Set(tokens);
        for (const t of unique) {
          tokenFreq.set(t, (tokenFreq.get(t) ?? 0) + 1);
        }
      }

      if (tokenFreq.size === 0) continue;

      // Top theme word = most frequent meaningful token
      const sorted = [...tokenFreq.entries()].sort((a, b) => b[1] - a[1]);
      const topThemeWord = sorted[0][0];
      const topThemeCount = sorted[0][1];
      // How many keywords contain the top theme word?
      const coherence = topThemeCount / texts.length;

      // If <50% of keywords share the dominant theme, it's incoherent
      if (coherence < 0.5) {
        incoherentCount++;
        // Grab top 3 theme words to show the spread
        const topThemes = sorted.slice(0, 3).map(([w]) => w);
        if (incoherentExamples.length < 3) {
          incoherentExamples.push(`mixed themes: ${topThemes.join(", ")}`);
        }
      }
    }

    // Combine both signals
    const issues: string[] = [];
    if (oversizedCount > 0) issues.push(`${oversizedCount}/${total} ad groups have >15 keywords`);
    if (incoherentCount > 0) issues.push(`${incoherentCount}/${total} ad groups have mixed themes (<50% keyword coherence)`);

    if (issues.length === 0) return { result: "pass", details: `All ${total} ad groups have focused keyword themes (≤15 keywords, coherent topics)`, recommendation: "" };

    const problemPct = safeDiv(Math.max(oversizedCount, incoherentCount), total) * 100;
    const detail = issues.join("; ") + (incoherentExamples.length > 0 ? ` — e.g. ${incoherentExamples.join("; ")}` : "");

    if (problemPct < 25) return { result: "warning", details: detail, recommendation: "Split multi-theme ad groups into tighter single-topic groups (5-10 keywords each). Each practice area (Divorce, Custody, Support) should have its own ad group" };
    return { result: "fail", details: detail, recommendation: "Restructure ad groups into single-theme groups with ≤15 keywords. Group keywords by core topic — e.g., 'divorce', 'child custody', 'child support' should be separate ad groups for better ad relevance and Quality Score" };
  }),

  // G04 — Campaign count per objective (≤5 per funnel stage, grouped by location)
  check("G04", "Account Structure", "Campaign count per objective appropriate", "high", 30, (d) => {
    const campaigns = d.campaigns ?? [];
    const active = campaigns.filter((c: any) => c.campaign?.status === "ENABLED");
    if (active.length === 0) return { result: "skipped", details: "No active campaigns", recommendation: "" };

    // US state abbreviations for geo stripping
    const stateAbbrevs = new Set([
      "al","ak","az","ar","ca","co","ct","de","fl","ga","hi","id","il","in","ia",
      "ks","ky","la","me","md","ma","mi","mn","ms","mo","mt","ne","nv","nh","nj",
      "nm","ny","nc","nd","oh","ok","or","pa","ri","sc","sd","tn","tx","ut","vt",
      "va","wa","wv","wi","wy","dc",
    ]);

    // Strip geographic identifiers from campaign name to find the "base objective"
    const stripGeo = (name: string): string => {
      let n = name.toLowerCase().trim();
      // Remove zip codes (5-digit or 5+4)
      n = n.replace(/\b\d{5}(-\d{4})?\b/g, "");
      // Remove state abbreviations when preceded by separator
      n = n.replace(/[\s_\-|]+([a-z]{2})(?=[\s_\-|]*$)/g, (match, abbr) => stateAbbrevs.has(abbr) ? "" : match);
      // Remove common geo suffixes: city, county, metro, area, region, market, dma
      n = n.replace(/[\s_\-|]+(city|county|metro|area|region|market|dma)[\s_\-|]*/gi, " ");
      // Remove directional qualifiers
      n = n.replace(/[\s_\-|]+(north|south|east|west|central|northeast|northwest|southeast|southwest|nw|ne|sw|se)[\s_\-|]*/gi, " ");
      // Remove trailing geo segment after last separator (e.g., "Search_Brand_Dallas" → "Search_Brand")
      // Only if the preceding part already contains meaningful structure (at least one separator)
      n = n.replace(/[\s_\-|]+[a-z]+[\s_\-|]*$/, (match) => {
        // Keep it if it looks like a campaign type keyword
        const term = match.replace(/[\s_\-|]+/g, "").toLowerCase();
        const campaignTerms = new Set(["search","brand","nonbrand","pmax","display","video","remarketing","retargeting","dsa","discovery","demandgen","shopping","generic","prospect","broad","exact","phrase"]);
        return campaignTerms.has(term) ? match : "";
      });
      // Normalize whitespace and separators
      n = n.replace(/[\s_\-|]+/g, "_").replace(/^_|_$/g, "");
      return n || "unnamed";
    };

    // Group campaigns by their base objective (geo-stripped name + channel type)
    const objectiveGroups = new Map<string, number>();
    for (const c of active) {
      const name = c.campaign?.name ?? "";
      const channelType = c.campaign?.advertisingChannelType ?? "UNKNOWN";
      const baseObjective = `${channelType}::${stripGeo(name)}`;
      objectiveGroups.set(baseObjective, (objectiveGroups.get(baseObjective) ?? 0) + 1);
    }

    const uniqueObjectives = objectiveGroups.size;
    const totalActive = active.length;
    const isGeoExpanded = uniqueObjectives < totalActive;
    const geoNote = isGeoExpanded ? ` (${totalActive} total campaigns across ${Math.round(totalActive / uniqueObjectives)} location groups)` : "";

    if (uniqueObjectives <= 5) return { result: "pass", details: `${uniqueObjectives} unique campaign objectives${geoNote} — well-organized`, recommendation: "" };
    if (uniqueObjectives <= 15) return { result: "pass", details: `${uniqueObjectives} unique campaign objectives${geoNote}`, recommendation: "" };
    if (uniqueObjectives <= 25) return { result: "warning", details: `${uniqueObjectives} unique campaign objectives${geoNote} — may be spreading budget`, recommendation: "Consider consolidating campaigns. Google AI performs better with fewer, well-funded campaigns" };
    return { result: "fail", details: `${uniqueObjectives} unique campaign objectives${geoNote} — likely fragmented`, recommendation: "Consolidate to ≤5 campaigns per funnel stage/objective. Fragmentation starves AI-powered bidding of data" };
  }),

  // G05 — Brand vs Non-Brand separation
  check("G05", "Account Structure", "Brand vs non-brand separation", "critical", 10, (d) => {
    const campaigns = d.campaigns ?? [];
    const search = campaigns.filter((c: any) => c.campaign?.advertisingChannelType === "SEARCH");
    if (search.length === 0) return { result: "skipped", details: "No search campaigns", recommendation: "" };

    // Build brand tokens from account descriptive name
    const accountName = (d.account?.[0]?.customer?.descriptiveName ?? "").toLowerCase();
    const brandTokens = accountName
      .replace(/[^a-z0-9\s]/g, "")
      .split(/\s+/)
      .filter((t: string) => t.length >= 3);

    // Method 1: Campaign name matching (existing heuristic)
    const names = search.map((c: any) => (c.campaign?.name ?? "").toLowerCase());
    const hasBrandName = names.some((n: string) => /brand/.test(n));
    const hasNonBrandName = names.some((n: string) => /non.?brand|generic|prospect/.test(n));

    // Method 2: Keyword-level brand detection
    const keywords = d.keywords ?? [];
    const searchCampaignIds = new Set(search.map((c: any) => String(c.campaign?.id)));
    const searchKeywords = keywords.filter((k: any) => searchCampaignIds.has(String(k.campaign?.id)));

    // Classify each campaign by whether its keywords contain brand terms
    const campaignBrandStatus = new Map<string, { name: string; brandKws: number; totalKws: number }>();
    for (const kw of searchKeywords) {
      const cId = String(kw.campaign?.id);
      const cName = (kw.campaign?.name ?? "").toLowerCase();
      const kwText = (kw.adGroupCriterion?.keyword?.text ?? "").toLowerCase();
      if (!campaignBrandStatus.has(cId)) {
        campaignBrandStatus.set(cId, { name: cName, brandKws: 0, totalKws: 0 });
      }
      const entry = campaignBrandStatus.get(cId)!;
      entry.totalKws++;
      // A keyword is "brand" if it contains any significant token from the business name
      if (brandTokens.length > 0 && brandTokens.some((t: string) => kwText.includes(t))) {
        entry.brandKws++;
      }
    }

    // A campaign is "brand" if >50% of its keywords contain brand terms
    const brandCampaigns: string[] = [];
    const nonBrandCampaigns: string[] = [];
    for (const [, info] of campaignBrandStatus) {
      if (info.totalKws === 0) continue;
      if (info.brandKws / info.totalKws > 0.5) {
        brandCampaigns.push(info.name);
      } else {
        nonBrandCampaigns.push(info.name);
      }
    }

    const hasBrandKw = brandCampaigns.length > 0;
    const hasNonBrandKw = nonBrandCampaigns.length > 0;

    // Combine both methods — either name-based or keyword-based detection counts
    const brandDetected = hasBrandName || hasBrandKw;
    const nonBrandDetected = hasNonBrandName || hasNonBrandKw;

    if (brandDetected && nonBrandDetected) {
      const method = hasBrandKw ? "keyword analysis" : "campaign naming";
      return { result: "pass", details: `Brand and non-brand campaigns are separated (detected via ${method})`, recommendation: "" };
    }
    if (search.length === 1) return { result: "warning", details: "Only 1 search campaign — brand/non-brand may be mixed", recommendation: "Separate brand and non-brand into dedicated campaigns for better budget control" };
    if (brandTokens.length === 0) return { result: "warning", details: "Unable to derive brand terms from account name — verify brand/non-brand separation manually", recommendation: "Create separate brand and non-brand campaigns — brand terms typically have 10x higher CTR and lower CPC" };
    return { result: "fail", details: `No brand vs non-brand separation detected. Searched keywords for brand terms: ${brandTokens.join(", ")}`, recommendation: "Create separate brand and non-brand campaigns — brand terms typically have 10x higher CTR and lower CPC" };
  }),

  // FL01 — Practice area campaign segmentation (family law)
  check("FL01", "Account Structure", "Campaigns segmented by practice area", "high", 30, (d) => {
    const campaigns = d.campaigns ?? [];
    const search = campaigns.filter((c: any) => c.campaign?.advertisingChannelType === "SEARCH" && c.campaign?.status === "ENABLED");
    if (search.length === 0) return { result: "skipped", details: "No active search campaigns", recommendation: "" };
    const names = search.map((c: any) => (c.campaign?.name ?? "").toLowerCase());
    const practiceAreas = ["divorce", "custody", "child custody", "child support", "family law", "alimony", "spousal support", "adoption", "paternity", "dui", "criminal"];
    const found = practiceAreas.filter((pa) => names.some((n: string) => n.includes(pa)));
    if (found.length >= 2) return { result: "pass", details: `Campaigns segmented by practice area: ${found.join(", ")}`, recommendation: "" };
    if (found.length === 1) return { result: "warning", details: `Only 1 practice area detected in campaign names: ${found[0]}`, recommendation: "Segment campaigns by practice area — e.g., separate Divorce, Child Custody, and Family Law into individual campaigns for better budget control and ad relevance" };
    return { result: "fail", details: "No practice area segmentation detected — keywords may be mixed across campaigns", recommendation: "Create dedicated campaigns per practice area (Divorce, Child Custody, Child Support, Family Law) for targeted ad copy and budget allocation" };
  }),

  // FL02 — Location segmentation for multi-location firms
  check("FL02", "Account Structure", "Campaigns segmented by location", "medium", 30, (d) => {
    const campaigns = d.campaigns ?? [];
    const search = campaigns.filter((c: any) => c.campaign?.advertisingChannelType === "SEARCH" && c.campaign?.status === "ENABLED");
    if (search.length <= 1) return { result: "skipped", details: "Single campaign — location segmentation check not applicable", recommendation: "" };
    const names = search.map((c: any) => (c.campaign?.name ?? "").toLowerCase());
    const hasGeoInName = names.filter((n: string) => /[a-z]{3,}[\s_-](city|county|metro|area)|\b(north|south|east|west|central)\b/.test(n)).length;
    if (hasGeoInName >= 2) return { result: "pass", details: `${hasGeoInName} campaigns appear to have geographic segmentation`, recommendation: "" };
    return { result: "warning", details: "No geographic campaign segmentation detected", recommendation: "For multi-location firms, segment campaigns by geography to control budgets and ad copy per location" };
  }),

  // G06 — Non-search campaign types flagged (family law lead gen)
  check("G06", "Account Structure", "Non-search campaign types flagged", "high", 10, (d) => {
    const campaigns = d.campaigns ?? [];
    const active = campaigns.filter((c: any) => c.campaign?.status === "ENABLED");
    const nonSearch = active.filter((c: any) => {
      const type = c.campaign?.advertisingChannelType;
      return type && type !== "SEARCH";
    });
    if (nonSearch.length === 0) return { result: "pass", details: "All active campaigns are Search — appropriate for family law lead gen", recommendation: "" };
    const types = [...new Set(nonSearch.map((c: any) => c.campaign?.advertisingChannelType))];
    return { result: "warning", details: `Non-search campaign types active: ${types.join(", ")} — review for lead gen appropriateness`, recommendation: "For family law lead gen, Search campaigns are primary. Flag Performance Max, Display, Demand Gen, and YouTube for review — they often drive lower-quality leads" };
  }),

  // G07 — Search + PMax brand overlap
  check("G07", "Account Structure", "Search + PMax brand overlap managed", "high", 15, (d) => {
    const campaigns = d.campaigns ?? [];
    const search = campaigns.filter((c: any) => c.campaign?.advertisingChannelType === "SEARCH");
    const pmax = campaigns.filter((c: any) => c.campaign?.advertisingChannelType === "PERFORMANCE_MAX");
    if (pmax.length === 0 || search.length === 0) return { result: "skipped", details: "Not running both Search and PMax", recommendation: "" };

    // Check campaign names for brand indicators
    const brandSearchByName = search.some((c: any) => /brand/i.test(c.campaign?.name ?? ""));

    // Check keyword-level: derive brand tokens from account name and scan Search keywords
    const accountName = (d.account?.[0]?.customer?.descriptiveName ?? "").toLowerCase();
    const brandTokens = accountName.replace(/[^a-z0-9\s]/g, "").split(/\s+/).filter((t: string) => t.length >= 3);
    const keywords = d.keywords ?? [];
    const searchCampaignIds = new Set(search.map((c: any) => String(c.campaign?.id)));
    const brandKeywordsInSearch = brandTokens.length > 0 && keywords.some((k: any) =>
      searchCampaignIds.has(String(k.campaign?.id)) &&
      brandTokens.some((t: string) => (k.adGroupCriterion?.keyword?.text ?? "").toLowerCase().includes(t))
    );

    const hasBrandSearch = brandSearchByName || brandKeywordsInSearch;
    if (!hasBrandSearch) return { result: "pass", details: "No brand Search campaign detected — no overlap concern with PMax", recommendation: "" };
    // Cannot directly verify PMax brand exclusions via API
    return { result: "warning", details: "Both brand Search and PMax active — verify brand exclusions in PMax", recommendation: "Configure brand exclusions in PMax when running a separate brand Search campaign to prevent cannibalization" };
  }),

  // G08 — Budget allocation matches priority
  check("G08", "Account Structure", "Budget allocation matches priority", "high", 15, (d) => {
    const campaigns = d.campaigns ?? [];
    const active = campaigns.filter((c: any) => c.campaign?.status === "ENABLED" && Number(c.metrics?.impressions ?? 0) > 0);
    if (active.length < 2) return { result: "skipped", details: "Insufficient campaigns for budget analysis", recommendation: "" };
    // Check if top-performing campaigns (by conversion rate) have adequate budget
    const sorted = [...active].sort((a: any, b: any) => Number(b.metrics?.conversions ?? 0) - Number(a.metrics?.conversions ?? 0));
    const topCampaigns = sorted.slice(0, Math.ceil(sorted.length * 0.3));
    const budgetLimited = topCampaigns.filter((c: any) => {
      const budget = microsToValue(c.campaignBudget?.amountMicros);
      const spend = microsToValue(c.metrics?.costMicros);
      return budget > 0 && spend >= budget * 0.95;
    });
    if (budgetLimited.length === 0) return { result: "pass", details: "Top-performing campaigns are not budget-limited", recommendation: "" };
    return { result: "fail", details: `${budgetLimited.length} top-performing campaigns are hitting budget caps`, recommendation: "Reallocate budget from lower-performing campaigns to top performers that are budget-constrained" };
  }),

  // G09 — Campaign daily budget utilization
  check("G09", "Account Structure", "Campaign budget not capped prematurely", "medium", 10, (d) => {
    const campaigns = d.campaigns ?? [];
    const active = campaigns.filter((c: any) => c.campaign?.status === "ENABLED");
    if (active.length === 0) return { result: "skipped", details: "No active campaigns", recommendation: "" };
    const capped = active.filter((c: any) => {
      const budget = microsToValue(c.campaignBudget?.amountMicros);
      const spend = microsToValue(c.metrics?.costMicros);
      return budget > 0 && spend >= budget * 0.98;
    });
    if (capped.length === 0) return { result: "pass", details: "No campaigns hitting budget caps", recommendation: "" };
    return { result: "warning", details: `${capped.length} campaigns reaching daily budget cap`, recommendation: "Increase budget for capped campaigns or consolidate to ensure ads show throughout the day" };
  }),

  // G10 — Ad schedule configured (now automated via API)
  check("G10", "Account Structure", "Ad schedule configured (if applicable)", "low", 10, (d) => {
    const campaigns = d.campaigns ?? [];
    const adSchedule = d.adSchedule ?? [];
    if (campaigns.length === 0) return { result: "skipped", details: "No campaigns", recommendation: "" };
    if (adSchedule.length === 0) return { result: "warning", details: "No ad schedules configured on any campaign", recommendation: "Set ad schedules for business hours to avoid showing ads when leads cannot be handled" };
    const scheduledCampaigns = new Set(adSchedule.map((s: any) => String(s.campaign?.id)));
    const active = campaigns.filter((c: any) => c.campaign?.status === "ENABLED");
    const pct = safeDiv(scheduledCampaigns.size, active.length) * 100;
    if (pct >= 80) return { result: "pass", details: `${scheduledCampaigns.size}/${active.length} campaigns have ad schedules configured`, recommendation: "" };
    return { result: "warning", details: `Only ${scheduledCampaigns.size}/${active.length} campaigns have ad schedules`, recommendation: "Add ad schedules to remaining campaigns to prevent spend during hours when leads cannot be handled" };
  }),

  // G11 — Geographic targeting accuracy
  check("G11", "Account Structure", "Location targeting uses 'Presence'", "high", 2, (d) => {
    const campaigns = d.campaigns ?? [];
    if (campaigns.length === 0) return { result: "skipped", details: "No campaigns", recommendation: "" };
    const hasPresenceOrInterest = campaigns.some((c: any) =>
      c.campaign?.geoTargetTypeSetting?.positiveGeoTargetType === "SEARCH_INTEREST" ||
      c.campaign?.geoTargetTypeSetting?.positiveGeoTargetType === "PRESENCE_OR_INTEREST"
    );
    const hasPresenceOnly = campaigns.some((c: any) =>
      c.campaign?.geoTargetTypeSetting?.positiveGeoTargetType === "PRESENCE"
    );
    if (hasPresenceOnly && !hasPresenceOrInterest) return { result: "pass", details: "Location targeting set to 'Presence' — users in your locations", recommendation: "" };
    if (hasPresenceOrInterest) return { result: "fail", details: "Location targeting includes 'Interest' — may serve ads to users NOT in your area", recommendation: "Switch to 'Presence: People in your targeted locations' to avoid irrelevant clicks from outside your service area" };
    return { result: "manual", details: "Location targeting setting could not be verified — manual check recommended", recommendation: "Verify location targeting is set to 'Presence' not 'Presence or Interest'" };
  }),

  // G12 — Network settings (Search Partners, Display Network)
  check("G12", "Account Structure", "Network settings appropriate", "high", 2, (d) => {
    const campaigns = d.campaigns ?? [];
    const search = campaigns.filter((c: any) => c.campaign?.advertisingChannelType === "SEARCH" && c.campaign?.status === "ENABLED");
    if (search.length === 0) return { result: "skipped", details: "No active search campaigns", recommendation: "" };
    const displayOn = search.filter((c: any) => c.campaign?.networkSettings?.targetContentNetwork === true);
    const partnersOn = search.filter((c: any) => c.campaign?.networkSettings?.targetSearchNetwork === true);
    if (displayOn.length > 0) return { result: "fail", details: `${displayOn.length} search campaigns have Display Network ON — this wastes budget`, recommendation: "Disable Display Network on all Search campaigns immediately — use separate Display/PMax for display inventory" };
    if (partnersOn.length > 0) return { result: "warning", details: `${partnersOn.length} search campaigns have Search Partners ON — monitor performance`, recommendation: "Compare Search Partners vs Google Search performance — disable partners if CPA is >50% higher" };
    return { result: "pass", details: "Search campaigns have Display Network disabled and Partners monitored", recommendation: "" };
  }),

  // FL03 — Intent mix in ad groups (research vs buyer keywords)
  check("FL03", "Account Structure", "No research/buyer intent mix in ad groups", "high", 20, (d) => {
    const keywords = d.keywords ?? [];
    if (keywords.length === 0) return { result: "skipped", details: "No keyword data", recommendation: "" };
    const researchTerms = /\b(how to|what is|can i|do i need|laws|rights|process|cost of|average|timeline|stages|when to|should i)\b/i;
    const buyerTerms = /\b(attorney|lawyer|law firm|hire|best|top|find|near me|consultation|free consult)\b/i;
    // Group keywords by ad group
    const adGroupKWs = new Map<string, string[]>();
    for (const k of keywords) {
      const agId = String(k.adGroup?.id ?? "unknown");
      const text = k.adGroupCriterion?.keyword?.text ?? "";
      if (!adGroupKWs.has(agId)) adGroupKWs.set(agId, []);
      adGroupKWs.get(agId)!.push(text);
    }
    const mixedGroups: string[] = [];
    for (const [agId, kws] of adGroupKWs) {
      const hasResearch = kws.some((kw) => researchTerms.test(kw));
      const hasBuyer = kws.some((kw) => buyerTerms.test(kw));
      if (hasResearch && hasBuyer) mixedGroups.push(agId);
    }
    if (mixedGroups.length === 0) return { result: "pass", details: "No ad groups mixing research and buyer intent keywords", recommendation: "" };
    if (mixedGroups.length <= 2) return { result: "warning", details: `${mixedGroups.length} ad groups mix research intent (how to, what is) with buyer intent (attorney, lawyer)`, recommendation: "Separate research-intent keywords (how to file, custody laws, divorce process) from buyer-intent keywords (divorce attorney, hire lawyer) into different ad groups for better ad relevance" };
    return { result: "fail", details: `${mixedGroups.length} ad groups mix research and buyer intent — hurts ad relevance and QS`, recommendation: "Restructure immediately: research keywords (how to, what is, rights, laws) should be in separate ad groups from buyer keywords (attorney, lawyer, hire, best). This directly impacts Quality Score and conversion rates" };
  }),

  // FL04 — Broad match keyword isolation
  check("FL04", "Account Structure", "Broad match keywords isolated", "high", 15, (d) => {
    const keywords = d.keywords ?? [];
    if (keywords.length === 0) return { result: "skipped", details: "No keyword data", recommendation: "" };
    const broad = keywords.filter((k: any) => k.adGroupCriterion?.keyword?.matchType === "BROAD");
    if (broad.length === 0) return { result: "pass", details: "No broad match keywords in use", recommendation: "" };
    // Check if broad match is mixed with phrase/exact in same ad group
    const broadAGs = new Set(broad.map((k: any) => String(k.adGroup?.id)));
    const nonBroad = keywords.filter((k: any) => k.adGroupCriterion?.keyword?.matchType !== "BROAD" && broadAGs.has(String(k.adGroup?.id)));
    if (nonBroad.length === 0) return { result: "pass", details: `${broad.length} broad match keywords properly isolated in their own ad groups`, recommendation: "" };
    return { result: "fail", details: `Broad match keywords are mixed with phrase/exact match in the same ad groups (${broadAGs.size} groups affected)`, recommendation: "Isolate broad match keywords into their own ad groups or campaigns. Mixing match types causes broad match to cannibalize exact/phrase match traffic" };
  }),
];

// ═══════════════════════════════════════════════════════════
// KEYWORDS & QUALITY SCORE — 8 checks (15% weight)
// G20-G25, G-KW1, G-KW2
// ═══════════════════════════════════════════════════════════

const keywordChecks: CheckFn[] = [
  // G20 — Weighted avg Quality Score ≥7
  check("G20", "Keywords & Quality Score", "Weighted avg Quality Score ≥7", "high", 30, (d) => {
    const keywords = d.keywords ?? [];
    const scored = keywords.filter((k: any) => k.adGroupCriterion?.qualityInfo?.qualityScore);
    if (scored.length === 0) return { result: "skipped", details: "No quality score data available", recommendation: "" };
    const totalImp = scored.reduce((sum: number, k: any) => sum + Number(k.metrics?.impressions ?? 0), 0);
    const weightedSum = scored.reduce((sum: number, k: any) => sum + (k.adGroupCriterion.qualityInfo.qualityScore * Number(k.metrics?.impressions ?? 0)), 0);
    const avgQS = safeDiv(weightedSum, totalImp);
    if (avgQS >= 7) return { result: "pass", details: `Weighted avg QS: ${avgQS.toFixed(1)}`, recommendation: "" };
    if (avgQS >= 5) return { result: "warning", details: `Weighted avg QS: ${avgQS.toFixed(1)} — room for improvement`, recommendation: "Improve ad relevance and landing page experience for low-QS keywords" };
    return { result: "fail", details: `Weighted avg QS: ${avgQS.toFixed(1)} — poor quality scores`, recommendation: "Urgently improve keyword-ad-landing page alignment. Low QS = higher CPCs and lower ad positions" };
  }),

  // G21 — Critical QS keywords (<10% with QS ≤3)
  check("G21", "Keywords & Quality Score", "No critical low-QS keywords", "critical", 15, (d) => {
    const keywords = d.keywords ?? [];
    const scored = keywords.filter((k: any) => k.adGroupCriterion?.qualityInfo?.qualityScore);
    if (scored.length === 0) return { result: "skipped", details: "No quality score data", recommendation: "" };
    const lowQS = scored.filter((k: any) => k.adGroupCriterion.qualityInfo.qualityScore <= 3);
    const pct = safeDiv(lowQS.length, scored.length) * 100;
    if (pct < 10) return { result: "pass", details: `Only ${pct.toFixed(0)}% of keywords have QS ≤3`, recommendation: "" };
    if (pct < 25) return { result: "warning", details: `${pct.toFixed(0)}% of keywords have QS ≤3 — needs attention`, recommendation: "Improve ad copy and landing pages for keywords with QS ≤3" };
    return { result: "fail", details: `${pct.toFixed(0)}% of keywords have critically low QS ≤3`, recommendation: "Pause or fix keywords with QS ≤3 — they drastically increase CPC. Rewrite ads and improve landing page relevance" };
  }),

  // G22 — Expected CTR component
  check("G22", "Keywords & Quality Score", "Expected CTR component healthy", "high", 15, (d) => {
    const keywords = d.keywords ?? [];
    const scored = keywords.filter((k: any) => k.adGroupCriterion?.qualityInfo?.searchPredictedCtr);
    if (scored.length === 0) return { result: "skipped", details: "No predicted CTR data available", recommendation: "" };
    const below = scored.filter((k: any) => k.adGroupCriterion.qualityInfo.searchPredictedCtr === "BELOW_AVERAGE");
    const pct = safeDiv(below.length, scored.length) * 100;
    if (pct < 20) return { result: "pass", details: `Only ${pct.toFixed(0)}% of keywords have Below Average expected CTR`, recommendation: "" };
    if (pct < 35) return { result: "warning", details: `${pct.toFixed(0)}% of keywords have Below Average expected CTR`, recommendation: "Improve ad headlines and descriptions — add keyword insertion, stronger CTAs, unique value props" };
    return { result: "fail", details: `${pct.toFixed(0)}% of keywords have Below Average expected CTR`, recommendation: "Major CTR issue — rewrite ad copy with keyword-relevant headlines, use ad customizers, and test new variations" };
  }),

  // G23 — Ad relevance component
  check("G23", "Keywords & Quality Score", "Ad relevance component healthy", "high", 15, (d) => {
    const keywords = d.keywords ?? [];
    const scored = keywords.filter((k: any) => k.adGroupCriterion?.qualityInfo?.creativeQualityScore);
    if (scored.length === 0) return { result: "skipped", details: "No ad relevance data available", recommendation: "" };
    const below = scored.filter((k: any) => k.adGroupCriterion.qualityInfo.creativeQualityScore === "BELOW_AVERAGE");
    const pct = safeDiv(below.length, scored.length) * 100;
    if (pct < 20) return { result: "pass", details: `Only ${pct.toFixed(0)}% of keywords have Below Average ad relevance`, recommendation: "" };
    if (pct < 35) return { result: "warning", details: `${pct.toFixed(0)}% of keywords have Below Average ad relevance`, recommendation: "Ensure ad copy closely matches keyword themes — use dynamic keyword insertion and tighter ad groups" };
    return { result: "fail", details: `${pct.toFixed(0)}% of keywords have Below Average ad relevance`, recommendation: "Restructure ad groups into tighter keyword themes and write ads that directly match each group's intent" };
  }),

  // G24 — Landing page experience component
  check("G24", "Keywords & Quality Score", "Landing page experience healthy", "high", 30, (d) => {
    const keywords = d.keywords ?? [];
    const scored = keywords.filter((k: any) => k.adGroupCriterion?.qualityInfo?.postClickQualityScore);
    if (scored.length === 0) return { result: "skipped", details: "No landing page quality data available", recommendation: "" };
    const below = scored.filter((k: any) => k.adGroupCriterion.qualityInfo.postClickQualityScore === "BELOW_AVERAGE");
    const pct = safeDiv(below.length, scored.length) * 100;
    if (pct < 15) return { result: "pass", details: `Only ${pct.toFixed(0)}% of keywords have Below Average landing page experience`, recommendation: "" };
    if (pct < 30) return { result: "warning", details: `${pct.toFixed(0)}% of keywords have Below Average landing page experience`, recommendation: "Improve page speed, mobile responsiveness, and content relevance for landing pages" };
    return { result: "fail", details: `${pct.toFixed(0)}% of keywords have Below Average landing page experience`, recommendation: "Urgent: improve landing page speed (LCP <2.5s), mobile UX, and keyword-to-page content alignment" };
  }),

  // G25 — Top keyword QS
  check("G25", "Keywords & Quality Score", "Top-spend keywords have QS ≥7", "medium", 20, (d) => {
    const keywords = d.keywords ?? [];
    const scored = keywords.filter((k: any) => k.adGroupCriterion?.qualityInfo?.qualityScore && microsToValue(k.metrics?.costMicros) > 0);
    if (scored.length === 0) return { result: "skipped", details: "No quality score data for spending keywords", recommendation: "" };
    const sorted = [...scored].sort((a: any, b: any) => microsToValue(b.metrics?.costMicros) - microsToValue(a.metrics?.costMicros));
    const top20 = sorted.slice(0, Math.min(20, sorted.length));
    const lowQS = top20.filter((k: any) => k.adGroupCriterion.qualityInfo.qualityScore < 7);
    if (lowQS.length === 0) return { result: "pass", details: `All top ${top20.length} spending keywords have QS ≥7`, recommendation: "" };
    if (lowQS.length <= 5) return { result: "warning", details: `${lowQS.length} of top ${top20.length} spending keywords have QS <7`, recommendation: "Focus optimization on your highest-spend keywords — improving QS from 5→7 can reduce CPC by 20%+" };
    return { result: "fail", details: `${lowQS.length} of top ${top20.length} spending keywords have QS <7 — overpaying for traffic`, recommendation: "Prioritize QS improvement for top keywords: rewrite ads, improve landing pages, tighten ad group themes" };
  }),

  // G-KW1 — Zero-impression keywords
  check("G-KW1", "Keywords & Quality Score", "No zero-impression keywords", "medium", 10, (d) => {
    const keywords = d.keywords ?? [];
    if (keywords.length === 0) return { result: "skipped", details: "No keywords", recommendation: "" };
    const active = keywords.filter((k: any) => k.adGroupCriterion?.status === "ENABLED");
    const zeroImp = active.filter((k: any) => Number(k.metrics?.impressions ?? 0) === 0);
    const pct = safeDiv(zeroImp.length, active.length) * 100;
    if (pct < 5) return { result: "pass", details: `Only ${pct.toFixed(0)}% of active keywords have zero impressions`, recommendation: "" };
    if (pct < 10) return { result: "warning", details: `${zeroImp.length} active keywords (${pct.toFixed(0)}%) with zero impressions`, recommendation: "Review and pause keywords with zero impressions — they may have low search volume or be outcompeted" };
    return { result: "fail", details: `${zeroImp.length} active keywords (${pct.toFixed(0)}%) with zero impressions — account bloat`, recommendation: "Pause zero-impression keywords to reduce account complexity and focus budget on performing terms" };
  }),

  // G-KW2 — Keyword-to-ad headline relevance
  check("G-KW2", "Keywords & Quality Score", "Keyword-to-ad headline relevance", "high", 20, (d) => {
    const keywords = d.keywords ?? [];
    const ads = d.ads ?? [];
    if (keywords.length === 0 || ads.length === 0) return { result: "skipped", details: "Insufficient data for keyword-ad relevance analysis", recommendation: "" };
    // Check if top keywords appear in any ad headline
    const topKW = keywords
      .filter((k: any) => microsToValue(k.metrics?.costMicros) > 0)
      .sort((a: any, b: any) => microsToValue(b.metrics?.costMicros) - microsToValue(a.metrics?.costMicros))
      .slice(0, 20);
    const allHeadlines = ads
      .filter((a: any) => a.adGroupAd?.ad?.responsiveSearchAd?.headlines)
      .flatMap((a: any) => (a.adGroupAd.ad.responsiveSearchAd.headlines ?? []).map((h: any) => (h.text ?? "").toLowerCase()));
    const headlineText = allHeadlines.join(" ");
    const matched = topKW.filter((k: any) => {
      const kw = (k.adGroupCriterion?.keyword?.text ?? "").toLowerCase();
      return headlineText.includes(kw) || kw.split(" ").some((w: string) => w.length > 3 && headlineText.includes(w));
    });
    const matchPct = safeDiv(matched.length, topKW.length) * 100;
    if (matchPct >= 70) return { result: "pass", details: `${matchPct.toFixed(0)}% of top keywords reflected in ad headlines`, recommendation: "" };
    if (matchPct >= 40) return { result: "warning", details: `Only ${matchPct.toFixed(0)}% of top keywords appear in ad headlines`, recommendation: "Include primary keyword variants in RSA headlines for better ad relevance scores" };
    return { result: "fail", details: `Only ${matchPct.toFixed(0)}% of top keywords reflected in ad headlines`, recommendation: "Rewrite RSA headlines to include primary keyword variants — this directly impacts Quality Score and CTR" };
  }),
];

// ═══════════════════════════════════════════════════════════
// ADS & ASSETS — 17 checks (15% weight)
// G26-G35, G-AD1, G-AD2, G-PM1 through G-PM5
// ═══════════════════════════════════════════════════════════

const adsChecks: CheckFn[] = [
  // G26 — RSA per ad group (≥1 RSA, ideal ≥2)
  check("G26", "Ads & Assets", "RSA present in every ad group", "high", 15, (d) => {
    const ads = d.ads ?? [];
    const adGroups = d.adGroups ?? [];
    const activeAGs = adGroups.filter((ag: any) => ag.adGroup?.status === "ENABLED");
    if (activeAGs.length === 0) return { result: "skipped", details: "No active ad groups", recommendation: "" };
    const rsaAGs = new Set(ads.filter((a: any) => a.adGroupAd?.ad?.type === "RESPONSIVE_SEARCH_AD").map((a: any) => String(a.adGroup?.id ?? a.campaign?.id)));
    const covered = activeAGs.filter((ag: any) => rsaAGs.has(String(ag.adGroup?.id))).length;
    const pct = safeDiv(covered, activeAGs.length) * 100;
    if (pct >= 90) return { result: "pass", details: `${pct.toFixed(0)}% of ad groups have RSAs`, recommendation: "" };
    if (pct >= 60) return { result: "warning", details: `Only ${pct.toFixed(0)}% of ad groups have RSAs`, recommendation: "Add at least 1 RSA to every ad group — Google recommends 2+ per group" };
    return { result: "fail", details: `Only ${pct.toFixed(0)}% of ad groups have RSAs — many groups without ads`, recommendation: "Create RSAs for all active ad groups — ad groups without RSAs cannot serve ads effectively" };
  }),

  // G27 — RSA headline count (≥8, ideal 12-15)
  check("G27", "Ads & Assets", "RSA headline count (≥8 unique)", "high", 15, (d) => {
    const ads = d.ads ?? [];
    const rsas = ads.filter((a: any) => a.adGroupAd?.ad?.type === "RESPONSIVE_SEARCH_AD" && a.adGroupAd?.ad?.responsiveSearchAd?.headlines);
    if (rsas.length === 0) return { result: "skipped", details: "No RSAs found", recommendation: "" };
    const underserved = rsas.filter((a: any) => (a.adGroupAd.ad.responsiveSearchAd.headlines?.length ?? 0) < 8);
    const pct = safeDiv(underserved.length, rsas.length) * 100;
    if (pct < 20) return { result: "pass", details: `${(100 - pct).toFixed(0)}% of RSAs have ≥8 headlines`, recommendation: "" };
    if (pct < 50) return { result: "warning", details: `${underserved.length}/${rsas.length} RSAs have <8 headlines`, recommendation: "Add more unique headlines to RSAs — aim for 12-15 headlines per RSA for maximum testing" };
    return { result: "fail", details: `${underserved.length}/${rsas.length} RSAs have <8 headlines — limiting ad combinations`, recommendation: "Add 12-15 unique headlines per RSA. Include keyword variants, benefits, CTAs, and social proof" };
  }),

  // G28 — RSA description count (≥3, ideal 4)
  check("G28", "Ads & Assets", "RSA description count (≥3)", "medium", 10, (d) => {
    const ads = d.ads ?? [];
    const rsas = ads.filter((a: any) => a.adGroupAd?.ad?.type === "RESPONSIVE_SEARCH_AD" && a.adGroupAd?.ad?.responsiveSearchAd?.descriptions);
    if (rsas.length === 0) return { result: "skipped", details: "No RSAs found", recommendation: "" };
    const under = rsas.filter((a: any) => (a.adGroupAd.ad.responsiveSearchAd.descriptions?.length ?? 0) < 3);
    if (under.length === 0) return { result: "pass", details: `All ${rsas.length} RSAs have ≥3 descriptions`, recommendation: "" };
    return { result: "warning", details: `${under.length}/${rsas.length} RSAs have <3 descriptions`, recommendation: "Add 4 unique descriptions per RSA covering benefits, features, CTAs, and social proof" };
  }),

  // G29 — RSA Ad Strength (Good/Excellent)
  check("G29", "Ads & Assets", "RSA ad strength Good or Excellent", "high", 20, (d) => {
    const ads = d.ads ?? [];
    const rsas = ads.filter((a: any) => a.adGroupAd?.ad?.type === "RESPONSIVE_SEARCH_AD");
    if (rsas.length === 0) return { result: "skipped", details: "No RSAs found", recommendation: "" };
    const good = rsas.filter((a: any) => ["GOOD", "EXCELLENT"].includes(a.adGroupAd?.adStrength ?? ""));
    const poor = rsas.filter((a: any) => a.adGroupAd?.adStrength === "POOR");
    const pct = safeDiv(good.length, rsas.length) * 100;
    if (poor.length > 0) return { result: "fail", details: `${poor.length} RSAs with POOR ad strength — ${pct.toFixed(0)}% are Good/Excellent`, recommendation: "Improve poor RSAs: add more unique headlines/descriptions, vary messaging, and avoid repetition" };
    if (pct >= 70) return { result: "pass", details: `${pct.toFixed(0)}% of RSAs have Good/Excellent strength`, recommendation: "" };
    return { result: "warning", details: `Only ${pct.toFixed(0)}% of RSAs have Good/Excellent strength`, recommendation: "Improve RSA ad strength by adding unique headlines, varying descriptions, and including keyword variants" };
  }),

  // G30 — RSA pinning strategy
  check("G30", "Ads & Assets", "RSA pinning strategy appropriate", "medium", 10, (d) => {
    const ads = d.ads ?? [];
    const rsas = ads.filter((a: any) => a.adGroupAd?.ad?.responsiveSearchAd?.headlines);
    if (rsas.length === 0) return { result: "skipped", details: "No RSAs found", recommendation: "" };
    const overPinned = rsas.filter((a: any) => {
      const headlines = a.adGroupAd.ad.responsiveSearchAd.headlines ?? [];
      const pinned = headlines.filter((h: any) => h.pinnedField).length;
      return pinned > 3;
    });
    if (overPinned.length === 0) return { result: "pass", details: "RSA pinning is reasonable — allowing Google to optimize rotations", recommendation: "" };
    return { result: "warning", details: `${overPinned.length} RSAs have excessive pinning (>3 positions pinned)`, recommendation: "Reduce pinning to 1-2 positions max. Over-pinning limits Google's ability to find winning combinations" };
  }),

  // G31 — PMax asset group density (now automated via API)
  check("G31", "Ads & Assets", "PMax asset groups have maximum density", "critical", 20, (d) => {
    const assetGroups = d.assetGroups ?? [];
    const assetGroupAssets = d.assetGroupAssets ?? [];
    if (assetGroups.length === 0) return { result: "skipped", details: "No PMax asset groups", recommendation: "" };
    if (assetGroupAssets.length === 0) return { result: "warning", details: "PMax asset density data not available", recommendation: "Verify 20 images, 5 logos, 5+ videos, 5 headlines, 5 descriptions per asset group" };
    const groupCounts = new Map<string, Map<string, number>>();
    for (const a of assetGroupAssets) {
      const gId = String(a.assetGroup?.id ?? "");
      const type = String(a.assetGroupAsset?.fieldType ?? "");
      if (!groupCounts.has(gId)) groupCounts.set(gId, new Map());
      const tc = groupCounts.get(gId)!;
      tc.set(type, (tc.get(type) ?? 0) + 1);
    }
    const issues: string[] = [];
    for (const [gId, counts] of groupCounts) {
      const images = counts.get("MARKETING_IMAGE") ?? 0;
      const headlines = counts.get("HEADLINE") ?? 0;
      const descriptions = counts.get("DESCRIPTION") ?? 0;
      const videos = counts.get("YOUTUBE_VIDEO") ?? 0;
      const logos = counts.get("LOGO") ?? 0;
      const groupName = assetGroups.find((ag: any) => String(ag.assetGroup?.id) === gId)?.assetGroup?.name ?? gId;
      const missing: string[] = [];
      if (images < 15) missing.push(`images: ${images}/20`);
      if (headlines < 5) missing.push(`headlines: ${headlines}/5`);
      if (descriptions < 5) missing.push(`descriptions: ${descriptions}/5`);
      if (videos < 3) missing.push(`videos: ${videos}/5`);
      if (logos < 3) missing.push(`logos: ${logos}/5`);
      if (missing.length > 0) issues.push(`${groupName}: ${missing.join(", ")}`);
    }
    if (issues.length === 0) return { result: "pass", details: "All PMax asset groups have adequate density", recommendation: "" };
    return { result: "fail", details: `Asset density gaps: ${issues.join("; ")}`, recommendation: "Fill all asset slots: 20 images, 5 logos, 5+ videos (16:9, 1:1, 9:16), 5 headlines, 5 descriptions" };
  }),

  // G32 — PMax video assets present
  check("G32", "Ads & Assets", "PMax has native video assets", "high", 30, (d) => {
    const assetGroups = d.assetGroups ?? [];
    if (assetGroups.length === 0) return { result: "skipped", details: "No PMax campaigns", recommendation: "" };
    return { result: "manual", details: "PMax video assets require manual verification", recommendation: "Upload native videos in all formats (16:9, 1:1, 9:16) — auto-generated videos perform significantly worse" };
  }),

  // G33 — PMax asset group count (≥2 per campaign)
  check("G33", "Ads & Assets", "PMax has ≥2 asset groups (intent-segmented)", "medium", 20, (d) => {
    const assetGroups = d.assetGroups ?? [];
    const campaigns = d.campaigns ?? [];
    const pmaxCampaigns = campaigns.filter((c: any) => c.campaign?.advertisingChannelType === "PERFORMANCE_MAX" && c.campaign?.status === "ENABLED");
    if (pmaxCampaigns.length === 0) return { result: "skipped", details: "No active PMax campaigns", recommendation: "" };
    const groupsPerCampaign = new Map<string, number>();
    for (const ag of assetGroups) {
      const cId = String(ag.campaign?.id ?? "");
      groupsPerCampaign.set(cId, (groupsPerCampaign.get(cId) ?? 0) + 1);
    }
    const single = pmaxCampaigns.filter((c: any) => (groupsPerCampaign.get(String(c.campaign?.id)) ?? 0) < 2);
    if (single.length === 0) return { result: "pass", details: `All PMax campaigns have ≥2 asset groups`, recommendation: "" };
    return { result: "warning", details: `${single.length} PMax campaigns have only 1 asset group`, recommendation: "Create ≥2 intent-segmented asset groups per PMax campaign for better audience targeting" };
  }),

  // G34 — PMax final URL expansion setting
  check("G34", "Ads & Assets", "PMax final URL expansion reviewed", "high", 5, (d) => {
    const campaigns = d.campaigns ?? [];
    const pmax = campaigns.filter((c: any) => c.campaign?.advertisingChannelType === "PERFORMANCE_MAX");
    if (pmax.length === 0) return { result: "skipped", details: "No PMax campaigns", recommendation: "" };
    return { result: "manual", details: "PMax final URL expansion setting requires manual review", recommendation: "Review URL expansion: enable for discovery/broad reach, disable for controlled landing page targeting" };
  }),

  // G35 — Ad copy relevance to keywords
  check("G35", "Ads & Assets", "Ad copy relevance to keywords", "high", 20, (d) => {
    const keywords = d.keywords ?? [];
    const ads = d.ads ?? [];
    if (keywords.length === 0 || ads.length === 0) return { result: "skipped", details: "Insufficient data", recommendation: "" };
    const topKW = keywords
      .filter((k: any) => microsToValue(k.metrics?.costMicros) > 0)
      .sort((a: any, b: any) => microsToValue(b.metrics?.costMicros) - microsToValue(a.metrics?.costMicros))
      .slice(0, 10);
    const headlineTexts = ads
      .filter((a: any) => a.adGroupAd?.ad?.responsiveSearchAd?.headlines)
      .flatMap((a: any) => (a.adGroupAd.ad.responsiveSearchAd.headlines ?? []).map((h: any) => (h.text ?? "").toLowerCase()));
    const joined = headlineTexts.join(" ");
    const relevantCount = topKW.filter((k: any) => {
      const text = (k.adGroupCriterion?.keyword?.text ?? "").toLowerCase();
      return text.split(" ").some((w: string) => w.length > 3 && joined.includes(w));
    }).length;
    const pct = safeDiv(relevantCount, topKW.length) * 100;
    if (pct >= 70) return { result: "pass", details: `${pct.toFixed(0)}% of top keywords reflected in ad headlines`, recommendation: "" };
    if (pct >= 40) return { result: "warning", details: `Only ${pct.toFixed(0)}% of top keywords in ad headlines`, recommendation: "Include keyword variants in RSA headlines for better relevance signals" };
    return { result: "fail", details: `Only ${pct.toFixed(0)}% of top keywords in ad headlines — poor relevance`, recommendation: "Rewrite RSA headlines to include primary keyword variants — directly impacts QS and CTR" };
  }),

  // G-AD1 — Ad freshness (<90 days)
  check("G-AD1", "Ads & Assets", "Ad copy tested within last 90 days", "medium", 15, (d) => {
    const changeHistory = d.changeHistory ?? [];
    const adChanges = changeHistory.filter((ch: any) =>
      ch.changeEvent?.changeResourceType === "AD" || ch.changeEvent?.changeResourceType === "AD_GROUP_AD"
    );
    if (adChanges.length > 0) return { result: "pass", details: "Recent ad changes detected in last 14 days", recommendation: "" };
    return { result: "warning", details: "No recent ad copy changes detected — ads may be stale", recommendation: "Test new ad copy at least every 90 days to combat ad fatigue and maintain CTR" };
  }),

  // G-AD2 — CTR vs legal industry benchmark (family law: 5-7%)
  check("G-AD2", "Ads & Assets", "CTR at or above legal industry average", "high", 20, (d) => {
    const campaigns = d.campaigns ?? [];
    const search = campaigns.filter((c: any) => c.campaign?.advertisingChannelType === "SEARCH" && Number(c.metrics?.impressions ?? 0) > 100);
    if (search.length === 0) return { result: "skipped", details: "No search campaigns with sufficient data", recommendation: "" };
    const totalClicks = search.reduce((sum: number, c: any) => sum + Number(c.metrics?.clicks ?? 0), 0);
    const totalImps = search.reduce((sum: number, c: any) => sum + Number(c.metrics?.impressions ?? 0), 0);
    const avgCTR = safeDiv(totalClicks, totalImps) * 100;
    // Legal industry average CTR for search is ~5-7% (higher than cross-industry 3-5%)
    if (avgCTR >= 7) return { result: "pass", details: `Account CTR: ${avgCTR.toFixed(2)}% — above legal industry average (5-7%)`, recommendation: "" };
    if (avgCTR >= 5) return { result: "warning", details: `Account CTR: ${avgCTR.toFixed(2)}% — at legal industry average`, recommendation: "Legal industry benchmark is 5-7% CTR. Improve headlines with practice area keywords, add extensions, and use emotional triggers relevant to family law" };
    if (avgCTR >= 3) return { result: "warning", details: `Account CTR: ${avgCTR.toFixed(2)}% — below legal industry average (5-7%)`, recommendation: "CTR is below the legal industry benchmark. Use practice-area-specific headlines (e.g., 'Protect Your Custody Rights'), add all extensions, and ensure ad-to-keyword alignment" };
    return { result: "fail", details: `Account CTR: ${avgCTR.toFixed(2)}% — significantly below legal industry average (5-7%)`, recommendation: "Critically low CTR for legal. Rewrite RSA headlines with practice area terms, add sitelinks/callouts/structured snippets, and tighten ad group themes around specific practice areas" };
  }),

  // G-PM1 — PMax audience signals configured (now automated via API)
  check("G-PM1", "Ads & Assets", "PMax audience signals configured", "high", 15, (d) => {
    const assetGroups = d.assetGroups ?? [];
    const signals = d.assetGroupSignals ?? [];
    if (assetGroups.length === 0) return { result: "skipped", details: "No PMax campaigns", recommendation: "" };
    if (signals.length === 0) return { result: "warning", details: "No PMax audience signals detected", recommendation: "Add custom audience signals per asset group: custom segments, interests, remarketing lists" };
    const groupsWithSignals = new Set(signals.map((s: any) => String(s.assetGroup?.id)));
    if (groupsWithSignals.size >= assetGroups.length) return { result: "pass", details: `All ${assetGroups.length} asset groups have audience signals configured`, recommendation: "" };
    return { result: "warning", details: `${groupsWithSignals.size}/${assetGroups.length} asset groups have audience signals`, recommendation: "Add audience signals to all asset groups for better PMax targeting" };
  }),

  // G-PM2 — PMax Ad Strength
  check("G-PM2", "Ads & Assets", "PMax asset group ad strength Good+", "high", 20, (d) => {
    const assetGroups = d.assetGroups ?? [];
    if (assetGroups.length === 0) return { result: "skipped", details: "No PMax campaigns", recommendation: "" };
    const weak = assetGroups.filter((ag: any) => ["POOR", "AVERAGE"].includes(ag.assetGroup?.adStrength ?? ""));
    const good = assetGroups.filter((ag: any) => ["GOOD", "EXCELLENT"].includes(ag.assetGroup?.adStrength ?? ""));
    if (weak.length === 0) return { result: "pass", details: `All ${assetGroups.length} asset groups have Good/Excellent ad strength`, recommendation: "" };
    if (good.length > weak.length) return { result: "warning", details: `${weak.length}/${assetGroups.length} asset groups with weak ad strength`, recommendation: "Add more diverse assets to improve PMax ad strength — aim for 20 images, 5 videos, 15 headlines" };
    return { result: "fail", details: `${weak.length}/${assetGroups.length} asset groups have Poor/Average strength`, recommendation: "Urgently improve PMax assets: add more images, videos, headlines, and descriptions to maximize coverage" };
  }),

  // G-PM3 — PMax brand cannibalization
  check("G-PM3", "Ads & Assets", "PMax brand cannibalization controlled", "high", 10, (d) => {
    const campaigns = d.campaigns ?? [];
    const pmax = campaigns.filter((c: any) => c.campaign?.advertisingChannelType === "PERFORMANCE_MAX");
    const search = campaigns.filter((c: any) => c.campaign?.advertisingChannelType === "SEARCH");
    if (pmax.length === 0 || search.length === 0) return { result: "skipped", details: "Not running both PMax and brand Search", recommendation: "" };

    // Name-based brand detection
    const brandSearchByName = search.some((c: any) => /brand/i.test(c.campaign?.name ?? ""));

    // Keyword-level brand detection
    const accountName = (d.account?.[0]?.customer?.descriptiveName ?? "").toLowerCase();
    const brandTokens = accountName.replace(/[^a-z0-9\s]/g, "").split(/\s+/).filter((t: string) => t.length >= 3);
    const keywords = d.keywords ?? [];
    const searchIds = new Set(search.map((c: any) => String(c.campaign?.id)));
    const brandKwInSearch = brandTokens.length > 0 && keywords.some((k: any) =>
      searchIds.has(String(k.campaign?.id)) &&
      brandTokens.some((t: string) => (k.adGroupCriterion?.keyword?.text ?? "").toLowerCase().includes(t))
    );

    if (!brandSearchByName && !brandKwInSearch) return { result: "skipped", details: "No brand Search campaigns detected", recommendation: "" };
    return { result: "warning", details: "PMax may be cannibalizing brand Search — verify brand exclusions", recommendation: "Add brand exclusions in PMax settings and monitor brand vs non-brand conversion split" };
  }),

  // G-PM4 — PMax search themes
  check("G-PM4", "Ads & Assets", "PMax search themes configured", "medium", 10, (d) => {
    const campaigns = d.campaigns ?? [];
    const pmax = campaigns.filter((c: any) => c.campaign?.advertisingChannelType === "PERFORMANCE_MAX");
    if (pmax.length === 0) return { result: "skipped", details: "No PMax campaigns", recommendation: "" };
    return { result: "manual", details: "PMax search theme configuration requires manual verification", recommendation: "Configure up to 50 search themes per asset group to guide Google's AI on your target queries" };
  }),

  // G-PM5 — PMax negative keywords
  check("G-PM5", "Ads & Assets", "PMax negative keywords applied", "high", 10, (d) => {
    const campaigns = d.campaigns ?? [];
    const negatives = d.negativeKeywords ?? [];
    const pmax = campaigns.filter((c: any) => c.campaign?.advertisingChannelType === "PERFORMANCE_MAX" && c.campaign?.status === "ENABLED");
    if (pmax.length === 0) return { result: "skipped", details: "No active PMax campaigns", recommendation: "" };
    const pmaxIds = new Set(pmax.map((c: any) => String(c.campaign?.id)));
    const pmaxNegs = negatives.filter((n: any) => pmaxIds.has(String(n.campaign?.id)));
    if (pmaxNegs.length > 0) return { result: "pass", details: `${pmaxNegs.length} negative keywords applied to PMax campaigns`, recommendation: "" };
    return { result: "warning", details: "No negative keywords applied to PMax campaigns", recommendation: "Add brand + irrelevant negative keywords to PMax (up to 10,000 supported) to prevent wasted spend" };
  }),
];

// ═══════════════════════════════════════════════════════════
// SETTINGS & TARGETING — 26 checks (10% weight)
// Bidding & Budget: G36-G41
// Settings: G50-G61
// Detail Checks: ST01-ST08
// ═══════════════════════════════════════════════════════════

const settingsChecks: CheckFn[] = [
  // ── Bidding & Budget ──

  // G36 — Smart bidding strategy active
  check("G36", "Settings & Targeting", "Smart bidding strategy active", "high", 10, (d) => {
    const campaigns = d.campaigns ?? [];
    const active = campaigns.filter((c: any) => c.campaign?.status === "ENABLED");
    const manual = active.filter((c: any) =>
      c.campaign?.biddingStrategyType === "MANUAL_CPC" || c.campaign?.biddingStrategyType === "MANUAL_CPV"
    );
    if (manual.length === 0) return { result: "pass", details: "All campaigns using automated bidding", recommendation: "" };
    const pct = safeDiv(manual.length, active.length) * 100;
    if (pct < 30) return { result: "warning", details: `${manual.length} campaigns still on manual bidding (${pct.toFixed(0)}%)`, recommendation: "Migrate to Smart Bidding (Target CPA/ROAS) when you have ≥30 conversions per month" };
    return { result: "fail", details: `${pct.toFixed(0)}% of campaigns on manual bidding`, recommendation: "Switch to Smart Bidding for better performance — Google's AI needs automated bidding to optimize effectively" };
  }),

  // G37 — Target CPA/ROAS reasonableness
  check("G37", "Settings & Targeting", "Target CPA/ROAS within 20% of historical", "critical", 10, (d) => {
    const campaigns = d.campaigns ?? [];
    const withTargets = campaigns.filter((c: any) =>
      c.campaign?.biddingStrategyType === "TARGET_CPA" || c.campaign?.biddingStrategyType === "MAXIMIZE_CONVERSIONS"
    );
    if (withTargets.length === 0) return { result: "skipped", details: "No campaigns using Target CPA/ROAS", recommendation: "" };
    const violations = withTargets.filter((c: any) => {
      const targetCPA = microsToValue(c.campaign?.targetCpa?.targetCpaMicros);
      const actualCPA = microsToValue(c.metrics?.costPerConversion);
      return targetCPA > 0 && actualCPA > 0 && (actualCPA > targetCPA * 1.5 || targetCPA < actualCPA * 0.5);
    });
    if (violations.length === 0) return { result: "pass", details: "Target CPA/ROAS aligned with historical performance", recommendation: "" };
    return { result: "warning", details: `${violations.length} campaigns with targets >50% off actual performance`, recommendation: "Set targets within 20% of 30-day historical CPA — aggressive targets restrict delivery" };
  }),

  // G38 — Learning phase status
  check("G38", "Settings & Targeting", "Learning phase status (<25% of campaigns)", "high", 10, (d) => {
    const campaigns = d.campaigns ?? [];
    const active = campaigns.filter((c: any) => c.campaign?.status === "ENABLED");
    if (active.length === 0) return { result: "skipped", details: "No active campaigns", recommendation: "" };
    // Check for campaigns with very few conversions (likely in learning)
    const lowConv = active.filter((c: any) => {
      const convs = Number(c.metrics?.conversions ?? 0);
      const isSmartBid = !["MANUAL_CPC", "MANUAL_CPV"].includes(c.campaign?.biddingStrategyType ?? "");
      return isSmartBid && convs < 15;
    });
    const pct = safeDiv(lowConv.length, active.length) * 100;
    if (pct < 25) return { result: "pass", details: `${pct.toFixed(0)}% of campaigns likely in learning phase`, recommendation: "" };
    if (pct < 40) return { result: "warning", details: `${pct.toFixed(0)}% of campaigns may be in learning/limited phase`, recommendation: "Consolidate low-volume campaigns to exit learning phase — need ~50 conversions per 30 days" };
    return { result: "fail", details: `${pct.toFixed(0)}% of campaigns in learning — too many campaigns with insufficient data`, recommendation: "Reduce campaign count and consolidate conversion data. Smart Bidding needs volume to optimize effectively" };
  }),

  // G39 — Budget constrained campaigns
  check("G39", "Settings & Targeting", "Top performers not budget-limited", "high", 10, (d) => {
    const campaigns = d.campaigns ?? [];
    const active = campaigns.filter((c: any) => c.campaign?.status === "ENABLED" && Number(c.metrics?.conversions ?? 0) > 0);
    if (active.length === 0) return { result: "skipped", details: "No converting campaigns", recommendation: "" };
    const sorted = [...active].sort((a: any, b: any) => Number(b.metrics?.conversions ?? 0) - Number(a.metrics?.conversions ?? 0));
    const top = sorted.slice(0, Math.ceil(sorted.length * 0.3));
    const limited = top.filter((c: any) => {
      const budget = microsToValue(c.campaignBudget?.amountMicros);
      const spend = microsToValue(c.metrics?.costMicros);
      return budget > 0 && spend >= budget * 0.95;
    });
    if (limited.length === 0) return { result: "pass", details: "Top-performing campaigns have adequate budget", recommendation: "" };
    return { result: "fail", details: `${limited.length} top-performing campaigns are budget-limited`, recommendation: "Increase budget for top converters — every dollar constrained here moves to lower-ROAS campaigns" };
  }),

  // G40 — Manual CPC justification
  check("G40", "Settings & Targeting", "Manual CPC only on low-volume campaigns", "medium", 10, (d) => {
    const campaigns = d.campaigns ?? [];
    const manualWithVolume = campaigns.filter((c: any) =>
      (c.campaign?.biddingStrategyType === "MANUAL_CPC") &&
      Number(c.metrics?.conversions ?? 0) > 30 &&
      c.campaign?.status === "ENABLED"
    );
    if (manualWithVolume.length === 0) return { result: "pass", details: "No high-volume campaigns on Manual CPC", recommendation: "" };
    return { result: "fail", details: `${manualWithVolume.length} campaigns with >30 conversions still on Manual CPC`, recommendation: "Switch campaigns with >30 conv/month to Smart Bidding — they have enough data for automation" };
  }),

  // G41 — Portfolio bid strategies
  check("G41", "Settings & Targeting", "Portfolio bid strategies for low volume", "medium", 15, (d) => {
    const campaigns = d.campaigns ?? [];
    const lowVolume = campaigns.filter((c: any) =>
      c.campaign?.status === "ENABLED" &&
      Number(c.metrics?.conversions ?? 0) > 0 &&
      Number(c.metrics?.conversions ?? 0) < 15 &&
      !["MANUAL_CPC", "MANUAL_CPV"].includes(c.campaign?.biddingStrategyType ?? "")
    );
    if (lowVolume.length < 2) return { result: "pass", details: "Few low-volume Smart Bidding campaigns — portfolio not needed", recommendation: "" };
    return { result: "warning", details: `${lowVolume.length} low-volume campaigns (<15 conv) running independently`, recommendation: "Group low-volume campaigns into portfolio bid strategies to pool conversion data for better optimization" };
  }),

  // ── Extensions & Assets ──

  // G50 — Sitelink extensions (now automated via API)
  check("G50", "Settings & Targeting", "Sitelink extensions active (≥4)", "high", 10, (d) => {
    const extensions = d.extensions ?? [];
    if ((d.campaigns ?? []).length === 0) return { result: "skipped", details: "No campaigns", recommendation: "" };
    const sitelinks = extensions.filter((e: any) => e.asset?.type === "SITELINK" || e.customerAsset?.fieldType === "SITELINK");
    if (sitelinks.length === 0) {
      if (extensions.length === 0) return { result: "warning", details: "Extension data not available", recommendation: "Add ≥4 sitelinks per campaign to increase CTR by 10-20%" };
      return { result: "fail", details: "No sitelink extensions found in the account", recommendation: "Add ≥4 sitelinks: Contact Us, Case Results, Free Consultation, About Our Firm" };
    }
    if (sitelinks.length >= 4) return { result: "pass", details: `${sitelinks.length} sitelink extensions active`, recommendation: "" };
    return { result: "warning", details: `Only ${sitelinks.length} sitelinks — recommend ≥4`, recommendation: "Add more sitelinks: Contact, Practice Areas, Testimonials, Free Consultation, Case Results" };
  }),

  // G51 — Callout extensions (now automated via API)
  check("G51", "Settings & Targeting", "Callout extensions active (≥4)", "medium", 10, (d) => {
    const extensions = d.extensions ?? [];
    if ((d.campaigns ?? []).length === 0) return { result: "skipped", details: "No campaigns", recommendation: "" };
    const callouts = extensions.filter((e: any) => e.asset?.type === "CALLOUT" || e.customerAsset?.fieldType === "CALLOUT");
    if (callouts.length === 0) {
      if (extensions.length === 0) return { result: "warning", details: "Extension data not available", recommendation: "Add ≥4 callout extensions highlighting USPs" };
      return { result: "fail", details: "No callout extensions found", recommendation: "Add ≥4 callouts: 'Free Consultation', '25+ Years Experience', 'Award-Winning Attorneys', 'Confidential Case Review'" };
    }
    if (callouts.length >= 4) return { result: "pass", details: `${callouts.length} callout extensions active`, recommendation: "" };
    return { result: "warning", details: `Only ${callouts.length} callouts — recommend ≥4`, recommendation: "Add more callouts highlighting USPs and trust signals" };
  }),

  // G52 — Structured snippets (now automated via API)
  check("G52", "Settings & Targeting", "Structured snippet extensions active", "medium", 10, (d) => {
    const extensions = d.extensions ?? [];
    if ((d.campaigns ?? []).length === 0) return { result: "skipped", details: "No campaigns", recommendation: "" };
    const snippets = extensions.filter((e: any) => e.asset?.type === "STRUCTURED_SNIPPET" || e.customerAsset?.fieldType === "STRUCTURED_SNIPPET");
    if (snippets.length === 0) {
      if (extensions.length === 0) return { result: "warning", details: "Extension data not available", recommendation: "Add ≥1 structured snippet set" };
      return { result: "fail", details: "No structured snippet extensions", recommendation: "Add snippets for 'Services': Divorce, Child Custody, Alimony, Property Division, Prenuptial Agreements" };
    }
    return { result: "pass", details: `${snippets.length} structured snippet extensions active`, recommendation: "" };
  }),

  // G53 — Image extensions (now automated via API)
  check("G53", "Settings & Targeting", "Image extensions active for search", "medium", 10, (d) => {
    const extensions = d.extensions ?? [];
    const search = (d.campaigns ?? []).filter((c: any) => c.campaign?.advertisingChannelType === "SEARCH");
    if (search.length === 0) return { result: "skipped", details: "No search campaigns", recommendation: "" };
    const images = extensions.filter((e: any) => e.asset?.type === "IMAGE" || e.customerAsset?.fieldType === "IMAGE");
    if (images.length === 0) {
      if (extensions.length === 0) return { result: "warning", details: "Extension data not available", recommendation: "Add image extensions to search campaigns" };
      return { result: "fail", details: "No image extensions found", recommendation: "Add image extensions — they can improve CTR by 10%" };
    }
    return { result: "pass", details: `${images.length} image extensions active`, recommendation: "" };
  }),

  // G54 — Call extensions (now automated via API)
  check("G54", "Settings & Targeting", "Call extensions with tracking (if applicable)", "medium", 10, (d) => {
    const extensions = d.extensions ?? [];
    if ((d.campaigns ?? []).length === 0) return { result: "skipped", details: "No campaigns", recommendation: "" };
    const calls = extensions.filter((e: any) => e.asset?.type === "CALL" || e.customerAsset?.fieldType === "CALL");
    if (calls.length === 0) {
      if (extensions.length === 0) return { result: "warning", details: "Extension data not available", recommendation: "Add call extensions with call tracking" };
      return { result: "fail", details: "No call extensions found — critical for family law lead gen", recommendation: "Add call extensions with call tracking. Phone calls are a primary conversion path for family law" };
    }
    return { result: "pass", details: `${calls.length} call extensions active`, recommendation: "" };
  }),

  // G55 — Lead form extensions (now automated via API)
  check("G55", "Settings & Targeting", "Lead form extensions tested (lead gen)", "low", 15, (d) => {
    const extensions = d.extensions ?? [];
    if ((d.campaigns ?? []).length === 0) return { result: "skipped", details: "No campaigns", recommendation: "" };
    const leadForms = extensions.filter((e: any) => e.asset?.type === "LEAD_FORM" || e.customerAsset?.fieldType === "LEAD_FORM");
    if (leadForms.length > 0) return { result: "pass", details: `${leadForms.length} lead form extensions active`, recommendation: "" };
    if (extensions.length === 0) return { result: "warning", details: "Extension data not available", recommendation: "Test lead form extensions for lead gen" };
    return { result: "warning", details: "No lead form extensions found", recommendation: "Test lead form extensions — they capture leads directly from the SERP" };
  }),

  // G56 — Audience segments applied (now automated via API)
  check("G56", "Settings & Targeting", "Audience segments in Observation mode", "high", 15, (d) => {
    const audienceCriteria = d.audienceCriteria ?? [];
    if ((d.campaigns ?? []).length === 0) return { result: "skipped", details: "No campaigns", recommendation: "" };
    if (audienceCriteria.length === 0) return { result: "warning", details: "No audience segments detected — add in Observation mode", recommendation: "Apply remarketing + in-market audiences in Observation mode to gather data and improve bid optimization" };
    const campaignIds = new Set(audienceCriteria.map((a: any) => String(a.campaign?.id)));
    return { result: "pass", details: `Audience segments applied to ${campaignIds.size} campaigns`, recommendation: "" };
  }),

  // G57 — Customer Match lists (now automated via API)
  check("G57", "Settings & Targeting", "Customer Match lists uploaded (<30d)", "high", 20, (d) => {
    const userLists = d.userLists ?? [];
    if ((d.campaigns ?? []).length === 0) return { result: "skipped", details: "No campaigns", recommendation: "" };
    const crmLists = userLists.filter((u: any) => u.userList?.type === "CRM_BASED");
    if (crmLists.length === 0) {
      if (userLists.length === 0) return { result: "warning", details: "User list data not available", recommendation: "Upload Customer Match lists every 30 days for remarketing" };
      return { result: "warning", details: "No CRM-based Customer Match lists found", recommendation: "Upload Customer Match lists from your CRM for remarketing and similar audience expansion" };
    }
    const activeLists = crmLists.filter((u: any) => u.userList?.membershipStatus === "OPEN");
    if (activeLists.length > 0) return { result: "pass", details: `${activeLists.length} active Customer Match lists found`, recommendation: "" };
    return { result: "warning", details: `${crmLists.length} CRM lists found but none with OPEN status`, recommendation: "Refresh Customer Match lists within the last 30 days to keep them active" };
  }),

  // G58 — Placement exclusions
  check("G58", "Settings & Targeting", "Placement exclusions configured", "high", 15, (d) => {
    const campaigns = d.campaigns ?? [];
    const hasDisplay = campaigns.some((c: any) =>
      c.campaign?.advertisingChannelType === "PERFORMANCE_MAX" ||
      c.campaign?.advertisingChannelType === "DISPLAY"
    );
    if (!hasDisplay) return { result: "skipped", details: "No Display/PMax campaigns", recommendation: "" };
    return { result: "manual", details: "Placement exclusions require manual verification", recommendation: "Add account-level placement exclusions for games, kids apps, MFA sites, and irrelevant mobile apps" };
  }),

  // G59 — Landing page mobile speed (now automated via PageSpeed API)
  check("G59", "Settings & Targeting", "Landing page mobile speed (LCP <2.5s)", "high", 30, (d) => {
    const lpAnalysis = d.landingPageAnalysis ?? [];
    if ((d.campaigns ?? []).length === 0) return { result: "skipped", details: "No campaigns", recommendation: "" };
    if (lpAnalysis.length === 0) return { result: "warning", details: "Landing page speed data not available", recommendation: "Run Google PageSpeed Insights manually. Target mobile LCP <2.5s" };
    const withSpeed = lpAnalysis.filter((lp: any) => lp.pageSpeedScore != null);
    if (withSpeed.length === 0) return { result: "warning", details: "PageSpeed API did not return results", recommendation: "Run PageSpeed Insights manually on landing pages" };
    const slowPages = withSpeed.filter((lp: any) => lp.lcpMs != null && lp.lcpMs > 2500);
    const avgScore = withSpeed.reduce((sum: number, lp: any) => sum + (lp.pageSpeedScore ?? 0), 0) / withSpeed.length;
    if (slowPages.length === 0 && avgScore >= 70) {
      const details = withSpeed.map((lp: any) => { try { return `${new URL(lp.url).pathname}: ${lp.pageSpeedScore}/100${lp.lcpMs ? `, LCP ${(lp.lcpMs / 1000).toFixed(1)}s` : ""}`; } catch { return `${lp.pageSpeedScore}/100`; } }).join("; ");
      return { result: "pass", details: `Mobile PageSpeed avg ${avgScore.toFixed(0)}/100. ${details}`, recommendation: "" };
    }
    if (slowPages.length > 0) {
      const details = slowPages.map((lp: any) => { try { return `${new URL(lp.url).hostname}: LCP ${(lp.lcpMs / 1000).toFixed(1)}s (score: ${lp.pageSpeedScore})`; } catch { return `LCP ${(lp.lcpMs / 1000).toFixed(1)}s`; } }).join("; ");
      return { result: "fail", details: `${slowPages.length} pages with LCP >2.5s: ${details}`, recommendation: "Optimize: compress images, lazy-load below-fold, minimize JavaScript, use a CDN" };
    }
    return { result: "warning", details: `Mobile PageSpeed avg ${avgScore.toFixed(0)}/100 — below optimal`, recommendation: "Improve mobile score to 70+ for better Quality Score and lower CPC" };
  }),

  // G60 — Landing page relevance (enhanced with landing page content analysis)
  check("G60", "Settings & Targeting", "Landing page relevance to ad groups", "high", 30, (d) => {
    const keywords = d.keywords ?? [];
    const lpAnalysis = d.landingPageAnalysis ?? [];
    const scored = keywords.filter((k: any) => k.adGroupCriterion?.qualityInfo?.postClickQualityScore);
    if (scored.length > 0) {
      const below = scored.filter((k: any) => k.adGroupCriterion.qualityInfo.postClickQualityScore === "BELOW_AVERAGE");
      const pct = safeDiv(below.length, scored.length) * 100;
      if (pct < 15) return { result: "pass", details: `${pct.toFixed(0)}% of keywords have below-average landing page quality — acceptable`, recommendation: "" };
      let extra = "";
      if (lpAnalysis.length > 0) {
        const titles = lpAnalysis.map((lp: any) => lp.title).filter(Boolean).map((t: string) => `"${t}"`).join(", ");
        if (titles) extra = `. Page titles: ${titles}`;
      }
      return { result: "warning", details: `${pct.toFixed(0)}% of keywords report below-average landing page experience${extra}`, recommendation: "Improve landing page relevance — each practice area should have a dedicated landing page with matching H1" };
    }
    if (lpAnalysis.length > 0 && keywords.length > 0) {
      const topKW = keywords.filter((k: any) => Number(k.metrics?.impressions ?? 0) > 10).slice(0, 20).map((k: any) => (k.adGroupCriterion?.keyword?.text ?? "").toLowerCase()).filter(Boolean);
      if (topKW.length > 0) {
        const pageContent = lpAnalysis.map((lp: any) => `${lp.title} ${lp.h1}`).join(" ").toLowerCase();
        const matching = topKW.filter((kw: string) => kw.split(" ").some((w: string) => w.length > 3 && pageContent.includes(w)));
        const pct = safeDiv(matching.length, topKW.length) * 100;
        if (pct >= 50) return { result: "pass", details: `${pct.toFixed(0)}% of top keywords reflected in landing page titles/H1s`, recommendation: "" };
        return { result: "warning", details: `Only ${pct.toFixed(0)}% of top keywords found in landing page content`, recommendation: "Create keyword-themed landing pages. Each practice area should have a dedicated page with matching H1" };
      }
    }
    return { result: "warning", details: "Landing page relevance could not be verified", recommendation: "Ensure each landing page H1/title matches the ad group keyword theme" };
  }),

  // G61 — Landing page schema markup (now automated via HTML scan)
  check("G61", "Settings & Targeting", "Landing page schema markup present", "medium", 20, (d) => {
    const lpAnalysis = d.landingPageAnalysis ?? [];
    if ((d.campaigns ?? []).length === 0) return { result: "skipped", details: "No campaigns", recommendation: "" };
    if (lpAnalysis.length === 0) return { result: "warning", details: "Landing page data not available", recommendation: "Add Attorney/LegalService/FAQ schema markup to landing pages" };
    const withSchema = lpAnalysis.filter((lp: any) => lp.hasSchemaMarkup);
    if (withSchema.length === lpAnalysis.length) {
      const types = [...new Set(lpAnalysis.flatMap((lp: any) => lp.schemaTypes))].join(", ");
      return { result: "pass", details: `Schema markup on all ${lpAnalysis.length} pages${types ? ` (${types})` : ""}`, recommendation: "" };
    }
    if (withSchema.length > 0) return { result: "warning", details: `Schema on ${withSchema.length}/${lpAnalysis.length} pages — some missing`, recommendation: "Add Attorney/LegalService/FAQ schema to ALL landing pages" };
    return { result: "fail", details: "No schema markup detected on any landing page", recommendation: "Add JSON-LD schema: Attorney, LegalService, FAQPage, LocalBusiness for enhanced search presence" };
  }),

  // ── Settings & Extensions Detail Checks (ST01-ST08) ──

  // ST01 — Auto-Apply Recommendations OFF
  check("ST01", "Settings & Targeting", "Auto-Apply Recommendations disabled", "critical", 5, (d) => {
    const changeHistory = d.changeHistory ?? [];
    // Look for auto-applied changes (client_type = "GOOGLE_INTERNAL" or similar automated sources)
    const autoApplied = changeHistory.filter((ch: any) =>
      ch.changeEvent?.clientType === "GOOGLE_INTERNAL" ||
      ch.changeEvent?.clientType === "GOOGLE_ADS_RECOMMENDATIONS"
    );
    if (autoApplied.length === 0) return { result: "pass", details: "No auto-applied recommendation changes detected in last 14 days", recommendation: "" };
    return { result: "fail", details: `${autoApplied.length} auto-applied changes detected — Auto-Apply Recommendations may be enabled`, recommendation: "Disable ALL Auto-Apply Recommendations immediately. Google's auto-apply can add broad keywords, change bids, and modify budgets without your consent. Review all recent auto-applied changes and revert where needed" };
  }),

  // ST02 — Disapproved ads flagged
  check("ST02", "Settings & Targeting", "No disapproved ads in active campaigns", "high", 10, (d) => {
    const ads = d.ads ?? [];
    const disapproved = ads.filter((a: any) =>
      a.adGroupAd?.status === "ENABLED" &&
      a.adGroupAd?.policySummary?.approvalStatus === "DISAPPROVED"
    );
    if (disapproved.length === 0) return { result: "pass", details: "No disapproved ads detected in active ad groups", recommendation: "" };
    return { result: "fail", details: `${disapproved.length} disapproved ads in active campaigns — these are not serving`, recommendation: "Fix disapproved ads immediately. Review policy violations (legal advertising rules vary by state), correct ad copy, and resubmit for approval" };
  }),

  // ST03 — Language setting = English (now automated via API)
  check("ST03", "Settings & Targeting", "Language targeting set to English", "medium", 5, (d) => {
    const campaigns = d.campaigns ?? [];
    const langCriteria = d.languageCriteria ?? [];
    if (campaigns.length === 0) return { result: "skipped", details: "No campaigns", recommendation: "" };
    if (langCriteria.length === 0) return { result: "warning", details: "Language targeting data not available", recommendation: "Verify all campaigns target English" };
    // English = languageConstants/1000
    const nonEnglish = langCriteria.filter((l: any) => {
      const lc = l.campaignCriterion?.language?.languageConstant ?? "";
      return lc && !lc.includes("/1000");
    });
    if (nonEnglish.length === 0) return { result: "pass", details: "All campaigns target English language", recommendation: "" };
    const campaignIds = new Set(nonEnglish.map((l: any) => String(l.campaign?.id)));
    return { result: "warning", details: `${campaignIds.size} campaigns target non-English languages`, recommendation: "Review non-English targeting. Other languages only if the firm serves non-English-speaking clients" };
  }),

  // ST04 — Low-income zip code exclusion (family law specific)
  check("ST04", "Settings & Targeting", "Low-income zip codes excluded", "medium", 20, (d) => {
    const campaigns = d.campaigns ?? [];
    const active = campaigns.filter((c: any) => c.campaign?.status === "ENABLED");
    if (active.length === 0) return { result: "skipped", details: "No active campaigns", recommendation: "" };
    // Cannot verify zip exclusions via current API queries — flag for manual review
    return { result: "manual", details: "Zip code exclusion strategy requires manual review", recommendation: "Exclude low-income zip codes where the target client demographic doesn't reside. Review income-level targeting in campaign location settings and add exclusions for areas with low case value potential" };
  }),

  // ST05 — Device CPL comparison (flag devices >30% above account avg)
  check("ST05", "Settings & Targeting", "Device CPL within 30% of account average", "high", 10, (d) => {
    const campaigns = d.campaigns ?? [];
    const active = campaigns.filter((c: any) =>
      c.campaign?.status === "ENABLED" &&
      c.campaign?.advertisingChannelType === "SEARCH" &&
      Number(c.metrics?.conversions ?? 0) > 0
    );
    if (active.length === 0) return { result: "skipped", details: "No active search campaigns with conversions", recommendation: "" };
    const totalCost = active.reduce((s: number, c: any) => s + microsToValue(c.metrics?.costMicros), 0);
    const totalConv = active.reduce((s: number, c: any) => s + Number(c.metrics?.conversions ?? 0), 0);
    const avgCPL = safeDiv(totalCost, totalConv);
    if (avgCPL === 0) return { result: "skipped", details: "Cannot calculate CPL", recommendation: "" };
    // Cannot get device-level breakdown from campaign-level query — flag for manual review with the account average
    return { result: "manual", details: `Account avg CPL: $${avgCPL.toFixed(2)} — verify no device exceeds $${(avgCPL * 1.3).toFixed(2)} (30% above avg)`, recommendation: "Check device performance in the UI. If any device (mobile, desktop, tablet) has CPL more than 30% above the account average, apply a negative bid adjustment. Mobile typically has higher CPL for family law" };
  }),

  // ST06 — Shared budgets flagged
  check("ST06", "Settings & Targeting", "No shared budgets across campaigns", "medium", 10, (d) => {
    const campaigns = d.campaigns ?? [];
    const active = campaigns.filter((c: any) => c.campaign?.status === "ENABLED");
    if (active.length < 2) return { result: "skipped", details: "Fewer than 2 campaigns — shared budget check not applicable", recommendation: "" };
    // Check if multiple campaigns share the same budget resource name
    const budgetIds = active.map((c: any) => c.campaign?.campaignBudget ?? "").filter(Boolean);
    const budgetCounts = new Map<string, number>();
    for (const bid of budgetIds) {
      budgetCounts.set(bid, (budgetCounts.get(bid) ?? 0) + 1);
    }
    const shared = [...budgetCounts.entries()].filter(([, count]) => count > 1);
    if (shared.length === 0) return { result: "pass", details: "All campaigns have individual budgets", recommendation: "" };
    const sharedCampaignCount = shared.reduce((sum, [, count]) => sum + count, 0);
    return { result: "warning", details: `${sharedCampaignCount} campaigns share ${shared.length} budget(s) — budget allocation is not independently controlled`, recommendation: "Remove shared budgets and assign individual budgets to each campaign. Shared budgets let Google shift spend unpredictably between campaigns, often favoring lower-value traffic" };
  }),

  // ST07 — Sitelink count and quality (now automated via API)
  check("ST07", "Settings & Targeting", "Sitelinks ≥4 with descriptions", "high", 15, (d) => {
    const extensions = d.extensions ?? [];
    if ((d.campaigns ?? []).length === 0) return { result: "skipped", details: "No campaigns", recommendation: "" };
    const sitelinks = extensions.filter((e: any) => e.asset?.type === "SITELINK" || e.customerAsset?.fieldType === "SITELINK");
    if (sitelinks.length === 0) {
      if (extensions.length === 0) return { result: "warning", details: "Extension data not available", recommendation: "Verify ≥4 active sitelinks with descriptions" };
      return { result: "fail", details: "No sitelinks found", recommendation: "Add ≥4 sitelinks with descriptions linking to dedicated landing pages" };
    }
    if (sitelinks.length < 4) return { result: "warning", details: `Only ${sitelinks.length} sitelinks — need ≥4`, recommendation: "Add more sitelinks: Contact, Testimonials, Case Results, Free Consultation" };
    const missingDesc = sitelinks.filter((e: any) => !e.asset?.sitelinkAsset?.description1 && !e.asset?.sitelinkAsset?.description2);
    if (missingDesc.length === 0) return { result: "pass", details: `${sitelinks.length} sitelinks with descriptions configured`, recommendation: "" };
    return { result: "warning", details: `${missingDesc.length}/${sitelinks.length} sitelinks missing description lines`, recommendation: "Add description lines to all sitelinks — increases ad space and improves CTR" };
  }),

  // ST08 — Call extension schedule (now automated via API)
  check("ST08", "Settings & Targeting", "Call extensions scheduled to business hours", "medium", 10, (d) => {
    const extensions = d.extensions ?? [];
    if ((d.campaigns ?? []).length === 0) return { result: "skipped", details: "No campaigns", recommendation: "" };
    const calls = extensions.filter((e: any) => e.asset?.type === "CALL" || e.customerAsset?.fieldType === "CALL");
    if (calls.length === 0) {
      if (extensions.length === 0) return { result: "warning", details: "Extension data not available", recommendation: "Set call extension schedule to business hours" };
      return { result: "skipped", details: "No call extensions to check scheduling", recommendation: "" };
    }
    const withSchedule = calls.filter((e: any) => {
      const targets = e.asset?.callAsset?.adScheduleTargets;
      return targets && (Array.isArray(targets) ? targets.length > 0 : true);
    });
    if (withSchedule.length > 0) return { result: "pass", details: `${withSchedule.length} call extensions have schedule restrictions`, recommendation: "" };
    return { result: "warning", details: "Call extensions showing 24/7 — no schedule restrictions detected", recommendation: "Set call schedule to business hours only. After-hours calls lead to wasted clicks and missed leads" };
  }),
];

// ═══════════════════════════════════════════════════════════
// STERLINGX CUSTOM CHECKS — 15 checks
// SX01-SX15
// ═══════════════════════════════════════════════════════════

const sterlingxChecks: CheckFn[] = [
  // ── Cross-Platform Governance (SX01-SX05) ──

  check("SX01", "SterlingX Governance", "Unified UTM taxonomy", "high", 15, (d) => {
    const campaigns = d.campaigns ?? [];
    const names = campaigns.map((c: any) => c.campaign?.name ?? "");
    const hasStructure = names.filter((n: string) => /[_\-]/.test(n)).length;
    const pct = safeDiv(hasStructure, names.length) * 100;
    if (pct >= 80) return { result: "pass", details: `${pct.toFixed(0)}% of campaigns follow consistent naming pattern`, recommendation: "" };
    return { result: "warning", details: "Inconsistent naming patterns across campaigns", recommendation: "Implement SterlingX UTM standard: [Platform]_[Objective]_[Audience]_[Geo]_[Date]" };
  }),

  check("SX02", "SterlingX Governance", "Attribution window documented", "critical", 10, () => {
    return { result: "manual", details: "Attribution window alignment requires manual verification", recommendation: "Document and align attribution windows across all active platforms in a shared tracking sheet" };
  }),

  check("SX03", "SterlingX Governance", "Shared audience suppression active", "medium", 15, () => {
    return { result: "manual", details: "Cross-platform audience suppression requires manual verification", recommendation: "Sync customer suppression lists across all platforms to avoid targeting existing customers with acquisition campaigns" };
  }),

  check("SX04", "SterlingX Governance", "SterlingX naming convention compliance", "medium", 15, (d) => {
    const campaigns = d.campaigns ?? [];
    const names = campaigns.map((c: any) => c.campaign?.name ?? "");
    const compliant = names.filter((n: string) => /^[A-Z]+_[A-Z]+_[A-Z]/.test(n));
    const pct = safeDiv(compliant.length, names.length) * 100;
    if (pct >= 80) return { result: "pass", details: `${pct.toFixed(0)}% campaigns follow SterlingX naming convention`, recommendation: "" };
    return { result: "warning", details: `Only ${pct.toFixed(0)}% campaigns follow SterlingX naming convention`, recommendation: "Rename to [PLATFORM]_[OBJECTIVE]_[AUDIENCE]_[GEO]_[DATE] per SterlingX standards" };
  }),

  check("SX05", "SterlingX Governance", "Change log / revision history maintained", "low", 10, (d) => {
    const changeHistory = d.changeHistory ?? [];
    if (changeHistory.length >= 10) return { result: "pass", details: `${changeHistory.length} recent changes logged — active account management`, recommendation: "" };
    if (changeHistory.length > 0) return { result: "warning", details: `Only ${changeHistory.length} changes in last 14 days`, recommendation: "Maintain a formal change log with rationale for all account modifications" };
    return { result: "fail", details: "No change history detected — account may be unmanaged", recommendation: "Document all changes with dates and rationale. SterlingX requires weekly account activity logs" };
  }),

  // ── Client Reporting Readiness (SX06-SX10) ──

  check("SX06", "SterlingX Reporting", "GA4 integration verified", "high", 15, (d) => {
    const account = d.account?.[0];
    const trackingId = account?.customer?.conversionTrackingSetting?.conversionTrackingId;
    if (trackingId) return { result: "pass", details: "Conversion tracking ID detected — GA4 likely linked", recommendation: "" };
    return { result: "fail", details: "No conversion tracking integration detected", recommendation: "Link GA4 to Google Ads for cross-platform attribution and audience sharing" };
  }),

  check("SX07", "SterlingX Reporting", "Offline conversion import pipeline", "medium", 20, (d) => {
    const convs = d.conversions ?? [];
    const hasOffline = convs.some((c: any) =>
      c.conversionAction?.type === "UPLOAD_CLICKS" || c.conversionAction?.type === "UPLOAD_CALLS" || c.conversionAction?.type === "STORE_SALES"
    );
    if (hasOffline) return { result: "pass", details: "Offline conversion import pipeline detected", recommendation: "" };
    return { result: "warning", details: "No offline conversion import detected", recommendation: "Set up CRM-to-Google Ads offline conversion import for accurate ROI measurement" };
  }),

  check("SX08", "SterlingX Reporting", "Automated reporting dashboards", "medium", 30, () => {
    return { result: "manual", details: "Reporting dashboard status requires manual verification", recommendation: "Configure Looker Studio or live dashboard for client reporting — manual reports are not scalable" };
  }),

  check("SX09", "SterlingX Reporting", "MER (blended ROAS) trackable", "high", 20, (d) => {
    const campaigns = d.campaigns ?? [];
    const hasValue = campaigns.some((c: any) => Number(c.metrics?.conversionsValue ?? 0) > 0);
    if (hasValue) return { result: "pass", details: "Conversion values tracked — MER calculable", recommendation: "" };
    return { result: "warning", details: "No conversion value data — MER/blended ROAS cannot be calculated", recommendation: "Set up conversion value tracking to enable Marketing Efficiency Ratio calculations" };
  }),

  check("SX10", "SterlingX Reporting", "Monthly pacing alerts configured", "medium", 15, () => {
    return { result: "manual", details: "Pacing alert configuration requires manual verification", recommendation: "Configure automated pacing alerts (budget, CPA, ROAS) to catch deviations before they impact performance" };
  }),

  // ── Agency Operations (SX11-SX15) ──

  check("SX11", "SterlingX Operations", "Account access appropriate (MCC)", "critical", 10, (d) => {
    const changeHistory = d.changeHistory ?? [];
    const users = new Set(changeHistory.map((ch: any) => ch.changeEvent?.userEmail).filter(Boolean));
    if (users.size > 0) return { result: "pass", details: `${users.size} unique users with account access`, recommendation: "" };
    return { result: "warning", details: "Unable to determine account access — verify MCC permissions", recommendation: "Audit account access — ensure proper role-based access with no shared logins" };
  }),

  check("SX12", "SterlingX Operations", "Billing ownership verified (client-owned)", "high", 10, () => {
    return { result: "manual", details: "Billing ownership requires manual verification", recommendation: "Verify client owns billing method — agency billing should be documented with clear terms" };
  }),

  check("SX13", "SterlingX Operations", "Creative asset library organized", "medium", 15, () => {
    return { result: "manual", details: "Asset library organization requires manual verification", recommendation: "Maintain a tagged, dated, versioned creative asset library for efficient ad production" };
  }),

  check("SX14", "SterlingX Operations", "A/B test velocity (≥2 tests/month)", "medium", 30, (d) => {
    const ads = d.ads ?? [];
    const adGroups = new Set(ads.map((a: any) => String(a.adGroup?.id ?? a.campaign?.id)));
    const multiAdGroups = [...adGroups].filter((agId) =>
      ads.filter((a: any) => String(a.adGroup?.id ?? a.campaign?.id) === agId).length >= 2
    );
    if (multiAdGroups.length >= 2) return { result: "pass", details: `${multiAdGroups.length} ad groups running A/B tests`, recommendation: "" };
    return { result: "warning", details: "Fewer than 2 active A/B tests detected", recommendation: "SterlingX standard: maintain ≥2 active ad tests per month for continuous optimization" };
  }),

  check("SX15", "SterlingX Operations", "Competitor monitoring cadence", "low", 15, () => {
    return { result: "manual", details: "Competitor monitoring cadence requires manual verification", recommendation: "Conduct monthly competitive analysis — review auction insights, ad copy, and market positioning" };
  }),
];

// ═══════════════════════════════════════════════════════════
// MAIN AUDIT FUNCTION
// ═══════════════════════════════════════════════════════════

const ALL_CHECKS: CheckFn[] = [
  ...conversionChecks,    // 21 checks (11 core + 10 lead gen hardening)
  ...wastedSpendChecks,   // 8 checks
  ...structureChecks,     // 16 checks (12 core + 4 family law)
  ...keywordChecks,       // 8 checks
  ...adsChecks,           // 17 checks
  ...settingsChecks,      // 26 checks (18 core + 8 detail)
  ...sterlingxChecks,     // 15 checks = 111 total
];

export function runAudit(data: AuditData): AuditReport {
  const checks = ALL_CHECKS.map((fn) => fn(data));

  const passCount = checks.filter((c) => c.result === "pass").length;
  const warningCount = checks.filter((c) => c.result === "warning").length;
  const failCount = checks.filter((c) => c.result === "fail").length;
  const skippedCount = checks.filter((c) => c.result === "skipped").length;
  const manualCount = checks.filter((c) => c.result === "manual").length;

  // Calculate weighted score per category
  const categoryScores: Record<string, number> = {};
  const categoryMaxScores: Record<string, number> = {};

  for (const c of checks) {
    if (c.result === "skipped" || c.result === "manual") continue;
    const weight = SEVERITY_MULTIPLIER[c.severity];
    const earned = c.result === "pass" ? weight : c.result === "warning" ? weight * 0.5 : 0;
    categoryScores[c.category] = (categoryScores[c.category] ?? 0) + earned;
    categoryMaxScores[c.category] = (categoryMaxScores[c.category] ?? 0) + weight;
  }

  // Normalize each category to 0-100
  const normalizedCategories: Record<string, number> = {};
  for (const cat of Object.keys(categoryScores)) {
    normalizedCategories[cat] = safeDiv(categoryScores[cat], categoryMaxScores[cat]) * 100;
  }

  // Calculate total weighted score
  let totalScore = 0;
  let totalWeight = 0;
  for (const [cat, catScore] of Object.entries(normalizedCategories)) {
    const w = CATEGORY_WEIGHTS[cat] ?? 0.05; // SterlingX categories default 5%
    totalScore += catScore * w;
    totalWeight += w;
  }

  const score = totalWeight > 0 ? Math.round(safeDiv(totalScore, totalWeight)) : 0;
  const grade = gradeFromScore(score);

  const quickWins = checks
    .filter((c) => c.isQuickWin)
    .sort((a, b) => SEVERITY_MULTIPLIER[b.severity] - SEVERITY_MULTIPLIER[a.severity]);

  const criticalIssues = checks.filter((c) => c.result === "fail" && c.severity === "critical");
  const summary = generateSummary(score, grade, passCount, warningCount, failCount, manualCount, criticalIssues.length, quickWins.length);

  return {
    score,
    grade,
    totalChecks: checks.length,
    passCount,
    warningCount,
    failCount,
    skippedCount,
    manualCount,
    checks,
    summary,
    quickWins,
    categoryScores: normalizedCategories,
  };
}

function generateSummary(
  score: number,
  grade: Grade,
  pass: number,
  warn: number,
  fail: number,
  manual: number,
  critical: number,
  quickWins: number,
): string {
  const gradeDescriptions: Record<Grade, string> = {
    A: "Excellent — minor optimizations only",
    B: "Good — some improvement opportunities exist",
    C: "Average — notable issues need attention",
    D: "Below Average — significant problems present",
    F: "Critical — urgent intervention required",
  };

  return `SterlingX Ads Health Score: ${score}/100 (Grade ${grade})

${gradeDescriptions[grade]}

Results: ${pass} passed, ${warn} warnings, ${fail} failed${critical > 0 ? ` (${critical} CRITICAL)` : ""}${manual > 0 ? `, ${manual} manual review` : ""}
Quick Wins Available: ${quickWins} high-impact fixes under 15 minutes each

This audit covers 96 Google Ads platform checks (including family law specialization and lead gen hardening) and 15 SterlingX agency governance checks (111 total). Manual review items are excluded from scoring.`;
}
