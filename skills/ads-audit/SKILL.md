---
name: ads-audit
description: >
  SterlingX full multi-platform paid advertising audit with parallel subagent
  delegation. Analyzes Google Ads, Meta Ads, LinkedIn Ads, TikTok Ads, and
  Microsoft Ads accounts. Includes 15 SterlingX agency custom checks (SX01-SX15).
  Generates health score per platform and aggregate score. Use when user says
  "audit", "full ad check", "analyze my ads", "account health check", or
  "PPC audit".
---

# SterlingX Full Multi-Platform Ads Audit

## Process

1. **Collect account data** — request exports, screenshots, or API access
2. **Detect business type** — analyze account signals per ads orchestrator
3. **Identify active platforms** — determine which platforms are in use
4. **Delegate to subagents** (if available, otherwise run inline sequentially):
   - `audit-google` — Conversion tracking, wasted spend, structure, keywords, ads, settings (G01-G74)
   - `audit-meta` — Pixel/CAPI health, creative fatigue, structure, audience (M01-M46)
   - `audit-creative` — LinkedIn, TikTok, Microsoft creative checks + cross-platform synthesis
   - `audit-tracking` — LinkedIn, TikTok, Microsoft tracking + cross-platform tracking health
   - `audit-budget` — LinkedIn, TikTok, Microsoft budget/bidding + cross-platform allocation
   - `audit-compliance` — All-platform compliance, settings, performance benchmarks
5. **SterlingX checks** — run SX01-SX15 from `ads/references/sterlingx-checks.md`
6. **Score** — calculate per-platform and aggregate Ads Health Score (0-100) including SX category
7. **Report** — generate SterlingX-branded prioritized action plan with Quick Wins

## Data Collection

Ask the user for available data. Accept any combination:
- Google Ads: account export, Change History, Search Terms Report
- Meta Ads: Ads Manager export, Events Manager screenshot, EMQ scores
- LinkedIn Ads: Campaign Manager export, Insight Tag status
- TikTok Ads: Ads Manager export, Pixel/Events API status
- Microsoft Ads: account export, UET tag status, import validation results

If no exports available, audit from screenshots or manual data entry.

## Scoring

Read `ads/references/scoring-system.md` for full algorithm.

### Per-Platform Weights

| Platform | Category Weights |
|----------|-----------------|
| Google | Conversion 25%, Waste 20%, Structure 15%, Keywords 15%, Ads 15%, Settings 10% |
| Meta | Pixel/CAPI 30%, Creative 30%, Structure 20%, Audience 20% |
| LinkedIn | Tech 25%, Audience 25%, Creative 20%, Lead Gen 15%, Budget 15% |
| TikTok | Creative 30%, Tech 25%, Bidding 20%, Structure 15%, Performance 10% |
| Microsoft | Tech 25%, Syndication 20%, Structure 20%, Creative 20%, Settings 15% |
| **SterlingX** | **Governance 33%, Reporting 33%, Operations 34%** |

### Aggregate Score

```
Platform_Aggregate = Sum(Platform_Score x Platform_Budget_Share)
SX_Score = Weighted average of SX01-SX15 checks
Final_Score = (Platform_Aggregate x 0.85) + (SX_Score x 0.15)
Grade: A (90-100), B (75-89), C (60-74), D (40-59), F (<40)
```

## Output Files

- `SX-ADS-AUDIT-REPORT.md` — SterlingX branded comprehensive multi-platform findings
- `SX-ADS-ACTION-PLAN.md` — Prioritized recommendations (Critical > High > Medium > Low)
- `SX-ADS-QUICK-WINS.md` — Items fixable in <15 minutes with high impact

## Report Structure

### SterlingX Branded Header

All reports must begin with the following branded header:

```markdown
---
# SterlingX Paid Ads Audit Report
**Prepared by:** SterlingX Digital Agency
**Date:** [YYYY-MM-DD]
**Client:** [Client Name]
**Audit Period:** [Start Date] — [End Date]
**Report ID:** SX-ADS-[YYYYMMDD]-[SEQ]
---
```

### Executive Summary
- Aggregate Ads Health Score (0-100) with grade
- Per-platform scores
- Business type detected
- Active platforms identified
- Top 5 critical issues across all platforms
- Top 5 quick wins across all platforms
- **SterlingX Recommendation Summary** — 3-sentence agency recommendation

### Per-Platform Sections
Each platform section includes:
- Platform Health Score with grade
- Category breakdown with pass/warning/fail per check
- Platform-specific Quick Wins
- Detailed findings with remediation steps

### Cross-Platform Analysis
- Budget allocation assessment (actual vs recommended)
- Tracking consistency (are all platforms tracking the same events?)
- Creative consistency (is messaging aligned across platforms?)
- Attribution overlap (are platforms double-counting conversions?)

### Strategic Recommendations
- Platform prioritization based on business type
- Budget reallocation recommendations
- Scaling opportunities (platforms/campaigns ready to scale)
- Kill list (campaigns/ad groups to pause immediately)

### SterlingX Next Steps

Every report must close with:
```markdown
---
## Next Steps — SterlingX Engagement

Based on this audit, SterlingX recommends the following engagement path:

1. **Immediate (Week 1):** Execute all Quick Wins identified above
2. **Short-term (Weeks 2-4):** Address Critical and High priority items
3. **Ongoing:** Monthly performance monitoring and optimization

For implementation support, contact your SterlingX account team.

*This audit was generated using SterlingX Paid Ads Audit tooling.*
*Methodology: 190 checks across 6 platforms with weighted severity scoring.*
---
```

## Priority Definitions

- **Critical**: Revenue/data loss risk (fix immediately)
- **High**: Significant performance drag (fix within 7 days)
- **Medium**: Optimization opportunity (fix within 30 days)
- **Low**: Best practice, minor impact (backlog)

## Quick Wins Criteria

```
IF severity == "Critical" OR severity == "High"
AND estimated_fix_time < 15 minutes
THEN flag as Quick Win
SORT BY (severity_multiplier x estimated_impact) DESC
```
