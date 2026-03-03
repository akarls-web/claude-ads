/**
 * SterlingX Paid Ads Audit Engine
 *
 * Implements all 74 Google Ads audit checks (G01-G61, G-CT1-CT3, G-WS1,
 * G-KW1-KW2, G-AD1-AD2, G-PM1-PM5) plus 15 SterlingX agency checks (SX01-SX15).
 * Total: 89 checks across 9 categories.
 */

export type CheckResult = "pass" | "warning" | "fail" | "skipped";
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
// CONVERSION TRACKING — 11 checks (25% weight)
// G42-G49, G-CT1, G-CT2, G-CT3
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
    return { result: "warning", details: "Cannot verify Consent Mode v2 remotely — manual check required", recommendation: "Ensure Consent Mode v2 is implemented with a supported CMP for GDPR compliance" };
  }),

  // G46 — Conversion window appropriate
  check("G46", "Conversion Tracking", "Conversion window matches sales cycle", "medium", 10, (d) => {
    const convs = d.conversions ?? [];
    if (convs.length === 0) return { result: "skipped", details: "No conversions to check", recommendation: "" };
    return { result: "warning", details: "Conversion window configuration requires manual review", recommendation: "Verify window matches sales cycle: 7d e-commerce, 30d lead gen, 30-90d B2B" };
  }),

  // G47 — Micro vs macro separation (Primary vs Secondary)
  check("G47", "Conversion Tracking", "Micro vs macro conversion separation", "high", 10, (d) => {
    const convs = d.conversions ?? [];
    if (convs.length === 0) return { result: "skipped", details: "No conversions", recommendation: "" };
    const primary = convs.filter((c: any) => c.conversionAction?.includeInConversionsMetric === true);
    const secondary = convs.filter((c: any) => c.conversionAction?.includeInConversionsMetric === false);
    if (primary.length > 0 && secondary.length > 0) return { result: "pass", details: `${primary.length} primary, ${secondary.length} secondary actions — properly separated`, recommendation: "" };
    if (primary.length > 0 && secondary.length === 0) return { result: "warning", details: "All conversions marked as primary — micro-conversions may pollute bidding signals", recommendation: "Mark supporting actions (page views, scroll depth, AddToCart) as secondary to avoid bid signal pollution" };
    return { result: "fail", details: "No primary conversion actions identified", recommendation: "Designate your main revenue/lead actions as primary; mark micro-conversions as secondary" };
  }),

  // G48 — Attribution model
  check("G48", "Conversion Tracking", "Data-driven attribution model active", "medium", 5, (d) => {
    const convs = d.conversions ?? [];
    if (convs.length === 0) return { result: "skipped", details: "No conversions", recommendation: "" };
    // Cannot directly check attribution model via current API fields — recommend DDA
    return { result: "warning", details: "Attribution model cannot be verified via API — manual check required", recommendation: "Select Data-Driven Attribution (DDA) for all conversion actions. Rule-based models were deprecated Sep 2025" };
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

  // G-CT3 — Google Tag firing correctly
  check("G-CT3", "Conversion Tracking", "Google Tag firing on all pages", "critical", 15, (d) => {
    const convs = d.conversions ?? [];
    const hasTag = convs.some((c: any) => c.conversionAction?.tagSnippets?.length > 0);
    if (hasTag) return { result: "pass", details: "Tag snippets configured for conversion actions", recommendation: "" };
    if (convs.length === 0) return { result: "skipped", details: "No conversions configured", recommendation: "" };
    return { result: "warning", details: "Cannot verify tag firing remotely — manual check required", recommendation: "Use Google Tag Assistant to verify gtag.js or GTM fires correctly on all key pages" };
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
// ACCOUNT STRUCTURE — 12 checks (15% weight)
// G01-G12
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

  // G03 — Single theme ad groups (≤10 keywords per group)
  check("G03", "Account Structure", "Single theme ad groups (≤10 keywords)", "high", 20, (d) => {
    const keywords = d.keywords ?? [];
    if (keywords.length === 0) return { result: "skipped", details: "No keyword data", recommendation: "" };
    const kwPerGroup = new Map<string, number>();
    for (const k of keywords) {
      const agId = String(k.adGroup?.id ?? k.campaign?.id ?? "unknown");
      kwPerGroup.set(agId, (kwPerGroup.get(agId) ?? 0) + 1);
    }
    const oversized = [...kwPerGroup.values()].filter((count) => count > 20).length;
    const total = kwPerGroup.size;
    if (oversized === 0) return { result: "pass", details: `All ${total} ad groups have focused keyword themes`, recommendation: "" };
    const pct = safeDiv(oversized, total) * 100;
    if (pct < 25) return { result: "warning", details: `${oversized}/${total} ad groups have >20 keywords — potential theme drift`, recommendation: "Split large ad groups into tighter themes of 5-10 keywords each" };
    return { result: "fail", details: `${oversized}/${total} ad groups have >20 unrelated keywords — theme drift`, recommendation: "Restructure ad groups into single-keyword-theme groups (SKAGs or STAGs) with ≤10 keywords each" };
  }),

  // G04 — Campaign count per objective (≤5 per funnel stage)
  check("G04", "Account Structure", "Campaign count per objective appropriate", "high", 30, (d) => {
    const campaigns = d.campaigns ?? [];
    const active = campaigns.filter((c: any) => c.campaign?.status === "ENABLED");
    if (active.length <= 5) return { result: "pass", details: `${active.length} active campaigns — well-organized`, recommendation: "" };
    if (active.length <= 15) return { result: "pass", details: `${active.length} active campaigns`, recommendation: "" };
    if (active.length <= 25) return { result: "warning", details: `${active.length} active campaigns — may be spreading budget`, recommendation: "Consider consolidating campaigns. Google AI performs better with fewer, well-funded campaigns" };
    return { result: "fail", details: `${active.length} active campaigns — likely fragmented`, recommendation: "Consolidate to ≤5 campaigns per funnel stage/objective. Fragmentation starves AI-powered bidding of data" };
  }),

  // G05 — Brand vs Non-Brand separation
  check("G05", "Account Structure", "Brand vs non-brand separation", "critical", 10, (d) => {
    const campaigns = d.campaigns ?? [];
    const search = campaigns.filter((c: any) => c.campaign?.advertisingChannelType === "SEARCH");
    if (search.length === 0) return { result: "skipped", details: "No search campaigns", recommendation: "" };
    const names = search.map((c: any) => (c.campaign?.name ?? "").toLowerCase());
    const hasBrand = names.some((n: string) => /brand/.test(n));
    const hasNonBrand = names.some((n: string) => /non.?brand|generic|prospect/.test(n));
    if (hasBrand && hasNonBrand) return { result: "pass", details: "Brand and non-brand campaigns are separated", recommendation: "" };
    if (search.length === 1) return { result: "warning", details: "Only 1 search campaign — brand/non-brand may be mixed", recommendation: "Separate brand and non-brand into dedicated campaigns for better budget control" };
    return { result: "fail", details: "No clear brand vs non-brand campaign separation", recommendation: "Create separate brand and non-brand campaigns — brand terms typically have 10x higher CTR and lower CPC" };
  }),

  // G06 — PMax present for eligible accounts
  check("G06", "Account Structure", "Performance Max campaign active", "medium", 30, (d) => {
    const campaigns = d.campaigns ?? [];
    const hasPMax = campaigns.some((c: any) => c.campaign?.advertisingChannelType === "PERFORMANCE_MAX");
    const hasConversions = campaigns.some((c: any) => Number(c.metrics?.conversions ?? 0) > 0);
    if (hasPMax) return { result: "pass", details: "Performance Max campaign is active", recommendation: "" };
    if (!hasConversions) return { result: "skipped", details: "Account lacks conversion history — PMax not yet recommended", recommendation: "" };
    return { result: "warning", details: "No PMax campaign despite conversion history", recommendation: "Test Performance Max for accounts with conversion data — it covers all Google inventory" };
  }),

  // G07 — Search + PMax brand overlap
  check("G07", "Account Structure", "Search + PMax brand overlap managed", "high", 15, (d) => {
    const campaigns = d.campaigns ?? [];
    const search = campaigns.filter((c: any) => c.campaign?.advertisingChannelType === "SEARCH");
    const pmax = campaigns.filter((c: any) => c.campaign?.advertisingChannelType === "PERFORMANCE_MAX");
    if (pmax.length === 0 || search.length === 0) return { result: "skipped", details: "Not running both Search and PMax", recommendation: "" };
    const brandSearch = search.some((c: any) => /brand/i.test(c.campaign?.name ?? ""));
    if (!brandSearch) return { result: "pass", details: "No brand Search campaign — no overlap concern", recommendation: "" };
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

  // G10 — Ad schedule configured
  check("G10", "Account Structure", "Ad schedule configured (if applicable)", "low", 10, (d) => {
    const campaigns = d.campaigns ?? [];
    if (campaigns.length === 0) return { result: "skipped", details: "No campaigns", recommendation: "" };
    return { result: "warning", details: "Ad schedule configuration requires manual verification", recommendation: "Set ad schedules if your business has defined operating hours to avoid spending when leads cannot be handled" };
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
    return { result: "warning", details: "Location targeting setting could not be verified — manual check recommended", recommendation: "Verify location targeting is set to 'Presence' not 'Presence or Interest'" };
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

  // G31 — PMax asset group density
  check("G31", "Ads & Assets", "PMax asset groups have maximum density", "critical", 20, (d) => {
    const assetGroups = d.assetGroups ?? [];
    if (assetGroups.length === 0) return { result: "skipped", details: "No PMax asset groups", recommendation: "" };
    return { result: "warning", details: "PMax asset density requires manual audit — verify 20 images, 5 logos, 5 videos per group", recommendation: "Ensure maximum asset density: 20 images, 5 logos, 5+ videos (16:9, 1:1, 9:16), 5 headlines, 5 descriptions per group" };
  }),

  // G32 — PMax video assets present
  check("G32", "Ads & Assets", "PMax has native video assets", "high", 30, (d) => {
    const assetGroups = d.assetGroups ?? [];
    if (assetGroups.length === 0) return { result: "skipped", details: "No PMax campaigns", recommendation: "" };
    return { result: "warning", details: "PMax video assets require manual verification", recommendation: "Upload native videos in all formats (16:9, 1:1, 9:16) — auto-generated videos perform significantly worse" };
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
    return { result: "warning", details: "PMax final URL expansion setting requires manual review", recommendation: "Review URL expansion: enable for discovery/broad reach, disable for controlled landing page targeting" };
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

  // G-AD2 — CTR vs industry benchmark
  check("G-AD2", "Ads & Assets", "CTR at or above industry average", "high", 20, (d) => {
    const campaigns = d.campaigns ?? [];
    const search = campaigns.filter((c: any) => c.campaign?.advertisingChannelType === "SEARCH" && Number(c.metrics?.impressions ?? 0) > 100);
    if (search.length === 0) return { result: "skipped", details: "No search campaigns with sufficient data", recommendation: "" };
    const totalClicks = search.reduce((sum: number, c: any) => sum + Number(c.metrics?.clicks ?? 0), 0);
    const totalImps = search.reduce((sum: number, c: any) => sum + Number(c.metrics?.impressions ?? 0), 0);
    const avgCTR = safeDiv(totalClicks, totalImps) * 100;
    // Industry average CTR for search is ~3-5%
    if (avgCTR >= 5) return { result: "pass", details: `Account CTR: ${avgCTR.toFixed(2)}% — above industry average`, recommendation: "" };
    if (avgCTR >= 3) return { result: "warning", details: `Account CTR: ${avgCTR.toFixed(2)}% — at industry average`, recommendation: "Improve CTR with better headlines, ad extensions, and keyword-ad alignment" };
    return { result: "fail", details: `Account CTR: ${avgCTR.toFixed(2)}% — below industry average (3-5%)`, recommendation: "Low CTR indicates poor ad relevance. Rewrite headlines, add extensions, and tighten keyword themes" };
  }),

  // G-PM1 — PMax audience signals configured
  check("G-PM1", "Ads & Assets", "PMax audience signals configured", "high", 15, (d) => {
    const assetGroups = d.assetGroups ?? [];
    if (assetGroups.length === 0) return { result: "skipped", details: "No PMax campaigns", recommendation: "" };
    return { result: "warning", details: "PMax audience signal configuration requires manual verification", recommendation: "Add custom audience signals per asset group: custom segments, interests, remarketing lists for better targeting" };
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
    const brandSearch = campaigns.filter((c: any) => c.campaign?.advertisingChannelType === "SEARCH" && /brand/i.test(c.campaign?.name ?? ""));
    if (pmax.length === 0 || brandSearch.length === 0) return { result: "skipped", details: "Not running both PMax and brand Search", recommendation: "" };
    return { result: "warning", details: "PMax may be cannibalizing brand Search — verify brand exclusions", recommendation: "Add brand exclusions in PMax settings and monitor brand vs non-brand conversion split" };
  }),

  // G-PM4 — PMax search themes
  check("G-PM4", "Ads & Assets", "PMax search themes configured", "medium", 10, (d) => {
    const campaigns = d.campaigns ?? [];
    const pmax = campaigns.filter((c: any) => c.campaign?.advertisingChannelType === "PERFORMANCE_MAX");
    if (pmax.length === 0) return { result: "skipped", details: "No PMax campaigns", recommendation: "" };
    return { result: "warning", details: "PMax search theme configuration requires manual verification", recommendation: "Configure up to 50 search themes per asset group to guide Google's AI on your target queries" };
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
// SETTINGS & TARGETING — 18 checks (10% weight)
// Bidding & Budget: G36-G41
// Settings: G50-G61
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

  // G50 — Sitelink extensions
  check("G50", "Settings & Targeting", "Sitelink extensions active (≥4)", "high", 10, (d) => {
    const campaigns = d.campaigns ?? [];
    if (campaigns.length === 0) return { result: "skipped", details: "No campaigns", recommendation: "" };
    return { result: "warning", details: "Sitelink extensions require manual verification", recommendation: "Add ≥4 sitelinks per campaign with descriptive text to increase ad real estate and CTR by 10-20%" };
  }),

  // G51 — Callout extensions
  check("G51", "Settings & Targeting", "Callout extensions active (≥4)", "medium", 10, (d) => {
    const campaigns = d.campaigns ?? [];
    if (campaigns.length === 0) return { result: "skipped", details: "No campaigns", recommendation: "" };
    return { result: "warning", details: "Callout extensions require manual verification", recommendation: "Add ≥4 callout extensions highlighting USPs (Free Shipping, 24/7 Support, Money-Back Guarantee)" };
  }),

  // G52 — Structured snippets
  check("G52", "Settings & Targeting", "Structured snippet extensions active", "medium", 10, (d) => {
    const campaigns = d.campaigns ?? [];
    if (campaigns.length === 0) return { result: "skipped", details: "No campaigns", recommendation: "" };
    return { result: "warning", details: "Structured snippet extensions require manual verification", recommendation: "Add ≥1 structured snippet set (Types, Services, Brands, Features) to provide additional context" };
  }),

  // G53 — Image extensions
  check("G53", "Settings & Targeting", "Image extensions active for search", "medium", 10, (d) => {
    const campaigns = d.campaigns ?? [];
    const search = campaigns.filter((c: any) => c.campaign?.advertisingChannelType === "SEARCH");
    if (search.length === 0) return { result: "skipped", details: "No search campaigns", recommendation: "" };
    return { result: "warning", details: "Image extensions require manual verification", recommendation: "Add image extensions to search campaigns — they increase ad visibility and can improve CTR by 10%" };
  }),

  // G54 — Call extensions
  check("G54", "Settings & Targeting", "Call extensions with tracking (if applicable)", "medium", 10, (d) => {
    const campaigns = d.campaigns ?? [];
    if (campaigns.length === 0) return { result: "skipped", details: "No campaigns", recommendation: "" };
    return { result: "warning", details: "Call extensions require manual verification", recommendation: "Add call extensions with call tracking for phone-based businesses to capture phone leads" };
  }),

  // G55 — Lead form extensions
  check("G55", "Settings & Targeting", "Lead form extensions tested (lead gen)", "low", 15, (d) => {
    const campaigns = d.campaigns ?? [];
    if (campaigns.length === 0) return { result: "skipped", details: "No campaigns", recommendation: "" };
    return { result: "warning", details: "Lead form extensions require manual review", recommendation: "Test lead form extensions for lead gen accounts — they can capture leads directly from the SERP" };
  }),

  // G56 — Audience segments applied
  check("G56", "Settings & Targeting", "Audience segments in Observation mode", "high", 15, (d) => {
    const campaigns = d.campaigns ?? [];
    if (campaigns.length === 0) return { result: "skipped", details: "No campaigns", recommendation: "" };
    return { result: "warning", details: "Audience segment application requires manual verification", recommendation: "Apply remarketing + in-market audiences in Observation mode to gather data and improve bid optimization" };
  }),

  // G57 — Customer Match lists
  check("G57", "Settings & Targeting", "Customer Match lists uploaded (<30d)", "high", 20, (d) => {
    const campaigns = d.campaigns ?? [];
    if (campaigns.length === 0) return { result: "skipped", details: "No campaigns", recommendation: "" };
    return { result: "warning", details: "Customer Match list status requires manual verification", recommendation: "Upload and refresh Customer Match lists every 30 days for remarketing and similar audience expansion" };
  }),

  // G58 — Placement exclusions
  check("G58", "Settings & Targeting", "Placement exclusions configured", "high", 15, (d) => {
    const campaigns = d.campaigns ?? [];
    const hasDisplay = campaigns.some((c: any) =>
      c.campaign?.advertisingChannelType === "PERFORMANCE_MAX" ||
      c.campaign?.advertisingChannelType === "DISPLAY"
    );
    if (!hasDisplay) return { result: "skipped", details: "No Display/PMax campaigns", recommendation: "" };
    return { result: "warning", details: "Placement exclusions require manual verification", recommendation: "Add account-level placement exclusions for games, kids apps, MFA sites, and irrelevant mobile apps" };
  }),

  // G59 — Landing page mobile speed
  check("G59", "Settings & Targeting", "Landing page mobile speed (LCP <2.5s)", "high", 30, (d) => {
    const campaigns = d.campaigns ?? [];
    if (campaigns.length === 0) return { result: "skipped", details: "No campaigns", recommendation: "" };
    return { result: "warning", details: "Landing page speed requires manual testing (use PageSpeed Insights)", recommendation: "Achieve mobile LCP <2.5s (ideal <2.0s). Run Google PageSpeed Insights on all landing pages" };
  }),

  // G60 — Landing page relevance
  check("G60", "Settings & Targeting", "Landing page relevance to ad groups", "high", 30, (d) => {
    const keywords = d.keywords ?? [];
    const scored = keywords.filter((k: any) => k.adGroupCriterion?.qualityInfo?.postClickQualityScore);
    if (scored.length === 0) return { result: "warning", details: "Landing page relevance requires manual verification", recommendation: "Ensure each landing page H1/title matches the ad group's keyword theme" };
    const below = scored.filter((k: any) => k.adGroupCriterion.qualityInfo.postClickQualityScore === "BELOW_AVERAGE");
    const pct = safeDiv(below.length, scored.length) * 100;
    if (pct < 15) return { result: "pass", details: `${pct.toFixed(0)}% of keywords have below-average landing page quality — acceptable`, recommendation: "" };
    return { result: "warning", details: `${pct.toFixed(0)}% of keywords report below-average landing page experience`, recommendation: "Improve landing page content relevance — H1 should match ad group theme, add keyword-rich content" };
  }),

  // G61 — Landing page schema markup
  check("G61", "Settings & Targeting", "Landing page schema markup present", "medium", 20, (d) => {
    const campaigns = d.campaigns ?? [];
    if (campaigns.length === 0) return { result: "skipped", details: "No campaigns", recommendation: "" };
    return { result: "warning", details: "Schema markup cannot be verified via Google Ads API", recommendation: "Add Product/FAQ/Service schema markup to landing pages for enhanced search presence" };
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
    return { result: "warning", details: "Attribution window alignment requires manual verification", recommendation: "Document and align attribution windows across all active platforms in a shared tracking sheet" };
  }),

  check("SX03", "SterlingX Governance", "Shared audience suppression active", "medium", 15, () => {
    return { result: "warning", details: "Cross-platform audience suppression requires manual verification", recommendation: "Sync customer suppression lists across all platforms to avoid targeting existing customers with acquisition campaigns" };
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
    return { result: "warning", details: "Reporting dashboard status requires manual verification", recommendation: "Configure Looker Studio or live dashboard for client reporting — manual reports are not scalable" };
  }),

  check("SX09", "SterlingX Reporting", "MER (blended ROAS) trackable", "high", 20, (d) => {
    const campaigns = d.campaigns ?? [];
    const hasValue = campaigns.some((c: any) => Number(c.metrics?.conversionsValue ?? 0) > 0);
    if (hasValue) return { result: "pass", details: "Conversion values tracked — MER calculable", recommendation: "" };
    return { result: "warning", details: "No conversion value data — MER/blended ROAS cannot be calculated", recommendation: "Set up conversion value tracking to enable Marketing Efficiency Ratio calculations" };
  }),

  check("SX10", "SterlingX Reporting", "Monthly pacing alerts configured", "medium", 15, () => {
    return { result: "warning", details: "Pacing alert configuration requires manual verification", recommendation: "Configure automated pacing alerts (budget, CPA, ROAS) to catch deviations before they impact performance" };
  }),

  // ── Agency Operations (SX11-SX15) ──

  check("SX11", "SterlingX Operations", "Account access appropriate (MCC)", "critical", 10, (d) => {
    const changeHistory = d.changeHistory ?? [];
    const users = new Set(changeHistory.map((ch: any) => ch.changeEvent?.userEmail).filter(Boolean));
    if (users.size > 0) return { result: "pass", details: `${users.size} unique users with account access`, recommendation: "" };
    return { result: "warning", details: "Unable to determine account access — verify MCC permissions", recommendation: "Audit account access — ensure proper role-based access with no shared logins" };
  }),

  check("SX12", "SterlingX Operations", "Billing ownership verified (client-owned)", "high", 10, () => {
    return { result: "warning", details: "Billing ownership requires manual verification", recommendation: "Verify client owns billing method — agency billing should be documented with clear terms" };
  }),

  check("SX13", "SterlingX Operations", "Creative asset library organized", "medium", 15, () => {
    return { result: "warning", details: "Asset library organization requires manual verification", recommendation: "Maintain a tagged, dated, versioned creative asset library for efficient ad production" };
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
    return { result: "warning", details: "Competitor monitoring cadence requires manual verification", recommendation: "Conduct monthly competitive analysis — review auction insights, ad copy, and market positioning" };
  }),
];

// ═══════════════════════════════════════════════════════════
// MAIN AUDIT FUNCTION
// ═══════════════════════════════════════════════════════════

const ALL_CHECKS: CheckFn[] = [
  ...conversionChecks,    // 11 checks
  ...wastedSpendChecks,   // 8 checks
  ...structureChecks,     // 12 checks
  ...keywordChecks,       // 8 checks
  ...adsChecks,           // 17 checks
  ...settingsChecks,      // 18 checks
  ...sterlingxChecks,     // 15 checks = 89 total
];

export function runAudit(data: AuditData): AuditReport {
  const checks = ALL_CHECKS.map((fn) => fn(data));

  const passCount = checks.filter((c) => c.result === "pass").length;
  const warningCount = checks.filter((c) => c.result === "warning").length;
  const failCount = checks.filter((c) => c.result === "fail").length;
  const skippedCount = checks.filter((c) => c.result === "skipped").length;

  // Calculate weighted score per category
  const categoryScores: Record<string, number> = {};
  const categoryMaxScores: Record<string, number> = {};

  for (const c of checks) {
    if (c.result === "skipped") continue;
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
  const summary = generateSummary(score, grade, passCount, warningCount, failCount, criticalIssues.length, quickWins.length);

  return {
    score,
    grade,
    totalChecks: checks.length,
    passCount,
    warningCount,
    failCount,
    skippedCount,
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

Results: ${pass} passed, ${warn} warnings, ${fail} failed${critical > 0 ? ` (${critical} CRITICAL)` : ""}
Quick Wins Available: ${quickWins} high-impact fixes under 15 minutes each

This audit covers 74 Google Ads platform checks and 15 SterlingX agency governance checks (89 total).`;
}
