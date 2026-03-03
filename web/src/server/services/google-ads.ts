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
        metrics.cost_per_conversion
      FROM campaign
      WHERE campaign.status != 'REMOVED'
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
        AND campaign.status != 'REMOVED'
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
        campaign.id,
        campaign.bidding_strategy_type,
        metrics.impressions,
        metrics.clicks,
        metrics.cost_micros,
        metrics.conversions,
        metrics.average_cpc
      FROM keyword_view
      WHERE ad_group_criterion.status != 'REMOVED'
        AND campaign.status != 'REMOVED'
        AND segments.date DURING LAST_30_DAYS
    `);
  }

  async fetchSearchTerms(customerId: string) {
    return this.query(customerId, `
      SELECT
        search_term_view.search_term,
        search_term_view.status,
        campaign.id,
        campaign.name,
        metrics.impressions,
        metrics.clicks,
        metrics.cost_micros,
        metrics.conversions
      FROM search_term_view
      WHERE segments.date DURING LAST_30_DAYS
      ORDER BY metrics.cost_micros DESC
      LIMIT 500
    `);
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
        campaign.id,
        campaign.advertising_channel_type,
        metrics.impressions,
        metrics.clicks,
        metrics.ctr,
        metrics.conversions
      FROM ad_group_ad
      WHERE ad_group_ad.status != 'REMOVED'
        AND campaign.status != 'REMOVED'
        AND segments.date DURING LAST_30_DAYS
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
        conversion_action.tag_snippets
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
    `);
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
          AND campaign.status != 'REMOVED'
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

  /** Fetch all data needed for a full 74-check audit */
  async fetchAllAuditData(customerId: string) {
    const safe = async <T>(label: string, fn: () => Promise<T>): Promise<T | []> => {
      try {
        return await fn();
      } catch (err) {
        console.warn(`[fetchAllAuditData] ${label} failed for ${customerId}:`, err instanceof Error ? err.message : err);
        return [];
      }
    };

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
    ]);

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
      fetchedAt: new Date().toISOString(),
    };
  }
}
