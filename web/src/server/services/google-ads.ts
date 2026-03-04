import { refreshAccessToken } from "@/lib/google-oauth";

const GOOGLE_ADS_API_VERSION = "v20";
const BASE_URL = `https://googleads.googleapis.com/${GOOGLE_ADS_API_VERSION}`;

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type GoogleAdsRow = Record<string, any>;

export class GoogleAdsService {
  private accessToken: string;
  private developerToken: string;

  constructor(accessToken: string) {
    this.accessToken = accessToken;
    this.developerToken = process.env.GOOGLE_ADS_DEVELOPER_TOKEN!;
  }

  static async fromRefreshToken(refreshToken: string): Promise<GoogleAdsService> {
    const credentials = await refreshAccessToken(refreshToken);
    return new GoogleAdsService(credentials.access_token!);
  }

  private headers(includeLoginCustomerId = true): HeadersInit {
    const h: HeadersInit = {
      Authorization: `Bearer ${this.accessToken}`,
      "developer-token": this.developerToken,
      "Content-Type": "application/json",
    };
    if (includeLoginCustomerId && process.env.GOOGLE_ADS_LOGIN_CUSTOMER_ID) {
      h["login-customer-id"] = process.env.GOOGLE_ADS_LOGIN_CUSTOMER_ID;
    }
    return h;
  }

  async listAccessibleCustomers(): Promise<string[]> {
    // This endpoint must NOT include login-customer-id
    const res = await fetch(`${BASE_URL}/customers:listAccessibleCustomers`, {
      headers: this.headers(false),
    });
    if (!res.ok) {
      const body = await res.text();
      throw new Error(`listAccessibleCustomers failed: ${res.status} ${body}`);
    }
    const data = await res.json();
    return (data.resourceNames as string[]).map((r: string) =>
      r.replace("customers/", "")
    );
  }

  async getCustomerName(customerId: string): Promise<string> {
    try {
      const rows = await this.query(customerId, `
        SELECT customer.descriptive_name
        FROM customer
        LIMIT 1
      `);
      return rows[0]?.customer?.descriptiveName ?? `Account ${customerId}`;
    } catch {
      return `Account ${customerId}`;
    }
  }

  async query(customerId: string, gaql: string): Promise<GoogleAdsRow[]> {
    const res = await fetch(
      `${BASE_URL}/customers/${customerId}/googleAds:searchStream`,
      {
        method: "POST",
        headers: this.headers(),
        body: JSON.stringify({ query: gaql }),
      }
    );
    if (!res.ok) {
      const body = await res.text();
      throw new Error(`GAQL query failed: ${res.status} ${body}`);
    }
    const data = await res.json();
    const results: GoogleAdsRow[] = [];
    for (const batch of data) {
      if (batch.results) {
        results.push(...batch.results);
      }
    }
    return results;
  }

  /**
   * List child accounts under an MCC manager account.
   * Returns both managers and non-managers so the UI can show the tree.
   */
  async listMccChildren(mccCustomerId: string): Promise<{
    id: string;
    name: string;
    isManager: boolean;
    currencyCode: string;
    status: string;
  }[]> {
    const rows = await this.query(mccCustomerId, `
      SELECT
        customer_client.id,
        customer_client.descriptive_name,
        customer_client.manager,
        customer_client.currency_code,
        customer_client.status
      FROM customer_client
      WHERE customer_client.status = 'ENABLED'
      ORDER BY customer_client.descriptive_name
    `);
    return rows.map((r) => ({
      id: String(r.customerClient?.id ?? ""),
      name: r.customerClient?.descriptiveName ?? "Unnamed",
      isManager: !!r.customerClient?.manager,
      currencyCode: r.customerClient?.currencyCode ?? "",
      status: r.customerClient?.status ?? "",
    }));
  }

  // ─── Data Fetchers for Audit ───────────────────────────────

  async fetchAccountOverview(customerId: string) {
    return this.query(customerId, `
      SELECT
        customer.descriptive_name,
        customer.currency_code,
        customer.time_zone,
        customer.auto_tagging_enabled,
        customer.conversion_tracking_setting.conversion_tracking_id,
        customer.conversion_tracking_setting.cross_account_conversion_tracking_id
      FROM customer
      LIMIT 1
    `);
  }

  async fetchCampaigns(customerId: string) {
    return this.query(customerId, `
      SELECT
        campaign.id,
        campaign.name,
        campaign.status,
        campaign.advertising_channel_type,
        campaign.advertising_channel_sub_type,
        campaign.bidding_strategy_type,
        campaign.campaign_budget,
        campaign.target_cpa.target_cpa_micros,
        campaign.target_roas.target_roas,
        campaign.start_date,
        campaign.labels,
        campaign.network_settings.target_search_network,
        campaign.network_settings.target_content_network,
        campaign.geo_target_type_setting.positive_geo_target_type,
        campaign_budget.amount_micros,
        campaign_budget.delivery_method,
        campaign_budget.status,
        metrics.impressions,
        metrics.clicks,
        metrics.cost_micros,
        metrics.conversions,
        metrics.conversions_value,
        metrics.ctr,
        metrics.average_cpc,
        metrics.cost_per_conversion,
        campaign.tracking_url_template
      FROM campaign
      WHERE campaign.status = 'ENABLED'
        AND segments.date DURING LAST_30_DAYS
    `);
  }

  async fetchAdGroups(customerId: string) {
    return this.query(customerId, `
      SELECT
        ad_group.id,
        ad_group.name,
        ad_group.status,
        ad_group.type,
        campaign.id,
        campaign.name,
        campaign.advertising_channel_type,
        metrics.impressions,
        metrics.clicks,
        metrics.cost_micros,
        metrics.conversions,
        metrics.ctr,
        metrics.average_cpc
      FROM ad_group
      WHERE ad_group.status != 'REMOVED'
        AND campaign.status = 'ENABLED'
        AND segments.date DURING LAST_30_DAYS
    `);
  }

  async fetchKeywords(customerId: string) {
    return this.query(customerId, `
      SELECT
        ad_group_criterion.keyword.text,
        ad_group_criterion.keyword.match_type,
        ad_group_criterion.quality_info.quality_score,
        ad_group_criterion.quality_info.creative_quality_score,
        ad_group_criterion.quality_info.search_predicted_ctr,
        ad_group_criterion.quality_info.post_click_quality_score,
        ad_group_criterion.status,
        ad_group.id,
        ad_group.name,
        ad_group.status,
        campaign.id,
        campaign.name,
        campaign.bidding_strategy_type,
        metrics.impressions,
        metrics.clicks,
        metrics.cost_micros,
        metrics.conversions,
        metrics.average_cpc
      FROM keyword_view
      WHERE ad_group_criterion.status != 'REMOVED'
        AND ad_group.status != 'REMOVED'
        AND campaign.status = 'ENABLED'
    `);
  }

  async fetchSearchTerms(customerId: string) {
    // search_term_view is restrictive — it does NOT support campaign.status,
    // ad_group.status, or search_term_view.status in either SELECT or WHERE.
    // Only search_term_view fields, basic campaign/ad_group identifiers,
    // and metrics are allowed. All filtering done in code.
    const rows = await this.query(customerId, `
      SELECT
        search_term_view.search_term,
        ad_group.id,
        ad_group.name,
        campaign.id,
        campaign.name,
        metrics.impressions,
        metrics.clicks,
        metrics.cost_micros,
        metrics.conversions
      FROM search_term_view
      WHERE segments.date DURING LAST_90_DAYS
      LIMIT 2000
    `);
    // Return top 500 by cost
    return rows
      .sort((a: GoogleAdsRow, b: GoogleAdsRow) =>
        Number(b.metrics?.costMicros ?? 0) - Number(a.metrics?.costMicros ?? 0)
      )
      .slice(0, 500);
  }

  async fetchAds(customerId: string) {
    return this.query(customerId, `
      SELECT
        ad_group_ad.ad.id,
        ad_group_ad.ad.type,
        ad_group_ad.ad.responsive_search_ad.headlines,
        ad_group_ad.ad.responsive_search_ad.descriptions,
        ad_group_ad.ad_strength,
        ad_group_ad.status,
        ad_group.id,
        ad_group.name,
        ad_group.status,
        campaign.id,
        campaign.advertising_channel_type,
        metrics.impressions,
        metrics.clicks,
        metrics.ctr,
        metrics.conversions,
        ad_group_ad.ad.final_urls,
        ad_group_ad.policy_summary.approval_status
      FROM ad_group_ad
      WHERE ad_group_ad.status != 'REMOVED'
        AND ad_group.status != 'REMOVED'
        AND campaign.status = 'ENABLED'
    `);
  }

  async fetchConversions(customerId: string) {
    return this.query(customerId, `
      SELECT
        conversion_action.id,
        conversion_action.name,
        conversion_action.type,
        conversion_action.status,
        conversion_action.category,
        conversion_action.include_in_conversions_metric,
        conversion_action.tag_snippets,
        conversion_action.counting_type,
        conversion_action.click_through_lookback_window_days,
        conversion_action.view_through_lookback_window_days,
        conversion_action.attribution_model_settings.attribution_model
      FROM conversion_action
      WHERE conversion_action.status != 'REMOVED'
    `);
  }

  async fetchNegativeKeywords(customerId: string) {
    return this.query(customerId, `
      SELECT
        campaign_criterion.negative,
        campaign_criterion.keyword.text,
        campaign_criterion.keyword.match_type,
        campaign.id,
        campaign.name
      FROM campaign_criterion
      WHERE campaign_criterion.negative = TRUE
        AND campaign_criterion.type = 'KEYWORD'
        AND campaign.status = 'ENABLED'
    `);
  }

  /** Fetch shared negative keyword lists and their campaign assignments */
  async fetchSharedNegativeLists(customerId: string) {
    // Get all shared sets of type NEGATIVE_KEYWORDS
    const sharedSets = await this.query(customerId, `
      SELECT
        shared_set.id,
        shared_set.name,
        shared_set.type,
        shared_set.status,
        shared_set.member_count
      FROM shared_set
      WHERE shared_set.type = 'NEGATIVE_KEYWORDS'
        AND shared_set.status = 'ENABLED'
    `);

    // Get which campaigns each shared set is applied to
    const campaignSharedSets = await this.query(customerId, `
      SELECT
        shared_set.id,
        shared_set.name,
        campaign.id,
        campaign.name,
        campaign.status,
        campaign_shared_set.status
      FROM campaign_shared_set
      WHERE shared_set.type = 'NEGATIVE_KEYWORDS'
        AND campaign_shared_set.status = 'ENABLED'
        AND campaign.status = 'ENABLED'
    `);

    return { sharedSets, campaignSharedSets };
  }

  async fetchAssetGroups(customerId: string) {
    try {
      return await this.query(customerId, `
        SELECT
          asset_group.id,
          asset_group.name,
          asset_group.status,
          campaign.id,
          campaign.name,
          asset_group.ad_strength
        FROM asset_group
        WHERE campaign.advertising_channel_type = 'PERFORMANCE_MAX'
          AND campaign.status = 'ENABLED'
      `);
    } catch {
      return []; // No PMax campaigns
    }
  }

  async fetchChangeHistory(customerId: string) {
    return this.query(customerId, `
      SELECT
        change_event.change_date_time,
        change_event.change_resource_type,
        change_event.changed_fields,
        change_event.client_type,
        change_event.user_email
      FROM change_event
      WHERE change_event.change_date_time DURING LAST_14_DAYS
      ORDER BY change_event.change_date_time DESC
      LIMIT 100
    `);
  }

  // ─── New Data Fetchers for Automated Checks ───────────────

  async fetchExtensions(customerId: string) {
    return this.query(customerId, `
      SELECT
        asset.id,
        asset.type,
        asset.name,
        asset.sitelink_asset.description1,
        asset.sitelink_asset.description2,
        asset.sitelink_asset.link_text,
        asset.callout_asset.callout_text,
        asset.structured_snippet_asset.header,
        asset.structured_snippet_asset.values,
        asset.call_asset.phone_number,
        asset.call_asset.ad_schedule_targets,
        asset.image_asset.full_size.url,
        asset.lead_form_asset.business_name,
        customer_asset.status,
        customer_asset.field_type
      FROM customer_asset
      WHERE customer_asset.status != 'REMOVED'
    `);
  }

  async fetchAdScheduleCriteria(customerId: string) {
    return this.query(customerId, `
      SELECT
        campaign_criterion.ad_schedule.day_of_week,
        campaign_criterion.ad_schedule.start_hour,
        campaign_criterion.ad_schedule.end_hour,
        campaign_criterion.ad_schedule.start_minute,
        campaign_criterion.ad_schedule.end_minute,
        campaign.id,
        campaign.name
      FROM campaign_criterion
      WHERE campaign_criterion.type = 'AD_SCHEDULE'
        AND campaign.status = 'ENABLED'
    `);
  }

  async fetchLanguageCriteria(customerId: string) {
    return this.query(customerId, `
      SELECT
        campaign_criterion.language.language_constant,
        campaign.id,
        campaign.name
      FROM campaign_criterion
      WHERE campaign_criterion.type = 'LANGUAGE'
        AND campaign.status = 'ENABLED'
    `);
  }

  async fetchAudienceCriteria(customerId: string) {
    return this.query(customerId, `
      SELECT
        campaign_criterion.type,
        campaign_criterion.user_list.user_list,
        campaign.id,
        campaign.name
      FROM campaign_criterion
      WHERE campaign_criterion.type IN ('USER_LIST', 'USER_INTEREST', 'CUSTOM_AUDIENCE')
        AND campaign.status = 'ENABLED'
    `);
  }

  async fetchUserLists(customerId: string) {
    return this.query(customerId, `
      SELECT
        user_list.id,
        user_list.name,
        user_list.type,
        user_list.membership_status,
        user_list.size_for_search,
        user_list.size_for_display
      FROM user_list
    `);
  }

  async fetchAssetGroupAssets(customerId: string) {
    return this.query(customerId, `
      SELECT
        asset_group_asset.field_type,
        asset_group_asset.status,
        asset_group.id,
        asset_group.name,
        campaign.id
      FROM asset_group_asset
      WHERE campaign.advertising_channel_type = 'PERFORMANCE_MAX'
        AND campaign.status = 'ENABLED'
        AND asset_group.status != 'REMOVED'
        AND asset_group_asset.status != 'REMOVED'
    `);
  }

  async fetchAssetGroupSignals(customerId: string) {
    return this.query(customerId, `
      SELECT
        asset_group_signal.audience_signal,
        asset_group.id,
        asset_group.name,
        campaign.id
      FROM asset_group_signal
      WHERE campaign.advertising_channel_type = 'PERFORMANCE_MAX'
        AND campaign.status = 'ENABLED'
    `);
  }

  /** Fetch all data needed for a full 111-check audit */
  async fetchAllAuditData(customerId: string) {
    /** Track which fetches failed and why — surfaced in audit report */
    const fetchErrors: Record<string, string> = {};

    const safe = async <T>(label: string, fn: () => Promise<T>): Promise<T | []> => {
      try {
        return await fn();
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        console.warn(`[fetchAllAuditData] ${label} failed for ${customerId}:`, msg);
        fetchErrors[label] = msg;
        return [];
      }
    };

    // Phase 1: All GAQL queries in parallel
    const [
      account,
      campaigns,
      adGroups,
      keywords,
      searchTerms,
      ads,
      conversions,
      negativeKeywords,
      assetGroups,
      changeHistory,
      extensions,
      adSchedule,
      languageCriteria,
      audienceCriteria,
      userLists,
      assetGroupAssets,
      assetGroupSignals,
      sharedNegativeLists,
    ] = await Promise.all([
      safe("accountOverview", () => this.fetchAccountOverview(customerId)),
      safe("campaigns", () => this.fetchCampaigns(customerId)),
      safe("adGroups", () => this.fetchAdGroups(customerId)),
      safe("keywords", () => this.fetchKeywords(customerId)),
      safe("searchTerms", () => this.fetchSearchTerms(customerId)),
      safe("ads", () => this.fetchAds(customerId)),
      safe("conversions", () => this.fetchConversions(customerId)),
      safe("negativeKeywords", () => this.fetchNegativeKeywords(customerId)),
      safe("assetGroups", () => this.fetchAssetGroups(customerId)),
      safe("changeHistory", () => this.fetchChangeHistory(customerId)),
      safe("extensions", () => this.fetchExtensions(customerId)),
      safe("adSchedule", () => this.fetchAdScheduleCriteria(customerId)),
      safe("languageCriteria", () => this.fetchLanguageCriteria(customerId)),
      safe("audienceCriteria", () => this.fetchAudienceCriteria(customerId)),
      safe("userLists", () => this.fetchUserLists(customerId)),
      safe("assetGroupAssets", () => this.fetchAssetGroupAssets(customerId)),
      safe("assetGroupSignals", () => this.fetchAssetGroupSignals(customerId)),
      safe("sharedNegativeLists", () => this.fetchSharedNegativeLists(customerId)),
    ]);

    // Phase 2: Landing page analysis (depends on ads data for URLs)
    const adsArray = Array.isArray(ads) ? ads : [];
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const finalUrls = [...new Set(
      adsArray
        .flatMap((a: any) => a.adGroupAd?.ad?.finalUrls ?? [])
        .filter(Boolean) as string[]
    )].slice(0, 5);

    let landingPageAnalysis: LandingPageAnalysis[] = [];
    if (finalUrls.length > 0) {
      try {
        landingPageAnalysis = await analyzeLandingPages(finalUrls);
      } catch (err) {
        console.warn(`[fetchAllAuditData] landingPageAnalysis failed:`, err instanceof Error ? err.message : err);
      }
    }

    return {
      account,
      campaigns,
      adGroups,
      keywords,
      searchTerms,
      ads,
      conversions,
      negativeKeywords,
      assetGroups,
      changeHistory,
      extensions,
      adSchedule,
      languageCriteria,
      audienceCriteria,
      userLists,
      assetGroupAssets,
      assetGroupSignals,
      sharedNegativeLists,
      landingPageAnalysis,
      fetchErrors,
      fetchedAt: new Date().toISOString(),
    };
  }
}

// ─── Landing Page Analysis (Tier 3) ─────────────────────────

export interface LandingPageAnalysis {
  url: string;
  hasGtag: boolean;
  hasGTM: boolean;
  gtmContainerId?: string;
  hasSchemaMarkup: boolean;
  schemaTypes: string[];
  title: string;
  h1: string;
  pageSpeedScore?: number;
  lcpMs?: number;
  error?: string;
}

export async function analyzeLandingPages(urls: string[]): Promise<LandingPageAnalysis[]> {
  const unique = [...new Set(urls)].slice(0, 5);

  const results = await Promise.allSettled(
    unique.map(async (url): Promise<LandingPageAnalysis> => {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 8000);
      try {
        const res = await fetch(url, {
          signal: controller.signal,
          headers: { "User-Agent": "Mozilla/5.0 (compatible; SterlingX-Audit/1.0)" },
          redirect: "follow",
        });
        const html = await res.text();
        clearTimeout(timeout);

        const hasGtag = /gtag\(|googletagmanager\.com\/gtag/i.test(html);
        const hasGTM = /googletagmanager\.com\/gtm\.js/i.test(html);
        const gtmMatch = html.match(/GTM-[A-Z0-9]+/);

        // JSON-LD schema
        const jsonLdBlocks = html.match(/<script[^>]*type\s*=\s*["']application\/ld\+json["'][^>]*>[\s\S]*?<\/script>/gi) ?? [];
        const schemaTypes: string[] = [];
        for (const block of jsonLdBlocks) {
          try {
            const json = block.replace(/<script[^>]*>/i, "").replace(/<\/script>/i, "");
            const parsed = JSON.parse(json);
            const t = parsed["@type"];
            if (t) schemaTypes.push(Array.isArray(t) ? t.join(", ") : String(t));
          } catch { /* skip malformed JSON-LD */ }
        }
        const hasMicrodata = /itemtype=|itemprop=/i.test(html);

        const titleMatch = html.match(/<title[^>]*>([\s\S]*?)<\/title>/i);
        const title = titleMatch ? titleMatch[1].replace(/\s+/g, " ").trim() : "";

        const h1Match = html.match(/<h1[^>]*>([\s\S]*?)<\/h1>/i);
        const h1 = h1Match ? h1Match[1].replace(/<[^>]*>/g, "").replace(/\s+/g, " ").trim() : "";

        // PageSpeed Insights API (free, no key needed for low volume)
        let pageSpeedScore: number | undefined;
        let lcpMs: number | undefined;
        try {
          const psController = new AbortController();
          const psTimeout = setTimeout(() => psController.abort(), 15000);
          const psUrl = `https://www.googleapis.com/pagespeedonline/v5/runPagespeed?url=${encodeURIComponent(url)}&strategy=mobile&category=performance`;
          const psRes = await fetch(psUrl, { signal: psController.signal });
          clearTimeout(psTimeout);
          if (psRes.ok) {
            const psData = await psRes.json();
            const score = psData.lighthouseResult?.categories?.performance?.score;
            if (score != null) pageSpeedScore = Math.round(score * 100);
            const lcp = psData.lighthouseResult?.audits?.["largest-contentful-paint"]?.numericValue;
            if (lcp != null) lcpMs = Math.round(lcp);
          }
        } catch { /* PageSpeed timeout/failure is non-fatal */ }

        return {
          url, hasGtag, hasGTM,
          gtmContainerId: gtmMatch?.[0],
          hasSchemaMarkup: schemaTypes.length > 0 || hasMicrodata,
          schemaTypes, title, h1,
          pageSpeedScore, lcpMs,
        };
      } catch (err) {
        clearTimeout(timeout);
        return {
          url, hasGtag: false, hasGTM: false,
          hasSchemaMarkup: false, schemaTypes: [],
          title: "", h1: "",
          error: err instanceof Error ? err.message : "Fetch failed",
        };
      }
    })
  );

  return results.map((r) =>
    r.status === "fulfilled"
      ? r.value
      : { url: "", hasGtag: false, hasGTM: false, hasSchemaMarkup: false, schemaTypes: [], title: "", h1: "", error: "Analysis failed" }
  );
}
