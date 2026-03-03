/**
 * SterlingX AI Analysis Service
 *
 * Uses Claude (Anthropic) to generate expert narrative analysis
 * of audit results, leveraging the SterlingX ads skill context.
 *
 * Runs AFTER the deterministic 74-check audit engine to produce:
 *   - Executive summary narrative
 *   - Per-category deep-dive analysis
 *   - Prioritised action plan with business-impact framing
 *   - Wasted spend projections
 */

import Anthropic from "@anthropic-ai/sdk";

// ─── Types ───────────────────────────────────────────────

export interface AuditCheckForAI {
  checkId: string;
  category: string;
  description: string;
  result: string;
  severity: string;
  details: string | null;
  recommendation: string | null;
  isQuickWin: boolean | null;
}

export interface AIAnalysisInput {
  customerName: string;
  customerId: string;
  score: number;
  grade: string;
  totalChecks: number;
  passCount: number;
  warningCount: number;
  failCount: number;
  skippedCount: number;
  categoryScores: Record<string, number>;
  checks: AuditCheckForAI[];
  dataCounts: Record<string, number>;
}

export interface CategoryAnalysis {
  category: string;
  score: number;
  headline: string;
  narrative: string;
  criticalFindings: string[];
  actionItems: string[];
}

export interface AIAnalysisResult {
  executiveSummary: string;
  overallAssessment: string;
  categoryAnalyses: CategoryAnalysis[];
  priorityActions: {
    immediate: string[];
    nearTerm: string[];
    strategic: string[];
  };
  wastedSpendInsights: string;
  estimatedImpact: string;
  generatedAt: string;
}

// ─── System Prompt (distilled from skills) ───────────────

const SYSTEM_PROMPT = `You are a senior SterlingX paid advertising strategist producing a professional Google Ads audit report narrative.

## Your Role
You analyze rule-based audit check results and produce expert-quality written analysis suitable for a C-level client deliverable PDF. Write in the third person, professional tone. Be specific — reference check IDs, concrete data points, and dollar impacts where possible.

## Scoring Context
- Score 0-100 using weighted algorithm: S = Σ(C_pass × W_sev × W_cat) / Σ(C_total × W_sev × W_cat) × 100
- Severity multipliers: Critical=5.0, High=3.0, Medium=1.5, Low=0.5
- Grade scale: A (90-100), B (75-89), C (60-74), D (40-59), F (<40)

## Category Weights (Google Ads)
- Conversion Tracking: 25% — Foundation for all optimization
- Wasted Spend / Negatives: 20% — Direct money leak
- Account Structure: 15% — Campaign organization
- Keywords & Quality Score: 15% — QS directly impacts CPC
- Ads & Assets: 15% — RSA strength, PMax assets
- Settings & Targeting: 10% — Location, audiences, landing pages

## Quality Gates (hard rules — always mention if violated)
- Never Broad Match without Smart Bidding
- 3x Kill Rule: flag CPA >3x target for pause
- Budget sufficiency warnings
- Learning phase: never recommend edits during active learning

## Writing Style
- Professional, direct, actionable
- Use data from the checks to support every claim
- Reference check IDs (e.g., G42, G14, SX01) when citing findings
- Quantify impact where possible (e.g., "estimated 15-25% wasted spend")
- Group recommendations by urgency: Immediate, Near-Term, Strategic
- No fluff — every sentence should add value for the client`;

// ─── Main Analysis Function ──────────────────────────────

export async function generateAIAnalysis(
  input: AIAnalysisInput
): Promise<AIAnalysisResult> {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    console.warn("[ai-analysis] No ANTHROPIC_API_KEY — skipping AI analysis");
    return fallbackAnalysis(input);
  }

  const client = new Anthropic({ apiKey });

  // Build the user prompt with all check data
  const failedChecks = input.checks.filter((c) => c.result === "fail");
  const warningChecks = input.checks.filter((c) => c.result === "warning");
  const passedChecks = input.checks.filter((c) => c.result === "pass");

  const userPrompt = `Analyze this Google Ads audit and produce a structured JSON response.

## Account Overview
- **Client**: ${input.customerName} (ID: ${input.customerId})
- **Overall Score**: ${input.score}/100 (Grade ${input.grade})
- **Checks**: ${input.totalChecks} total | ${input.passCount} passed | ${input.warningCount} warnings | ${input.failCount} failed | ${input.skippedCount} skipped

## Category Scores
${Object.entries(input.categoryScores)
  .map(([cat, score]) => `- ${cat}: ${Math.round(score)}/100`)
  .join("\n")}

## Data Scope
${Object.entries(input.dataCounts)
  .map(([key, count]) => `- ${key}: ${count} records`)
  .join("\n")}

## Failed Checks (${failedChecks.length})
${failedChecks.map((c) => `- **[${c.checkId}] ${c.description}** (${c.severity}): ${c.details ?? "No details"}${c.recommendation ? ` → ${c.recommendation}` : ""}`).join("\n")}

## Warning Checks (${warningChecks.length})
${warningChecks.map((c) => `- **[${c.checkId}] ${c.description}** (${c.severity}): ${c.details ?? "No details"}`).join("\n")}

## Passed Checks (${passedChecks.length})
${passedChecks.map((c) => `- [${c.checkId}] ${c.description}`).join("\n")}

## Quick Wins Available
${input.checks.filter((c) => c.isQuickWin && c.result === "fail").map((c) => `- [${c.checkId}] ${c.description}`).join("\n") || "None identified"}

---

Respond with ONLY valid JSON matching this exact structure (no markdown fences, no explanation outside JSON):

{
  "executiveSummary": "2-3 paragraph executive summary suitable for the first page of a client deliverable. Reference key metrics and the most impactful findings.",
  "overallAssessment": "1 paragraph overall health assessment with the grade context.",
  "categoryAnalyses": [
    {
      "category": "Category Name",
      "score": 85,
      "headline": "One-line headline for this category",
      "narrative": "2-3 paragraph deep analysis of this category's findings",
      "criticalFindings": ["Finding 1 with check ID reference", "Finding 2"],
      "actionItems": ["Specific action 1", "Specific action 2"]
    }
  ],
  "priorityActions": {
    "immediate": ["Action to take this week with check ID reference"],
    "nearTerm": ["Action for next 2-4 weeks"],
    "strategic": ["Longer-term optimization"]
  },
  "wastedSpendInsights": "Paragraph analyzing wasted spend patterns and estimated annual impact",
  "estimatedImpact": "Paragraph describing estimated improvement if recommendations are implemented"
}`;

  try {
    console.log("[ai-analysis] Calling Claude for narrative analysis...");
    const start = Date.now();

    const message = await client.messages.create({
      model: "claude-sonnet-4-20250514",
      max_tokens: 4096,
      system: SYSTEM_PROMPT,
      messages: [{ role: "user", content: userPrompt }],
    });

    const elapsed = ((Date.now() - start) / 1000).toFixed(1);
    console.log(`[ai-analysis] Claude responded in ${elapsed}s`);

    // Extract text content
    const textBlock = message.content.find((b) => b.type === "text");
    if (!textBlock || textBlock.type !== "text") {
      console.error("[ai-analysis] No text response from Claude");
      return fallbackAnalysis(input);
    }

    // Parse JSON — strip markdown fences if present
    let jsonStr = textBlock.text.trim();
    if (jsonStr.startsWith("```")) {
      jsonStr = jsonStr.replace(/^```(?:json)?\n?/, "").replace(/\n?```$/, "");
    }

    const parsed = JSON.parse(jsonStr) as AIAnalysisResult;
    parsed.generatedAt = new Date().toISOString();

    console.log("[ai-analysis] Successfully parsed AI analysis");
    return parsed;
  } catch (err) {
    console.error("[ai-analysis] Claude API error:", err instanceof Error ? err.message : err);
    return fallbackAnalysis(input);
  }
}

// ─── Fallback (no API key or error) ──────────────────────

function fallbackAnalysis(input: AIAnalysisInput): AIAnalysisResult {
  const failed = input.checks.filter((c) => c.result === "fail");
  const critical = failed.filter((c) => c.severity === "critical");

  return {
    executiveSummary: `This audit of ${input.customerName} evaluated ${input.totalChecks} checks across 6 categories, resulting in a score of ${input.score}/100 (Grade ${input.grade}). ${input.failCount} checks failed and ${input.warningCount} produced warnings. ${critical.length > 0 ? `There are ${critical.length} critical issues requiring immediate attention.` : "No critical severity issues were found."}`,
    overallAssessment: `The account earned a Grade ${input.grade} with a weighted score of ${input.score}/100. ${input.grade === "A" || input.grade === "B" ? "The account is in good health with minor optimization opportunities." : input.grade === "C" ? "The account has notable issues that need attention to improve performance." : "The account has significant problems that are likely impacting performance and wasting budget."}`,
    categoryAnalyses: Object.entries(input.categoryScores).map(([cat, score]) => {
      const catChecks = input.checks.filter((c) => c.category === cat);
      const catFailed = catChecks.filter((c) => c.result === "fail");
      return {
        category: cat,
        score: Math.round(score),
        headline: `${Math.round(score)}/100 — ${catFailed.length} issue${catFailed.length !== 1 ? "s" : ""} found`,
        narrative: `${cat} scored ${Math.round(score)}/100 with ${catFailed.length} failed checks out of ${catChecks.length} total. ${catFailed.length > 0 ? `Key issues: ${catFailed.map((c) => c.description).join(", ")}.` : "All checks passed or produced warnings only."}`,
        criticalFindings: catFailed.map((c) => `[${c.checkId}] ${c.description}: ${c.details ?? "Failed"}`),
        actionItems: catFailed.filter((c) => c.recommendation).map((c) => c.recommendation!),
      };
    }),
    priorityActions: {
      immediate: failed.filter((c) => c.severity === "critical" || c.severity === "high").map((c) => `[${c.checkId}] ${c.recommendation ?? c.description}`),
      nearTerm: failed.filter((c) => c.severity === "medium").map((c) => `[${c.checkId}] ${c.recommendation ?? c.description}`),
      strategic: failed.filter((c) => c.severity === "low").map((c) => `[${c.checkId}] ${c.recommendation ?? c.description}`),
    },
    wastedSpendInsights: `${failed.filter((c) => c.category.includes("Wasted")).length} wasted spend checks failed. Review negative keyword coverage and search term relevance to reduce budget waste.`,
    estimatedImpact: `Implementing the ${failed.length} recommended fixes could improve the account score from ${input.score} to an estimated ${Math.min(100, input.score + failed.length * 2)}/100.`,
    generatedAt: new Date().toISOString(),
  };
}
