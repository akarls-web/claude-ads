# SterlingX Agency Custom Audit Checks

Additional audit checks specific to SterlingX agency standards.
These supplement the base 190 checks with agency best practices.

## SterlingX Custom Checks (SX01-SX15)

### SX — Cross-Platform Governance (5 checks)

| Check | Description | Severity | Pass | Warning | Fail |
|-------|------------|----------|------|---------|------|
| SX01 | Unified UTM taxonomy across all platforms | High | Consistent naming convention | Minor inconsistencies | No UTM standards |
| SX02 | Cross-platform attribution window alignment | Critical | Windows documented and aligned | Partial alignment | Conflicting windows |
| SX03 | Shared audience suppression (customer lists) | Medium | Lists synced across platforms | Partially synced | No suppression |
| SX04 | Naming convention compliance (campaign/ad group/ad) | Medium | Follows SterlingX naming standard | Partial compliance | No naming convention |
| SX05 | Change log / revision history maintained | Low | Full changelog with dates | Partial records | No documentation |

### SterlingX Naming Convention Standard

All campaigns must follow this naming structure:
```
[Platform]_[Objective]_[Audience]_[Geo]_[Date]
```
Examples:
- `GOOG_SEARCH_BRAND_US_2026Q1`
- `META_CONV_PROSP-LAL1_US_2026Q1`
- `LNKD_LEADGEN_ABM-T1_US-ENTERPRISE_2026Q1`

### SX — Client Reporting Readiness (5 checks)

| Check | Description | Severity | Pass | Warning | Fail |
|-------|------------|----------|------|---------|------|
| SX06 | GA4 / analytics integration verified | High | GA4 connected, events flowing | Partial integration | No analytics link |
| SX07 | Offline conversion import pipeline | Medium | CRM pipeline active | Manual uploads only | No offline data |
| SX08 | Automated reporting dashboards configured | Medium | Looker Studio / live dashboard | Manual reporting | No client dashboard |
| SX09 | MER (Marketing Efficiency Ratio) trackable | High | Blended ROAS / MER calculated | Platform ROAS only | No ROAS tracking |
| SX10 | Monthly pacing alerts configured | Medium | Automated pacing alerts | Manual pacing checks | No pacing monitoring |

### SX — Agency Operations (5 checks)

| Check | Description | Severity | Pass | Warning | Fail |
|-------|------------|----------|------|---------|------|
| SX11 | Account access audit (MCC / BM permissions) | Critical | Proper role-based access | Some shared logins | Owner access missing |
| SX12 | Billing ownership verified (client-owned) | High | Client owns billing | Agency billing (documented) | Billing ownership unclear |
| SX13 | Creative asset library organized | Medium | Tagged, dated, versioned | Partially organized | No asset management |
| SX14 | A/B test velocity (≥2 tests/month active) | Medium | ≥2 tests running | 1 test running | No active tests |
| SX15 | Competitor monitoring cadence | Low | Monthly competitive review | Quarterly review | No competitive tracking |

## Scoring Integration

SterlingX custom checks are scored as a separate category:

| Category | Weight in Aggregate |
|----------|-------------------|
| SX Governance (SX01-SX05) | 5% |
| SX Reporting (SX06-SX10) | 5% |
| SX Operations (SX11-SX15) | 5% |

The 15% allocation for SX checks is carved from a proportional reduction across
existing platform weights (each platform category reduced by ~2.5% to accommodate).

### Severity Multipliers (same as base scoring)

| Severity | Multiplier |
|----------|-----------|
| Critical | 5.0x |
| High | 3.0x |
| Medium | 1.5x |
| Low | 1.0x |

## When to Apply

- **Always apply** SX01-SX05 (Governance) on every audit
- **Apply SX06-SX10** (Reporting) when client has analytics / CRM
- **Apply SX11-SX15** (Operations) when auditing agency-managed accounts
- Skip Operations checks for direct advertiser self-audits
