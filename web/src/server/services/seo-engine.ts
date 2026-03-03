/**
 * SterlingX SEO Audit Engine — Multi-Page Site Crawler
 *
 * Ported from claude-seo (https://github.com/AgriciDaniel/claude-seo)
 * into the SterlingX multi-audit platform.
 *
 * Crawl protocol:
 *   1. Fetch homepage
 *   2. Extract internal links from <header>, <nav>, <footer> (primary nav pages)
 *   3. Extract all internal links on the homepage
 *   4. Fetch each nav/footer page and extract their internal links
 *   5. Deduplicate all discovered URLs, cap at MAX_PAGES
 *   6. Run 65+ checks on each page individually
 *   7. Aggregate into site-level report with page-by-page drill-down
 *
 * 7 categories, ~65 automated checks per page:
 *   • Technical SEO     (25%) — robots.txt, sitemap, HTTPS, security headers, AI crawlers
 *   • Content Quality   (25%) — E-E-A-T signals, word count, freshness, internal links
 *   • On-Page SEO       (20%) — title, meta description, headings, canonical, OG/Twitter
 *   • Schema            (10%) — JSON-LD detection, validation, deprecated types
 *   • Performance (CWV) (10%) — LCP hints, CLS hints, render-blocking, lazy loading
 *   • Images            (5%)  — alt text, dimensions, format, lazy loading
 *   • AI Search Ready   (5%)  — citability, structure, author signals, llms.txt
 */

import * as cheerio from "cheerio";
import type {
  AuditCheckResult,
  AuditReport,
  CheckResult,
  Severity,
  Grade,
} from "./audit-engine";

// Re-use the shared types from the Google Ads engine
export type { AuditCheckResult, AuditReport };

// ─── Multi-Page Site Report Types ────────────────────────

/** Per-page results with all checks and scores */
export interface PageReport {
  url: string;
  label: string;           // e.g. "Homepage", "About Us", "/contact"
  source: "homepage" | "header" | "footer" | "nav" | "internal-link";
  score: number;
  grade: Grade;
  totalChecks: number;
  passCount: number;
  warningCount: number;
  failCount: number;
  skippedCount: number;
  manualCount: number;
  checks: AuditCheckResult[];
  categoryScores: Record<string, number>;
  fetchStatus: number;
  responseTimeMs: number;
  error?: string;
}

/** Site-wide opportunity — aggregated from cross-page issues */
export interface SiteOpportunity {
  category: string;
  description: string;
  severity: Severity;
  affectedPages: string[];   // URLs
  affectedPageCount: number;
  recommendation: string;
  isQuickWin: boolean;
  estimatedFixMinutes: number;
}

/** Full site-level SEO report */
export interface SeoSiteReport {
  /** Site-level aggregate score (weighted average of page scores) */
  score: number;
  grade: Grade;
  /** Total pages crawled */
  pagesCrawled: number;
  /** Total checks across all pages */
  totalChecks: number;
  passCount: number;
  warningCount: number;
  failCount: number;
  skippedCount: number;
  manualCount: number;
  /** Site-wide category scores (aggregated from all pages) */
  categoryScores: Record<string, number>;
  /** Biggest opportunities per technical section */
  topOpportunities: SiteOpportunity[];
  /** Quick wins (high-impact + low-effort fixes across the site) */
  quickWins: SiteOpportunity[];
  /** Action plan items prioritized by impact */
  actionPlan: string[];
  /** Per-page drill-down */
  pages: PageReport[];
  /** Site-level summary text */
  summary: string;
  /** Flat list of all checks (for backward compat with AuditReport) */
  checks: AuditCheckResult[];
  /** Quick win checks (backward compat) */
  quickWinChecks: AuditCheckResult[];
}

/** Max pages to crawl per audit (avoids runaway on huge sites) */
const MAX_PAGES = 30;

/** Concurrency for page fetching */
const FETCH_CONCURRENCY = 5;

// ─── Scoring Constants ───────────────────────────────────

const SEVERITY_MULTIPLIER: Record<Severity, number> = {
  critical: 5.0,
  high: 3.0,
  medium: 1.5,
  low: 1.0,
};

const CATEGORY_WEIGHTS: Record<string, number> = {
  "Technical SEO": 0.25,
  "Content Quality": 0.25,
  "On-Page SEO": 0.20,
  "Schema & Structured Data": 0.10,
  "Performance": 0.10,
  "Images": 0.05,
  "AI Search Readiness": 0.05,
};

// ─── Page fetcher ────────────────────────────────────────

const FETCH_HEADERS: Record<string, string> = {
  "User-Agent":
    "Mozilla/5.0 (compatible; SterlingX-SEO/1.0; +https://sterlingx.co)",
  Accept:
    "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
  "Accept-Language": "en-US,en;q=0.5",
};

interface FetchedPage {
  url: string;
  finalUrl: string;
  status: number;
  html: string;
  headers: Record<string, string>;
  redirectChain: string[];
  responseTimeMs: number;
  error?: string;
}

async function fetchPage(
  url: string,
  timeout = 20_000
): Promise<FetchedPage> {
  const start = Date.now();
  const result: FetchedPage = {
    url,
    finalUrl: url,
    status: 0,
    html: "",
    headers: {},
    redirectChain: [],
    responseTimeMs: 0,
  };

  try {
    const resp = await fetch(url, {
      headers: FETCH_HEADERS,
      redirect: "follow",
      signal: AbortSignal.timeout(timeout),
    });
    result.finalUrl = resp.url;
    result.status = resp.status;
    result.html = await resp.text();
    resp.headers.forEach((v, k) => {
      result.headers[k.toLowerCase()] = v;
    });
  } catch (err) {
    result.error =
      err instanceof Error ? err.message : "Fetch failed";
  }
  result.responseTimeMs = Date.now() - start;
  return result;
}

async function fetchText(
  url: string,
  timeout = 10_000
): Promise<{ text: string; status: number; error?: string }> {
  try {
    const resp = await fetch(url, {
      headers: FETCH_HEADERS,
      redirect: "follow",
      signal: AbortSignal.timeout(timeout),
    });
    return { text: await resp.text(), status: resp.status };
  } catch (err) {
    return {
      text: "",
      status: 0,
      error: err instanceof Error ? err.message : "Fetch failed",
    };
  }
}

// ─── HTML parser (mirrors claude-seo parse_html.py) ──────

interface ParsedPage {
  title: string | null;
  titleLength: number;
  metaDescription: string | null;
  metaDescriptionLength: number;
  metaRobots: string | null;
  canonical: string | null;
  h1: string[];
  h2: string[];
  h3: string[];
  h4: string[];
  h5: string[];
  h6: string[];
  images: {
    src: string;
    alt: string | null;
    width: string | null;
    height: string | null;
    loading: string | null;
    fetchpriority: string | null;
    decoding: string | null;
  }[];
  internalLinks: { href: string; text: string }[];
  externalLinks: { href: string; text: string }[];
  schemaBlocks: unknown[];
  openGraph: Record<string, string>;
  twitterCard: Record<string, string>;
  wordCount: number;
  hreflang: { lang: string; href: string }[];
  hasViewportMeta: boolean;
  charset: string | null;
  lang: string | null;
  securityHeaders: Record<string, string | null>;
}

function parsePage(html: string, pageUrl: string): ParsedPage {
  const $ = cheerio.load(html);
  const baseHost = safeHostname(pageUrl);

  // Title
  const title = $("title").first().text().trim() || null;

  // Meta tags
  let metaDescription = null as string | null;
  let metaRobots = null as string | null;
  const openGraph: Record<string, string> = {};
  const twitterCard: Record<string, string> = {};
  let charset = null as string | null;

  $("meta").each((_, el) => {
    const $el = $(el);
    const name = ($el.attr("name") ?? "").toLowerCase();
    const property = ($el.attr("property") ?? "").toLowerCase();
    const content = $el.attr("content") ?? "";
    const cs = $el.attr("charset");

    if (cs) charset = cs;
    if (name === "description") metaDescription = content;
    if (name === "robots") metaRobots = content;
    if (property.startsWith("og:")) openGraph[property] = content;
    if (name.startsWith("twitter:")) twitterCard[name] = content;
  });

  // Canonical
  const canonical =
    $('link[rel="canonical"]').first().attr("href") ?? null;

  // Hreflang
  const hreflang: { lang: string; href: string }[] = [];
  $('link[rel="alternate"][hreflang]').each((_, el) => {
    const $el = $(el);
    const lang = $el.attr("hreflang");
    const href = $el.attr("href");
    if (lang && href) hreflang.push({ lang, href });
  });

  // Headings
  const headings = (tag: string) =>
    $(tag)
      .map((_, el) => $(el).text().trim())
      .get()
      .filter(Boolean);

  // Images
  const images = $("img")
    .map((_, el) => {
      const $el = $(el);
      return {
        src: $el.attr("src") ?? "",
        alt: $el.attr("alt") ?? null,
        width: $el.attr("width") ?? null,
        height: $el.attr("height") ?? null,
        loading: $el.attr("loading") ?? null,
        fetchpriority: $el.attr("fetchpriority") ?? null,
        decoding: $el.attr("decoding") ?? null,
      };
    })
    .get();

  // Links
  const internalLinks: { href: string; text: string }[] = [];
  const externalLinks: { href: string; text: string }[] = [];

  $("a[href]").each((_, el) => {
    const $el = $(el);
    const href = $el.attr("href") ?? "";
    if (!href || href.startsWith("#") || href.startsWith("javascript:"))
      return;

    const text = $el.text().trim().slice(0, 100);
    try {
      const resolved = new URL(href, pageUrl).href;
      const linkHost = safeHostname(resolved);
      if (linkHost === baseHost) {
        internalLinks.push({ href: resolved, text });
      } else {
        externalLinks.push({ href: resolved, text });
      }
    } catch {
      // malformed URL — skip
    }
  });

  // JSON-LD schema
  const schemaBlocks: unknown[] = [];
  $('script[type="application/ld+json"]').each((_, el) => {
    try {
      const raw = $(el).html();
      if (raw) schemaBlocks.push(JSON.parse(raw));
    } catch {
      // invalid JSON — counted as error later
    }
  });

  // Word count (visible text, excluding nav/footer)
  const clone = cheerio.load(html);
  clone("script, style, nav, footer, header, noscript").remove();
  const visibleText = clone("body").text();
  const wordCount = (visibleText.match(/\b\w+\b/g) ?? []).length;

  // Viewport
  const hasViewportMeta =
    $('meta[name="viewport"]').length > 0;

  // Lang
  const lang = $("html").attr("lang") ?? null;

  return {
    title,
    titleLength: title?.length ?? 0,
    metaDescription,
    metaDescriptionLength: metaDescription?.length ?? 0,
    metaRobots,
    canonical,
    h1: headings("h1"),
    h2: headings("h2"),
    h3: headings("h3"),
    h4: headings("h4"),
    h5: headings("h5"),
    h6: headings("h6"),
    images,
    internalLinks,
    externalLinks,
    schemaBlocks,
    openGraph,
    twitterCard,
    wordCount,
    hreflang,
    hasViewportMeta,
    charset,
    lang,
    securityHeaders: {},
  };
}

// ─── Nav / Footer Link Extractor ─────────────────────────

interface DiscoveredLink {
  url: string;
  text: string;
  source: "header" | "footer" | "nav" | "internal-link";
}

/**
 * Extract internal links from header, nav, and footer elements.
 * These are treated as "primary navigation pages" and crawled first.
 */
function extractNavLinks(html: string, pageUrl: string): DiscoveredLink[] {
  const $ = cheerio.load(html);
  const baseHost = safeHostname(pageUrl);
  const origin = new URL(pageUrl).origin;
  const links: DiscoveredLink[] = [];
  const seen = new Set<string>();

  const addLink = (
    el: any, // cheerio element
    source: "header" | "footer" | "nav"
  ) => {
    const $el = $(el);
    const href = $el.attr("href") ?? "";
    if (!href || href.startsWith("#") || href.startsWith("javascript:") || href.startsWith("mailto:") || href.startsWith("tel:"))
      return;
    try {
      const resolved = new URL(href, pageUrl).href;
      const linkHost = safeHostname(resolved);
      // Only same-domain internal links
      if (linkHost !== baseHost) return;
      // Normalize: strip trailing slash, hash, query for dedup
      const normalized = normalizeUrl(resolved);
      if (seen.has(normalized)) return;
      seen.add(normalized);
      links.push({
        url: resolved,
        text: $el.text().trim().slice(0, 80) || pathLabel(resolved, origin),
        source,
      });
    } catch {
      // malformed URL — skip
    }
  };

  // Header links (includes nested nav inside header)
  $("header a[href]").each((_, el) => addLink(el, "header"));

  // Standalone nav (not inside header/footer)
  $("nav").each((_, navEl) => {
    const $nav = $(navEl);
    // Skip if this nav is inside a header or footer (already captured)
    if ($nav.closest("header").length > 0 || $nav.closest("footer").length > 0) return;
    $nav.find("a[href]").each((_, el) => addLink(el, "nav"));
  });

  // Footer links
  $("footer a[href]").each((_, el) => addLink(el, "footer"));

  return links;
}

/**
 * Extract ALL internal links from a page (for general crawling).
 */
function extractInternalLinks(
  html: string,
  pageUrl: string
): DiscoveredLink[] {
  const $ = cheerio.load(html);
  const baseHost = safeHostname(pageUrl);
  const origin = new URL(pageUrl).origin;
  const links: DiscoveredLink[] = [];
  const seen = new Set<string>();

  $("a[href]").each((_, el) => {
    const $el = $(el);
    const href = $el.attr("href") ?? "";
    if (!href || href.startsWith("#") || href.startsWith("javascript:") || href.startsWith("mailto:") || href.startsWith("tel:"))
      return;
    try {
      const resolved = new URL(href, pageUrl).href;
      const linkHost = safeHostname(resolved);
      if (linkHost !== baseHost) return;
      const normalized = normalizeUrl(resolved);
      if (seen.has(normalized)) return;
      seen.add(normalized);
      links.push({
        url: resolved,
        text: $el.text().trim().slice(0, 80) || pathLabel(resolved, origin),
        source: "internal-link",
      });
    } catch {
      // skip
    }
  });

  return links;
}

/** Normalize URL for dedup: strip hash, trailing slash, lowercase host */
function normalizeUrl(rawUrl: string): string {
  try {
    const u = new URL(rawUrl);
    u.hash = "";
    // Remove trailing slash on path (except root)
    if (u.pathname.length > 1 && u.pathname.endsWith("/")) {
      u.pathname = u.pathname.slice(0, -1);
    }
    return u.href.toLowerCase();
  } catch {
    return rawUrl.toLowerCase();
  }
}

/** Generate a human-readable label from a URL path */
function pathLabel(url: string, origin: string): string {
  try {
    const path = new URL(url).pathname;
    if (path === "/" || path === "") return "Homepage";
    // "/about-us/" → "About Us"
    return path
      .replace(/^\/|\/$/g, "")
      .split("/")
      .pop()!
      .replace(/[-_]/g, " ")
      .replace(/\b\w/g, (c) => c.toUpperCase());
  } catch {
    return url.replace(origin, "") || "/";
  }
}

/**
 * Fetch multiple pages with concurrency limit.
 */
async function fetchPagesBatch(
  urls: string[],
  concurrency: number = FETCH_CONCURRENCY
): Promise<Map<string, FetchedPage>> {
  const results = new Map<string, FetchedPage>();
  const queue = [...urls];

  async function worker() {
    while (queue.length > 0) {
      const url = queue.shift()!;
      try {
        const page = await fetchPage(url, 15_000);
        results.set(normalizeUrl(url), page);
      } catch {
        results.set(normalizeUrl(url), {
          url,
          finalUrl: url,
          status: 0,
          html: "",
          headers: {},
          redirectChain: [],
          responseTimeMs: 0,
          error: "Fetch failed",
        });
      }
    }
  }

  const workers = Array.from(
    { length: Math.min(concurrency, queue.length) },
    () => worker()
  );
  await Promise.all(workers);
  return results;
}

// ─── Helpers ─────────────────────────────────────────────

function safeHostname(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return "";
  }
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

function check(
  id: string,
  category: string,
  description: string,
  result: CheckResult,
  severity: Severity,
  details: string,
  recommendation: string,
  isQuickWin = false,
  estimatedFixMinutes = 15
): AuditCheckResult {
  return {
    checkId: id,
    category,
    description,
    result,
    severity,
    details,
    recommendation,
    isQuickWin,
    estimatedFixMinutes,
  };
}

// ─── Robots.txt & Sitemap helpers ────────────────────────

interface RobotsTxtData {
  exists: boolean;
  content: string;
  allowsAll: boolean;
  sitemapUrls: string[];
  blocksGooglebot: boolean;
  aiCrawlerRules: { crawler: string; blocked: boolean }[];
}

function parseRobotsTxt(content: string): RobotsTxtData {
  const lines = content.split("\n").map((l) => l.trim());
  const sitemapUrls: string[] = [];
  let blocksGooglebot = false;
  const aiCrawlers = [
    "GPTBot",
    "ChatGPT-User",
    "ClaudeBot",
    "PerplexityBot",
    "Bytespider",
    "Google-Extended",
    "CCBot",
  ];
  const aiCrawlerRules: { crawler: string; blocked: boolean }[] = [];

  let currentAgent = "";
  for (const line of lines) {
    if (line.startsWith("#") || !line) continue;
    const lower = line.toLowerCase();

    if (lower.startsWith("user-agent:")) {
      currentAgent = line.slice("user-agent:".length).trim();
    } else if (lower.startsWith("sitemap:")) {
      sitemapUrls.push(line.slice("sitemap:".length).trim());
    } else if (lower.startsWith("disallow:")) {
      const path = line.slice("disallow:".length).trim();
      if (
        path === "/" &&
        (currentAgent.toLowerCase() === "googlebot" ||
          currentAgent === "*")
      ) {
        if (currentAgent.toLowerCase() === "googlebot")
          blocksGooglebot = true;
      }
    }
  }

  for (const crawler of aiCrawlers) {
    let blocked = false;
    let agentSection = false;
    for (const line of lines) {
      const lower = line.toLowerCase().trim();
      if (lower.startsWith("user-agent:")) {
        const agent = line.slice("user-agent:".length).trim();
        agentSection = agent.toLowerCase() === crawler.toLowerCase();
      } else if (agentSection && lower.startsWith("disallow:")) {
        const path = lower.slice("disallow:".length).trim();
        if (path === "/") blocked = true;
      }
    }
    aiCrawlerRules.push({ crawler, blocked });
  }

  return {
    exists: true,
    content,
    allowsAll: !blocksGooglebot,
    sitemapUrls,
    blocksGooglebot,
    aiCrawlerRules,
  };
}

// ─── DEPRECATED schema types (from claude-seo) ──────────

const DEPRECATED_SCHEMA_TYPES = new Set([
  "HowTo",
  "SpecialAnnouncement",
  "CourseInfo",
  "EstimatedSalary",
  "LearningVideo",
  "ClaimReview",
  "VehicleListing",
  "PracticeProblem",
  "Dataset",
]);

const RESTRICTED_SCHEMA_TYPES: Record<string, string> = {
  FAQPage:
    "FAQ schema is restricted to government and healthcare authority sites only (since Aug 2023).",
};

// ─── Check runners (one per category) ───────────────────

function runTechnicalChecks(
  page: ParsedPage,
  fetched: FetchedPage,
  robots: RobotsTxtData | null,
  sitemapStatus: { exists: boolean; urlCount: number; isValid: boolean }
): AuditCheckResult[] {
  const checks: AuditCheckResult[] = [];
  const cat = "Technical SEO";

  // T01 — HTTPS enforced
  const isHttps = fetched.finalUrl.startsWith("https://");
  checks.push(
    check(
      "T01",
      cat,
      "HTTPS enforced",
      isHttps ? "pass" : "fail",
      "critical",
      isHttps
        ? "Site is served over HTTPS."
        : "Site is NOT served over HTTPS.",
      isHttps
        ? "No action needed."
        : "Install a valid SSL certificate and redirect all HTTP to HTTPS.",
      !isHttps,
      30
    )
  );

  // T02 — robots.txt exists
  checks.push(
    check(
      "T02",
      cat,
      "robots.txt exists and is valid",
      robots?.exists ? "pass" : "warning",
      "high",
      robots?.exists
        ? "robots.txt found and accessible."
        : "No robots.txt found.",
      robots?.exists
        ? "No action needed."
        : "Create a robots.txt file at the site root. At minimum include a Sitemap: directive.",
      !robots?.exists,
      10
    )
  );

  // T03 — robots.txt does not block Googlebot
  if (robots?.exists) {
    checks.push(
      check(
        "T03",
        cat,
        "Googlebot not blocked by robots.txt",
        robots.blocksGooglebot ? "fail" : "pass",
        "critical",
        robots.blocksGooglebot
          ? "robots.txt blocks Googlebot from crawling the site."
          : "Googlebot is allowed by robots.txt.",
        robots.blocksGooglebot
          ? "Remove the Disallow: / rule for Googlebot immediately."
          : "No action needed."
      )
    );
  }

  // T04 — XML sitemap exists
  checks.push(
    check(
      "T04",
      cat,
      "XML sitemap exists",
      sitemapStatus.exists ? "pass" : "warning",
      "high",
      sitemapStatus.exists
        ? `XML sitemap found with ${sitemapStatus.urlCount} URLs.`
        : "No XML sitemap found at /sitemap.xml.",
      sitemapStatus.exists
        ? "No action needed."
        : "Create an XML sitemap and submit it to Google Search Console.",
      !sitemapStatus.exists,
      20
    )
  );

  // T05 — Sitemap referenced in robots.txt
  if (robots?.exists) {
    const hasSitemapRef = robots.sitemapUrls.length > 0;
    checks.push(
      check(
        "T05",
        cat,
        "Sitemap referenced in robots.txt",
        hasSitemapRef ? "pass" : "warning",
        "medium",
        hasSitemapRef
          ? `robots.txt references ${robots.sitemapUrls.length} sitemap(s).`
          : "robots.txt does not reference any sitemap.",
        hasSitemapRef
          ? "No action needed."
          : "Add a Sitemap: directive to robots.txt pointing to your XML sitemap.",
        !hasSitemapRef,
        5
      )
    );
  }

  // T06 — No accidental noindex on homepage
  const hasNoindex =
    page.metaRobots?.toLowerCase().includes("noindex") ?? false;
  checks.push(
    check(
      "T06",
      cat,
      "Homepage is indexable (no noindex)",
      hasNoindex ? "fail" : "pass",
      "critical",
      hasNoindex
        ? "Homepage has a noindex meta tag — it will NOT appear in search results."
        : "Homepage is indexable.",
      hasNoindex
        ? "Remove the noindex directive from the homepage meta robots tag."
        : "No action needed."
    )
  );

  // T07 — Security headers
  const secHeaders = [
    {
      key: "strict-transport-security",
      label: "HSTS",
      severity: "high" as Severity,
    },
    {
      key: "content-security-policy",
      label: "CSP",
      severity: "medium" as Severity,
    },
    {
      key: "x-content-type-options",
      label: "X-Content-Type-Options",
      severity: "medium" as Severity,
    },
    {
      key: "x-frame-options",
      label: "X-Frame-Options",
      severity: "low" as Severity,
    },
    {
      key: "referrer-policy",
      label: "Referrer-Policy",
      severity: "low" as Severity,
    },
  ];

  const presentHeaders = secHeaders.filter(
    (h) => fetched.headers[h.key]
  );
  const missingHeaders = secHeaders.filter(
    (h) => !fetched.headers[h.key]
  );
  checks.push(
    check(
      "T07",
      cat,
      "Security headers present",
      missingHeaders.length === 0
        ? "pass"
        : missingHeaders.some((h) => h.severity === "high")
          ? "fail"
          : "warning",
      missingHeaders.length === 0
        ? "low"
        : missingHeaders.some((h) => h.severity === "high")
          ? "high"
          : "medium",
      `Present: ${presentHeaders.map((h) => h.label).join(", ") || "none"}. Missing: ${missingHeaders.map((h) => h.label).join(", ") || "none"}.`,
      missingHeaders.length === 0
        ? "All key security headers are present."
        : `Add the following security headers: ${missingHeaders.map((h) => h.label).join(", ")}.`,
      missingHeaders.length > 0 && missingHeaders.length <= 2,
      15
    )
  );

  // T08 — Viewport meta tag (mobile-first indexing)
  checks.push(
    check(
      "T08",
      cat,
      "Viewport meta tag present (mobile-first)",
      page.hasViewportMeta ? "pass" : "fail",
      "critical",
      page.hasViewportMeta
        ? "Viewport meta tag found — page is configured for mobile-first indexing."
        : "No viewport meta tag found. Google uses mobile-first indexing for ALL sites (since July 2024).",
      page.hasViewportMeta
        ? "No action needed."
        : 'Add <meta name="viewport" content="width=device-width, initial-scale=1"> to the <head>.',
      !page.hasViewportMeta,
      5
    )
  );

  // T09 — HTML lang attribute
  checks.push(
    check(
      "T09",
      cat,
      "HTML lang attribute set",
      page.lang ? "pass" : "warning",
      "medium",
      page.lang
        ? `HTML lang attribute is set to "${page.lang}".`
        : "HTML lang attribute is missing.",
      page.lang
        ? "No action needed."
        : 'Add lang="en" (or appropriate language) to the <html> tag for accessibility and SEO.',
      !page.lang,
      5
    )
  );

  // T10 — Response time
  const responseMs = fetched.responseTimeMs;
  checks.push(
    check(
      "T10",
      cat,
      "Server response time (TTFB proxy)",
      responseMs < 800 ? "pass" : responseMs < 2000 ? "warning" : "fail",
      responseMs < 800 ? "low" : responseMs < 2000 ? "medium" : "high",
      `Server responded in ${responseMs}ms.`,
      responseMs < 800
        ? "Excellent server response time."
        : "Improve server response time. Consider edge CDN, caching, or server optimization.",
      false,
      60
    )
  );

  // T11 — Charset declaration
  checks.push(
    check(
      "T11",
      cat,
      "Character encoding declared",
      page.charset ? "pass" : "warning",
      "low",
      page.charset
        ? `Charset declared: ${page.charset}.`
        : "No charset meta tag found.",
      page.charset
        ? "No action needed."
        : 'Add <meta charset="UTF-8"> to the <head>.',
      !page.charset,
      5
    )
  );

  // T12 — HTTP status code
  checks.push(
    check(
      "T12",
      cat,
      "Homepage returns HTTP 200",
      fetched.status === 200
        ? "pass"
        : fetched.status >= 300 && fetched.status < 400
          ? "warning"
          : "fail",
      fetched.status === 200 ? "low" : "high",
      `Homepage returned HTTP ${fetched.status}.`,
      fetched.status === 200
        ? "No action needed."
        : `Homepage should return HTTP 200. Current status: ${fetched.status}.`
    )
  );

  // T13 — AI crawler management
  if (robots?.exists) {
    const blocked = robots.aiCrawlerRules.filter((r) => r.blocked);
    const allowed = robots.aiCrawlerRules.filter((r) => !r.blocked);
    checks.push(
      check(
        "T13",
        cat,
        "AI crawler management in robots.txt",
        "manual",
        "low",
        `AI crawlers blocked: ${blocked.map((r) => r.crawler).join(", ") || "none"}. Allowed: ${allowed.map((r) => r.crawler).join(", ") || "none"}.`,
        "Review your AI crawler strategy. Blocking AI crawlers prevents model training but may reduce AI search visibility. Consider selectively allowing crawlers whose platforms you want to appear on.",
        false,
        15
      )
    );
  }

  return checks;
}

function runContentChecks(
  page: ParsedPage,
  html: string
): AuditCheckResult[] {
  const checks: AuditCheckResult[] = [];
  const cat = "Content Quality";

  // C01 — Word count (homepage minimum 500)
  checks.push(
    check(
      "C01",
      cat,
      "Homepage word count (minimum 500)",
      page.wordCount >= 500
        ? "pass"
        : page.wordCount >= 300
          ? "warning"
          : "fail",
      page.wordCount >= 500 ? "low" : page.wordCount >= 300 ? "medium" : "high",
      `Homepage has ${page.wordCount} words.`,
      page.wordCount >= 500
        ? "Word count meets the homepage minimum."
        : `Add more substantive content. Homepage should have at least 500 words covering your value proposition, services, and key information. Currently ${page.wordCount} words.`,
      page.wordCount < 500,
      30
    )
  );

  // C02 — Internal linking (3-5 per 1000 words recommended)
  const linkDensity =
    page.wordCount > 0
      ? (page.internalLinks.length / page.wordCount) * 1000
      : 0;
  checks.push(
    check(
      "C02",
      cat,
      "Internal linking density",
      page.internalLinks.length >= 3
        ? linkDensity >= 2
          ? "pass"
          : "warning"
        : "fail",
      page.internalLinks.length >= 3 ? "medium" : "high",
      `${page.internalLinks.length} internal links found (${linkDensity.toFixed(1)} per 1,000 words).`,
      page.internalLinks.length >= 3
        ? "Internal linking is adequate."
        : "Add more internal links to help search engines discover and understand your content structure. Target 3-5 relevant internal links per 1,000 words.",
      page.internalLinks.length < 5,
      15
    )
  );

  // C03 — External links (to authoritative sources)
  checks.push(
    check(
      "C03",
      cat,
      "External link presence",
      page.externalLinks.length > 0 ? "pass" : "warning",
      "low",
      `${page.externalLinks.length} external links found.`,
      page.externalLinks.length > 0
        ? "External links present — citing authoritative sources strengthens trust."
        : "Consider adding links to authoritative external sources to build trust and credibility.",
      false,
      10
    )
  );

  // C04 — Content freshness signals
  const hasDateSignals =
    html.includes("datePublished") ||
    html.includes("dateModified") ||
    html.includes("article:published_time") ||
    html.includes("article:modified_time");
  checks.push(
    check(
      "C04",
      cat,
      "Content freshness signals",
      hasDateSignals ? "pass" : "warning",
      "medium",
      hasDateSignals
        ? "Date signals found (publication/modification dates)."
        : "No content freshness signals detected.",
      hasDateSignals
        ? "Good — freshness signals help search engines assess content relevance."
        : "Add publication and last-updated dates to your content. Use structured data (datePublished, dateModified) and visible date stamps.",
      !hasDateSignals,
      10
    )
  );

  // C05 — E-E-A-T: Contact information
  const hasContact =
    html.includes("contact") ||
    html.includes("Contact") ||
    html.includes("tel:") ||
    html.includes("mailto:") ||
    page.internalLinks.some((l) =>
      l.href.toLowerCase().includes("contact")
    );
  checks.push(
    check(
      "C05",
      cat,
      "Contact information accessible",
      hasContact ? "pass" : "warning",
      "medium",
      hasContact
        ? "Contact information or link found."
        : "No visible contact information or link found.",
      hasContact
        ? "Contact information is accessible — this strengthens Trustworthiness (E-E-A-T)."
        : "Add clearly visible contact information (phone, email, address) to strengthen Trustworthiness. Link to a /contact page from the homepage.",
      !hasContact,
      15
    )
  );

  // C06 — E-E-A-T: About page link
  const hasAbout = page.internalLinks.some((l) =>
    l.href.toLowerCase().includes("about")
  );
  checks.push(
    check(
      "C06",
      cat,
      "About page accessible from homepage",
      hasAbout ? "pass" : "warning",
      "medium",
      hasAbout
        ? "Link to About page found."
        : "No link to an About page found on the homepage.",
      hasAbout
        ? "About page linked — supports E-E-A-T authority signals."
        : "Add a link to an About page from the homepage. Include company history, team bios, and credentials to strengthen E-E-A-T.",
      !hasAbout,
      10
    )
  );

  // C07 — E-E-A-T: Privacy policy
  const hasPrivacy = page.internalLinks.some(
    (l) =>
      l.href.toLowerCase().includes("privacy") ||
      l.text.toLowerCase().includes("privacy")
  );
  checks.push(
    check(
      "C07",
      cat,
      "Privacy policy linked",
      hasPrivacy ? "pass" : "warning",
      "medium",
      hasPrivacy
        ? "Privacy policy link found."
        : "No privacy policy link found on the homepage.",
      hasPrivacy
        ? "Privacy policy linked — important for trust signals."
        : "Add a link to a privacy policy page, typically in the footer.",
      !hasPrivacy,
      10
    )
  );

  // C08 — E-E-A-T: Terms of service
  const hasTerms = page.internalLinks.some(
    (l) =>
      l.href.toLowerCase().includes("terms") ||
      l.text.toLowerCase().includes("terms")
  );
  checks.push(
    check(
      "C08",
      cat,
      "Terms of service linked",
      hasTerms ? "pass" : "warning",
      "low",
      hasTerms
        ? "Terms of service link found."
        : "No terms of service link found.",
      hasTerms
        ? "Terms of service linked — supports trustworthiness."
        : "Add a link to a terms of service page.",
      false,
      10
    )
  );

  // C09 — Heading structure quality
  const headingsTotal =
    page.h1.length +
    page.h2.length +
    page.h3.length +
    page.h4.length;
  checks.push(
    check(
      "C09",
      cat,
      "Content structure (headings hierarchy)",
      headingsTotal >= 4
        ? "pass"
        : headingsTotal >= 2
          ? "warning"
          : "fail",
      headingsTotal >= 4 ? "low" : "medium",
      `Found ${page.h1.length} H1, ${page.h2.length} H2, ${page.h3.length} H3, ${page.h4.length} H4 tags.`,
      headingsTotal >= 4
        ? "Content is well-structured with proper heading hierarchy."
        : "Add more headings to create a logical content hierarchy. Use H2 for main sections and H3 for subsections.",
      headingsTotal < 3,
      15
    )
  );

  // C10 — Multimedia presence
  const hasVideo =
    html.includes("<video") ||
    html.includes("youtube.com") ||
    html.includes("vimeo.com") ||
    html.includes("wistia.com");
  const hasImages = page.images.length > 0;
  checks.push(
    check(
      "C10",
      cat,
      "Multimedia content present",
      hasImages && hasVideo
        ? "pass"
        : hasImages
          ? "warning"
          : "fail",
      hasImages ? "low" : "medium",
      `Images: ${page.images.length}. Video: ${hasVideo ? "yes" : "no"}.`,
      hasImages
        ? hasVideo
          ? "Good mix of multimedia content."
          : "Consider adding video content to increase engagement and dwell time."
        : "Add relevant images and multimedia to enrich your content.",
      !hasImages,
      30
    )
  );

  return checks;
}

function runOnPageChecks(page: ParsedPage, pageUrl: string): AuditCheckResult[] {
  const checks: AuditCheckResult[] = [];
  const cat = "On-Page SEO";

  // P01 — Title tag exists
  checks.push(
    check(
      "P01",
      cat,
      "Title tag present",
      page.title ? "pass" : "fail",
      "critical",
      page.title
        ? `Title: "${page.title}" (${page.titleLength} chars).`
        : "No title tag found.",
      page.title
        ? "Title tag is present."
        : "Add a unique, descriptive title tag (50-60 characters) with your primary keyword.",
      !page.title,
      5
    )
  );

  // P02 — Title tag length
  if (page.title) {
    checks.push(
      check(
        "P02",
        cat,
        "Title tag length (50-60 chars)",
        page.titleLength >= 30 && page.titleLength <= 60
          ? "pass"
          : page.titleLength > 60
            ? "warning"
            : "fail",
        page.titleLength < 30 ? "high" : page.titleLength > 60 ? "medium" : "low",
        `Title is ${page.titleLength} characters. Recommended: 50-60.`,
        page.titleLength >= 30 && page.titleLength <= 60
          ? "Title length is optimal."
          : page.titleLength > 60
            ? `Title may be truncated in search results. Shorten to ≤60 characters.`
            : "Title is too short. Expand to 50-60 characters with your primary keyword.",
        page.titleLength > 60 || page.titleLength < 30,
        10
      )
    );
  }

  // P03 — Meta description exists
  checks.push(
    check(
      "P03",
      cat,
      "Meta description present",
      page.metaDescription ? "pass" : "fail",
      "high",
      page.metaDescription
        ? `Meta description: "${page.metaDescription.slice(0, 80)}..." (${page.metaDescriptionLength} chars).`
        : "No meta description found.",
      page.metaDescription
        ? "Meta description is present."
        : "Add a compelling meta description (150-160 characters) with your primary keyword and a call-to-action.",
      !page.metaDescription,
      10
    )
  );

  // P04 — Meta description length
  if (page.metaDescription) {
    checks.push(
      check(
        "P04",
        cat,
        "Meta description length (120-160 chars)",
        page.metaDescriptionLength >= 120 && page.metaDescriptionLength <= 160
          ? "pass"
          : page.metaDescriptionLength > 160
            ? "warning"
            : "warning",
        "medium",
        `Meta description is ${page.metaDescriptionLength} characters. Recommended: 120-160.`,
        page.metaDescriptionLength >= 120 && page.metaDescriptionLength <= 160
          ? "Meta description length is optimal."
          : page.metaDescriptionLength > 160
            ? "Meta description may be truncated. Shorten to ≤160 characters."
            : "Meta description is short. Expand to 120-160 characters for maximum SERP real estate.",
        true,
        10
      )
    );
  }

  // P05 — Exactly one H1
  checks.push(
    check(
      "P05",
      cat,
      "Exactly one H1 tag",
      page.h1.length === 1
        ? "pass"
        : page.h1.length === 0
          ? "fail"
          : "warning",
      page.h1.length === 0 ? "high" : page.h1.length > 1 ? "medium" : "low",
      page.h1.length === 1
        ? `One H1 found: "${page.h1[0]}".`
        : page.h1.length === 0
          ? "No H1 tag found on the page."
          : `${page.h1.length} H1 tags found: ${page.h1.map((h) => `"${h}"`).join(", ")}.`,
      page.h1.length === 1
        ? "Good — exactly one H1 tag."
        : page.h1.length === 0
          ? "Add one H1 tag with your primary keyword that describes the page content."
          : "Use only one H1 per page. Convert extra H1 tags to H2.",
      page.h1.length !== 1,
      10
    )
  );

  // P06 — Heading hierarchy (no skipped levels)
  const hasH1 = page.h1.length > 0;
  const hasH2 = page.h2.length > 0;
  const hasH3 = page.h3.length > 0;
  const skipsLevel =
    (!hasH2 && hasH3) || (!hasH1 && (hasH2 || hasH3));
  checks.push(
    check(
      "P06",
      cat,
      "Heading hierarchy (no skipped levels)",
      skipsLevel ? "warning" : "pass",
      "medium",
      skipsLevel
        ? "Heading hierarchy skips levels (e.g. H1 → H3 with no H2)."
        : "Heading hierarchy is sequential (H1 → H2 → H3).",
      skipsLevel
        ? "Maintain a logical heading hierarchy: H1 → H2 → H3. Don't skip levels."
        : "Good heading structure.",
      skipsLevel,
      10
    )
  );

  // P07 — Canonical tag
  checks.push(
    check(
      "P07",
      cat,
      "Canonical tag present",
      page.canonical ? "pass" : "warning",
      "medium",
      page.canonical
        ? `Canonical URL: ${page.canonical}`
        : "No canonical tag found.",
      page.canonical
        ? "Canonical tag is set."
        : 'Add a self-referencing canonical tag: <link rel="canonical" href="..."> to prevent duplicate content issues.',
      !page.canonical,
      5
    )
  );

  // P08 — Canonical self-references (not pointing elsewhere)
  if (page.canonical) {
    const canonHost = safeHostname(page.canonical);
    const pageHost = safeHostname(pageUrl);
    const isSelfRef = canonHost === pageHost;
    checks.push(
      check(
        "P08",
        cat,
        "Canonical is self-referencing or same domain",
        isSelfRef ? "pass" : "warning",
        "medium",
        isSelfRef
          ? "Canonical points to the same domain."
          : `Canonical points to a different domain: ${page.canonical}. This could signal content is not the primary version.`,
        isSelfRef
          ? "No action needed."
          : "Verify the canonical URL is intentional. If this is the primary version, update to a self-referencing canonical.",
        false,
        10
      )
    );
  }

  // P09 — Open Graph tags
  const ogKeys = Object.keys(page.openGraph);
  const hasOgTitle = ogKeys.includes("og:title");
  const hasOgDesc = ogKeys.includes("og:description");
  const hasOgImage = ogKeys.includes("og:image");
  const ogScore =
    (hasOgTitle ? 1 : 0) + (hasOgDesc ? 1 : 0) + (hasOgImage ? 1 : 0);
  checks.push(
    check(
      "P09",
      cat,
      "Open Graph meta tags",
      ogScore === 3 ? "pass" : ogScore >= 1 ? "warning" : "fail",
      ogScore === 0 ? "medium" : "low",
      `Open Graph: ${ogKeys.join(", ") || "none found"}. Missing: ${[!hasOgTitle && "og:title", !hasOgDesc && "og:description", !hasOgImage && "og:image"].filter(Boolean).join(", ") || "none"}.`,
      ogScore === 3
        ? "All key Open Graph tags present — optimal for social sharing."
        : "Add missing Open Graph tags (og:title, og:description, og:image) for better social sharing previews.",
      ogScore < 3,
      10
    )
  );

  // P10 — Twitter Card tags
  const twKeys = Object.keys(page.twitterCard);
  const hasTwitterCard = twKeys.length > 0;
  checks.push(
    check(
      "P10",
      cat,
      "Twitter Card meta tags",
      hasTwitterCard ? "pass" : "warning",
      "low",
      hasTwitterCard
        ? `Twitter Card tags: ${twKeys.join(", ")}.`
        : "No Twitter Card tags found.",
      hasTwitterCard
        ? "Twitter Card tags present."
        : "Add Twitter Card meta tags (twitter:card, twitter:title, twitter:description) for better X/Twitter sharing.",
      !hasTwitterCard,
      10
    )
  );

  // P11 — URL structure
  const urlPath = new URL(pageUrl).pathname;
  const cleanUrl =
    urlPath === "/" ||
    (/^[a-z0-9/\-_.]+$/i.test(urlPath) && urlPath.length < 100);
  checks.push(
    check(
      "P11",
      cat,
      "Clean URL structure",
      cleanUrl ? "pass" : "warning",
      "low",
      `URL path: ${urlPath} (${urlPath.length} chars).`,
      cleanUrl
        ? "URL is clean and SEO-friendly."
        : "Simplify the URL: use lowercase, hyphens, no special characters, and keep under 100 characters.",
      false,
      15
    )
  );

  return checks;
}

function runSchemaChecks(page: ParsedPage): AuditCheckResult[] {
  const checks: AuditCheckResult[] = [];
  const cat = "Schema & Structured Data";

  // S01 — Schema markup present
  checks.push(
    check(
      "S01",
      cat,
      "Structured data (JSON-LD) present",
      page.schemaBlocks.length > 0 ? "pass" : "warning",
      "medium",
      page.schemaBlocks.length > 0
        ? `${page.schemaBlocks.length} JSON-LD block(s) found.`
        : "No JSON-LD structured data found.",
      page.schemaBlocks.length > 0
        ? "Structured data is present."
        : "Add JSON-LD structured data. At minimum, add Organization or LocalBusiness schema. Schema markup has ~2.5× higher chance of appearing in AI search answers.",
      page.schemaBlocks.length === 0,
      20
    )
  );

  // Analyze each schema block
  if (page.schemaBlocks.length > 0) {
    const allTypes: string[] = [];
    let hasDeprecated = false;
    let hasRestricted = false;
    let deprecatedList: string[] = [];
    let restrictedList: string[] = [];
    let hasContext = true;
    let invalidBlocks = 0;

    for (const block of page.schemaBlocks) {
      if (typeof block === "object" && block !== null) {
        const b = block as Record<string, unknown>;
        const type = b["@type"] as string | undefined;
        const context = b["@context"] as string | undefined;

        if (!context || !context.includes("schema.org")) {
          hasContext = false;
        }

        if (typeof type === "string") {
          allTypes.push(type);
          if (DEPRECATED_SCHEMA_TYPES.has(type)) {
            hasDeprecated = true;
            deprecatedList.push(type);
          }
          if (type in RESTRICTED_SCHEMA_TYPES) {
            hasRestricted = true;
            restrictedList.push(type);
          }
        } else if (Array.isArray(type)) {
          allTypes.push(...(type as string[]));
        } else {
          invalidBlocks++;
        }
      }
    }

    // S02 — Schema types detected
    checks.push(
      check(
        "S02",
        cat,
        "Schema types detected",
        allTypes.length > 0 ? "pass" : "warning",
        "low",
        `Schema types: ${allTypes.join(", ") || "none detected"}.`,
        allTypes.length > 0
          ? "Schema types recognized."
          : "Ensure each JSON-LD block has a valid @type property.",
        false,
        10
      )
    );

    // S03 — No deprecated schema types
    if (hasDeprecated) {
      checks.push(
        check(
          "S03",
          cat,
          "No deprecated schema types",
          "fail",
          "high",
          `Deprecated schema types found: ${deprecatedList.join(", ")}. These no longer generate rich results.`,
          `Remove deprecated schema types: ${deprecatedList.join(", ")}. HowTo was removed Sept 2023, SpecialAnnouncement July 2025. Replace with current alternatives.`,
          true,
          15
        )
      );
    }

    // S04 — Restricted schema check
    if (hasRestricted) {
      checks.push(
        check(
          "S04",
          cat,
          "Restricted schema type usage",
          "warning",
          "medium",
          `Restricted schema types found: ${restrictedList.join(", ")}. ${restrictedList.map((t) => RESTRICTED_SCHEMA_TYPES[t]).join(" ")}`,
          "Review restricted schema usage — FAQ schema only generates rich results for government/healthcare sites since Aug 2023.",
          true,
          10
        )
      );
    }

    // S05 — Valid @context
    checks.push(
      check(
        "S05",
        cat,
        "Valid @context in schema blocks",
        hasContext ? "pass" : "fail",
        "high",
        hasContext
          ? 'All schema blocks have a valid @context ("https://schema.org").'
          : "One or more schema blocks are missing @context or use http instead of https.",
        hasContext
          ? "No action needed."
          : 'Ensure all JSON-LD blocks include "@context": "https://schema.org".',
        !hasContext,
        5
      )
    );

    // S06 — Organization or LocalBusiness schema
    const hasOrgSchema =
      allTypes.includes("Organization") ||
      allTypes.includes("LocalBusiness") ||
      allTypes.some((t) => t.includes("Business"));
    checks.push(
      check(
        "S06",
        cat,
        "Organization/LocalBusiness schema present",
        hasOrgSchema ? "pass" : "warning",
        "medium",
        hasOrgSchema
          ? "Organization or LocalBusiness schema found."
          : "No Organization or LocalBusiness schema found.",
        hasOrgSchema
          ? "Good — entity schema helps Google understand your business."
          : "Add Organization or LocalBusiness schema with name, URL, logo, contactPoint, and sameAs properties.",
        !hasOrgSchema,
        15
      )
    );

    // S07 — WebSite schema (for sitelinks search)
    const hasWebSite = allTypes.includes("WebSite");
    checks.push(
      check(
        "S07",
        cat,
        "WebSite schema present",
        hasWebSite ? "pass" : "warning",
        "low",
        hasWebSite
          ? "WebSite schema found — enables sitelinks search box."
          : "No WebSite schema found.",
        hasWebSite
          ? "Good — WebSite schema enables the sitelinks search box in Google."
          : "Add WebSite schema with SearchAction to enable sitelinks search box in Google results.",
        !hasWebSite,
        15
      )
    );
  }

  return checks;
}

function runPerformanceChecks(
  page: ParsedPage,
  html: string,
  fetched: FetchedPage
): AuditCheckResult[] {
  const checks: AuditCheckResult[] = [];
  const cat = "Performance";

  // PF01 — LCP hints: large hero images
  const $ = cheerio.load(html);
  const firstImg = page.images[0];
  const hasLargeHero =
    firstImg &&
    firstImg.width &&
    firstImg.height &&
    parseInt(firstImg.width) > 600;
  const heroHasFetchPriority = firstImg?.fetchpriority === "high";
  const heroIsLazyLoaded = firstImg?.loading === "lazy";

  if (firstImg) {
    checks.push(
      check(
        "PF01",
        cat,
        "LCP image optimization",
        heroIsLazyLoaded
          ? "fail"
          : heroHasFetchPriority
            ? "pass"
            : "warning",
        heroIsLazyLoaded ? "high" : heroHasFetchPriority ? "low" : "medium",
        heroIsLazyLoaded
          ? 'Above-fold image uses loading="lazy" — this directly hurts LCP.'
          : heroHasFetchPriority
            ? 'Hero image has fetchpriority="high" — good for LCP.'
            : 'Hero image does not have fetchpriority="high".',
        heroIsLazyLoaded
          ? 'Remove loading="lazy" from above-fold/hero images. Reserve lazy loading for below-fold images only.'
          : heroHasFetchPriority
            ? "No action needed."
            : 'Add fetchpriority="high" to your hero/LCP image to prioritize download.',
        heroIsLazyLoaded || !heroHasFetchPriority,
        5
      )
    );
  }

  // PF02 — Render-blocking resources
  const blockingStylesheets = $('link[rel="stylesheet"]').length;
  const blockingScripts = $("script:not([async]):not([defer]):not([type])").filter(
    (_, el) => !!$(el).attr("src")
  ).length;
  const totalBlocking = blockingStylesheets + blockingScripts;

  checks.push(
    check(
      "PF02",
      cat,
      "Render-blocking resources",
      totalBlocking <= 3
        ? "pass"
        : totalBlocking <= 6
          ? "warning"
          : "fail",
      totalBlocking <= 3 ? "low" : totalBlocking <= 6 ? "medium" : "high",
      `${blockingStylesheets} blocking stylesheets, ${blockingScripts} blocking scripts (no async/defer).`,
      totalBlocking <= 3
        ? "Minimal render-blocking resources."
        : `Reduce render-blocking resources. Add async or defer to ${blockingScripts} script(s). Consider inlining critical CSS.`,
      blockingScripts > 0,
      20
    )
  );

  // PF03 — CLS prevention: images with dimensions
  const imgsWithDimensions = page.images.filter(
    (i) => i.width && i.height
  ).length;
  const imgsWithoutDimensions = page.images.length - imgsWithDimensions;

  if (page.images.length > 0) {
    checks.push(
      check(
        "PF03",
        cat,
        "CLS prevention: image dimensions set",
        imgsWithoutDimensions === 0
          ? "pass"
          : imgsWithoutDimensions <= 2
            ? "warning"
            : "fail",
        imgsWithoutDimensions === 0
          ? "low"
          : imgsWithoutDimensions <= 2
            ? "medium"
            : "high",
        `${imgsWithDimensions}/${page.images.length} images have width/height attributes.`,
        imgsWithoutDimensions === 0
          ? "All images have dimensions set — prevents CLS."
          : `Add width and height attributes to ${imgsWithoutDimensions} image(s) to prevent Cumulative Layout Shift.`,
        imgsWithoutDimensions > 0,
        10
      )
    );
  }

  // PF04 — HTML page size
  const pageSizeKB = Math.round(html.length / 1024);
  checks.push(
    check(
      "PF04",
      cat,
      "HTML document size",
      pageSizeKB < 100
        ? "pass"
        : pageSizeKB < 300
          ? "warning"
          : "fail",
      pageSizeKB < 100 ? "low" : pageSizeKB < 300 ? "medium" : "high",
      `HTML document is ${pageSizeKB} KB.`,
      pageSizeKB < 100
        ? "HTML size is reasonable."
        : "HTML document is large. Review for inlined assets, excessive DOM size, or unused HTML. Target <100 KB.",
      false,
      30
    )
  );

  // PF05 — Third-party script count
  const thirdPartyScripts = $("script[src]")
    .map((_, el) => $(el).attr("src") ?? "")
    .get()
    .filter((src) => {
      try {
        const host = new URL(src, fetched.finalUrl).hostname;
        return host !== safeHostname(fetched.finalUrl);
      } catch {
        return false;
      }
    });

  checks.push(
    check(
      "PF05",
      cat,
      "Third-party script count",
      thirdPartyScripts.length <= 5
        ? "pass"
        : thirdPartyScripts.length <= 10
          ? "warning"
          : "fail",
      thirdPartyScripts.length <= 5 ? "low" : "medium",
      `${thirdPartyScripts.length} third-party scripts detected.`,
      thirdPartyScripts.length <= 5
        ? "Third-party script count is manageable."
        : `${thirdPartyScripts.length} third-party scripts may impact INP and LCP. Audit each for necessity and defer non-critical ones.`,
      false,
      30
    )
  );

  // PF06 — DOM size estimate
  const domNodes = (html.match(/<[a-z]/gi) ?? []).length;
  checks.push(
    check(
      "PF06",
      cat,
      "DOM complexity (node count estimate)",
      domNodes < 800
        ? "pass"
        : domNodes < 1500
          ? "warning"
          : "fail",
      domNodes < 800 ? "low" : domNodes < 1500 ? "medium" : "high",
      `Estimated ${domNodes} DOM nodes.`,
      domNodes < 800
        ? "DOM complexity is low — good for INP."
        : "Large DOM may impact INP (Interaction to Next Paint). Simplify page structure, use virtualization for lists, and lazy-load sections.",
      false,
      60
    )
  );

  return checks;
}

function runImageChecks(page: ParsedPage): AuditCheckResult[] {
  const checks: AuditCheckResult[] = [];
  const cat = "Images";

  if (page.images.length === 0) {
    checks.push(
      check(
        "I01",
        cat,
        "Images present on page",
        "warning",
        "low",
        "No images found on the page.",
        "Add relevant images to enhance content engagement. Include descriptive alt text.",
        false,
        30
      )
    );
    return checks;
  }

  // I01 — Alt text coverage
  const imgsWithAlt = page.images.filter(
    (i) => i.alt && i.alt.trim().length > 0
  ).length;
  const missingAlt = page.images.length - imgsWithAlt;
  const altCoverage = safeDiv(imgsWithAlt, page.images.length) * 100;

  checks.push(
    check(
      "I01",
      cat,
      "Image alt text coverage",
      altCoverage === 100
        ? "pass"
        : altCoverage >= 80
          ? "warning"
          : "fail",
      altCoverage === 100 ? "low" : altCoverage >= 80 ? "medium" : "high",
      `${imgsWithAlt}/${page.images.length} images have alt text (${Math.round(altCoverage)}% coverage).`,
      altCoverage === 100
        ? "All images have alt text — excellent for accessibility and SEO."
        : `Add descriptive alt text to ${missingAlt} image(s). Alt text should describe the image content in 10-125 characters.`,
      missingAlt > 0 && missingAlt <= 5,
      missingAlt * 3
    )
  );

  // I02 — Alt text quality
  const badAltPatterns = [
    /^image$/i,
    /^photo$/i,
    /^img$/i,
    /\.(jpg|jpeg|png|gif|webp|svg|avif)$/i,
    /^untitled$/i,
    /^click here$/i,
    /^banner$/i,
    /^logo$/i,
  ];
  const poorAlt = page.images.filter(
    (i) =>
      i.alt && badAltPatterns.some((p) => p.test(i.alt!.trim()))
  );

  if (poorAlt.length > 0) {
    checks.push(
      check(
        "I02",
        cat,
        "Alt text quality",
        "warning",
        "medium",
        `${poorAlt.length} image(s) have poor alt text (e.g. "${poorAlt[0]?.alt}"). Alt text should be descriptive, not filenames or generic words.`,
        "Replace generic alt text with descriptive text: e.g. 'Professional plumber repairing kitchen sink faucet' instead of 'image.jpg'.",
        poorAlt.length <= 3,
        poorAlt.length * 3
      )
    );
  }

  // I03 — Image dimensions for CLS
  const withDimensions = page.images.filter(
    (i) => i.width && i.height
  ).length;
  const withoutDimensions = page.images.length - withDimensions;
  checks.push(
    check(
      "I03",
      cat,
      "Image width/height attributes",
      withoutDimensions === 0
        ? "pass"
        : withoutDimensions <= 3
          ? "warning"
          : "fail",
      withoutDimensions === 0 ? "low" : "medium",
      `${withDimensions}/${page.images.length} images have width and height attributes.`,
      withoutDimensions === 0
        ? "All images have dimensions — prevents CLS."
        : `Add width and height attributes to ${withoutDimensions} image(s) to prevent layout shift.`,
      withoutDimensions > 0 && withoutDimensions <= 3,
      withoutDimensions * 2
    )
  );

  // I04 — Lazy loading on below-fold images
  const lazyLoaded = page.images.filter(
    (i) => i.loading === "lazy"
  ).length;
  const totalBelowFold = Math.max(0, page.images.length - 1); // first image is "above fold"
  const lazyRatio =
    totalBelowFold > 0 ? safeDiv(lazyLoaded, totalBelowFold) : 1;

  checks.push(
    check(
      "I04",
      cat,
      "Lazy loading for below-fold images",
      lazyRatio >= 0.5
        ? "pass"
        : lazyRatio > 0
          ? "warning"
          : page.images.length <= 1
            ? "pass"
            : "warning",
      "low",
      `${lazyLoaded} of ${totalBelowFold} below-fold images use loading="lazy".`,
      lazyRatio >= 0.5
        ? "Good use of lazy loading."
        : 'Add loading="lazy" to below-fold images to improve initial page load time.',
      lazyRatio < 0.5 && totalBelowFold > 0,
      10
    )
  );

  // I05 — Modern image formats
  const imgSources = page.images.map((i) => i.src.toLowerCase());
  const modernFormats = imgSources.filter(
    (s) => s.includes(".webp") || s.includes(".avif")
  ).length;
  const legacyFormats = imgSources.filter(
    (s) =>
      s.includes(".jpg") ||
      s.includes(".jpeg") ||
      s.includes(".png")
  ).length;
  const modernRatio =
    page.images.length > 0
      ? safeDiv(modernFormats, page.images.length) * 100
      : 100;

  if (legacyFormats > 0) {
    checks.push(
      check(
        "I05",
        cat,
        "Modern image formats (WebP/AVIF)",
        modernRatio >= 80
          ? "pass"
          : modernRatio >= 40
            ? "warning"
            : "fail",
        "medium",
        `${modernFormats} modern format images (WebP/AVIF), ${legacyFormats} legacy format (JPEG/PNG).`,
        modernRatio >= 80
          ? "Mostly using modern formats — good."
          : `Convert ${legacyFormats} legacy images to WebP or AVIF for ~25-50% size savings. Use <picture> with fallbacks.`,
        legacyFormats <= 5,
        legacyFormats * 5
      )
    );
  }

  return checks;
}

function runAIReadinessChecks(
  page: ParsedPage,
  html: string,
  robots: RobotsTxtData | null,
  pageUrl: string
): AuditCheckResult[] {
  const checks: AuditCheckResult[] = [];
  const cat = "AI Search Readiness";

  // AI01 — Structured content for citations
  const hasLists = html.includes("<ul") || html.includes("<ol");
  const hasTables = html.includes("<table");
  const headingsCount =
    page.h1.length + page.h2.length + page.h3.length;
  const structureScore =
    (hasLists ? 1 : 0) +
    (hasTables ? 1 : 0) +
    (headingsCount >= 3 ? 1 : 0) +
    (page.schemaBlocks.length > 0 ? 1 : 0);

  checks.push(
    check(
      "AI01",
      cat,
      "Content structure for AI citations",
      structureScore >= 3
        ? "pass"
        : structureScore >= 2
          ? "warning"
          : "fail",
      structureScore >= 3 ? "low" : "medium",
      `Structure signals: ${[headingsCount >= 3 && "headings", hasLists && "lists", hasTables && "tables", page.schemaBlocks.length > 0 && "schema"].filter(Boolean).join(", ") || "none"}.`,
      structureScore >= 3
        ? "Content is well-structured for AI citation extraction."
        : "Improve content structure: use clear heading hierarchy, bullet/numbered lists, tables for data, and JSON-LD schema. AI systems preferentially cite well-structured content.",
      structureScore < 3,
      20
    )
  );

  // AI02 — Clear quotable statements
  // Heuristic: look for short, fact-like paragraphs, definitions, or data points
  const $ = cheerio.load(html);
  const paragraphs = $("p")
    .map((_, el) => $(el).text().trim())
    .get()
    .filter((p) => p.length > 20);
  const shortFactual = paragraphs.filter(
    (p) =>
      p.length < 200 &&
      (/\d+%/.test(p) ||
        /\d{4}/.test(p) ||
        p.includes("according to") ||
        p.includes("study") ||
        p.includes("research"))
  );

  checks.push(
    check(
      "AI02",
      cat,
      "Quotable facts and statistics",
      shortFactual.length >= 2
        ? "pass"
        : shortFactual.length >= 1
          ? "warning"
          : "manual",
      "low",
      `${shortFactual.length} quotable factual statement(s) detected.`,
      shortFactual.length >= 2
        ? "Content contains quotable facts — good for AI citations."
        : "Add clear, concise factual statements with statistics, dates, and source references. AI systems prioritize extractable facts with data points.",
      false,
      20
    )
  );

  // AI03 — Author attribution (E-E-A-T for AI)
  const hasAuthor =
    html.includes("author") ||
    page.schemaBlocks.some(
      (b) =>
        typeof b === "object" &&
        b !== null &&
        JSON.stringify(b).includes("author")
    );
  checks.push(
    check(
      "AI03",
      cat,
      "Author attribution for AI trust",
      hasAuthor ? "pass" : "warning",
      "medium",
      hasAuthor
        ? "Author attribution signals detected."
        : "No author attribution found.",
      hasAuthor
        ? "Author information present — AI systems use this for source trustworthiness."
        : "Add author attribution with name, credentials, and Person schema. AI systems preferentially cite sources with clear authorship.",
      !hasAuthor,
      15
    )
  );

  // AI04 — AI crawler accessibility
  if (robots?.exists) {
    const mainAICrawlers = robots.aiCrawlerRules.filter((r) =>
      ["GPTBot", "ClaudeBot", "PerplexityBot"].includes(r.crawler)
    );
    const allBlocked = mainAICrawlers.every((r) => r.blocked);
    const someBlocked = mainAICrawlers.some((r) => r.blocked);

    checks.push(
      check(
        "AI04",
        cat,
        "AI crawler accessibility",
        allBlocked
          ? "fail"
          : someBlocked
            ? "warning"
            : "pass",
        allBlocked ? "high" : someBlocked ? "medium" : "low",
        `AI crawlers — ${mainAICrawlers.map((r) => `${r.crawler}: ${r.blocked ? "blocked" : "allowed"}`).join(", ")}.`,
        allBlocked
          ? "All major AI crawlers (GPTBot, ClaudeBot, PerplexityBot) are blocked. Your content will NOT appear in AI search results."
          : someBlocked
            ? "Some AI crawlers are blocked. Review your strategy — blocking reduces AI search visibility."
            : "Major AI crawlers are allowed — your content can appear in AI search results.",
        allBlocked,
        10
      )
    );
  }

  // AI05 — Answer-first formatting
  const firstParagraph = paragraphs[0] ?? "";
  const answersFirst =
    firstParagraph.length > 30 &&
    firstParagraph.length < 300 &&
    (firstParagraph.includes("is") ||
      firstParagraph.includes("are") ||
      firstParagraph.includes("means") ||
      firstParagraph.includes("refers"));

  checks.push(
    check(
      "AI05",
      cat,
      "Answer-first content formatting",
      answersFirst ? "pass" : "manual",
      "low",
      answersFirst
        ? "First paragraph appears to provide a direct answer or definition."
        : "Could not confirm answer-first formatting in the opening content.",
      answersFirst
        ? "Good — leading with a direct answer improves AI citation probability."
        : "Consider leading with a clear, concise answer or definition. AI systems extract and cite answer-first content more frequently.",
      false,
      15
    )
  );

  return checks;
}

// ─── Main SEO audit runner ───────────────────────────────

export interface SeoAuditInput {
  websiteUrl: string;
}

/**
 * Multi-page SEO site audit.
 *
 * Crawl protocol:
 *   1. Fetch homepage → extract header/nav/footer links + all internal links
 *   2. Fetch header/footer/nav pages → extract their internal links
 *   3. Deduplicate, cap at MAX_PAGES
 *   4. Run all 7-category checks on every page
 *   5. Aggregate into SeoSiteReport (site score + page drill-downs)
 *
 * Returns an AuditReport (backward compat) with the SeoSiteReport
 * stored in the report structure.
 */
export async function runSeoAudit(
  input: SeoAuditInput
): Promise<AuditReport & { siteReport: SeoSiteReport }> {
  // 1. Normalize URL
  let url = input.websiteUrl.trim();
  if (!url.startsWith("http://") && !url.startsWith("https://")) {
    url = `https://${url}`;
  }

  const baseOrigin = new URL(url).origin;
  const baseHost = safeHostname(url);

  // 2. Fetch the homepage
  console.log("[SEO] Fetching homepage:", url);
  const homeFetched = await fetchPage(url);
  if (homeFetched.error && !homeFetched.html) {
    const fr = failedReport(`Could not fetch ${url}: ${homeFetched.error}`);
    return { ...fr, siteReport: failedSiteReport(fr.summary) };
  }

  // 3. Fetch robots.txt + sitemap.xml (site-wide, only once)
  const robotsResult = await fetchText(`${baseOrigin}/robots.txt`);
  const robots: RobotsTxtData | null =
    robotsResult.status === 200 && robotsResult.text.length > 0
      ? parseRobotsTxt(robotsResult.text)
      : null;

  const sitemapUrl = robots?.sitemapUrls[0] ?? `${baseOrigin}/sitemap.xml`;
  const sitemapResult = await fetchText(sitemapUrl);
  const sitemapIsValid =
    (sitemapResult.status === 200 &&
      sitemapResult.text.includes("<urlset")) ||
    sitemapResult.text.includes("<sitemapindex");
  const sitemapUrlCount = (sitemapResult.text.match(/<loc>/g) ?? []).length;
  const sitemapStatus = {
    exists: sitemapResult.status === 200 && sitemapIsValid,
    urlCount: sitemapUrlCount,
    isValid: sitemapIsValid,
  };

  // 4. Discover pages from homepage
  const navLinks = extractNavLinks(homeFetched.html, homeFetched.finalUrl);
  const homeInternalLinks = extractInternalLinks(
    homeFetched.html,
    homeFetched.finalUrl
  );

  console.log(
    `[SEO] Homepage discovered: ${navLinks.length} nav/footer links, ${homeInternalLinks.length} internal links`
  );

  // Build ordered URL queue: nav/footer first, then homepage internal links
  const urlQueue = new Map<string, DiscoveredLink>();
  const homeNorm = normalizeUrl(homeFetched.finalUrl);

  // Homepage is always first — added manually
  urlQueue.set(homeNorm, {
    url: homeFetched.finalUrl,
    text: "Homepage",
    source: "homepage" as DiscoveredLink["source"],
  });

  // Nav/footer pages (priority)
  for (const link of navLinks) {
    const norm = normalizeUrl(link.url);
    if (norm === homeNorm) continue;
    if (!urlQueue.has(norm) && urlQueue.size < MAX_PAGES) {
      urlQueue.set(norm, link);
    }
  }

  // Homepage internal links (fill remaining slots)
  for (const link of homeInternalLinks) {
    const norm = normalizeUrl(link.url);
    if (urlQueue.has(norm)) continue;
    if (urlQueue.size >= MAX_PAGES) break;
    urlQueue.set(norm, link);
  }

  // 5. Fetch nav/footer pages to discover their internal links
  const navUrls = navLinks
    .map((l) => l.url)
    .filter((u) => normalizeUrl(u) !== homeNorm);

  let navFetched = new Map<string, FetchedPage>();
  if (navUrls.length > 0) {
    console.log(`[SEO] Fetching ${navUrls.length} nav/footer pages...`);
    navFetched = await fetchPagesBatch(navUrls);
  }

  // Extract internal links from nav/footer pages
  for (const [, fetchedNav] of navFetched) {
    if (fetchedNav.error || !fetchedNav.html) continue;
    const subLinks = extractInternalLinks(fetchedNav.html, fetchedNav.finalUrl);
    for (const link of subLinks) {
      const norm = normalizeUrl(link.url);
      if (urlQueue.has(norm)) continue;
      if (urlQueue.size >= MAX_PAGES) break;
      urlQueue.set(norm, { ...link, source: "internal-link" });
    }
  }

  console.log(`[SEO] Total pages to audit: ${urlQueue.size}`);

  // 6. Fetch remaining pages not yet fetched
  const alreadyFetched = new Map<string, FetchedPage>();
  alreadyFetched.set(homeNorm, homeFetched);
  for (const [norm, fp] of navFetched) {
    alreadyFetched.set(norm, fp);
  }

  const toFetch = [...urlQueue.entries()]
    .filter(([norm]) => !alreadyFetched.has(norm))
    .map(([, link]) => link.url);

  if (toFetch.length > 0) {
    console.log(`[SEO] Fetching ${toFetch.length} additional pages...`);
    const additionalPages = await fetchPagesBatch(toFetch);
    for (const [norm, fp] of additionalPages) {
      alreadyFetched.set(norm, fp);
    }
  }

  // 7. Run checks on each page
  const pageReports: PageReport[] = [];
  const allSiteChecks: AuditCheckResult[] = [];

  for (const [norm, link] of urlQueue) {
    const fetched = alreadyFetched.get(norm);
    if (!fetched || (fetched.error && !fetched.html)) {
      pageReports.push({
        url: link.url,
        label: link.text || pathLabel(link.url, baseOrigin),
        source: link.source as PageReport["source"],
        score: 0,
        grade: "F",
        totalChecks: 0,
        passCount: 0,
        warningCount: 0,
        failCount: 0,
        skippedCount: 0,
        manualCount: 0,
        checks: [],
        categoryScores: {},
        fetchStatus: fetched?.status ?? 0,
        responseTimeMs: fetched?.responseTimeMs ?? 0,
        error: fetched?.error ?? "Could not fetch page",
      });
      continue;
    }

    const page = parsePage(fetched.html, fetched.finalUrl);
    page.securityHeaders = {
      "strict-transport-security":
        fetched.headers["strict-transport-security"] ?? null,
      "content-security-policy":
        fetched.headers["content-security-policy"] ?? null,
      "x-content-type-options":
        fetched.headers["x-content-type-options"] ?? null,
      "x-frame-options": fetched.headers["x-frame-options"] ?? null,
      "referrer-policy": fetched.headers["referrer-policy"] ?? null,
    };

    // Technical checks only run on homepage (site-wide: robots, sitemap, etc.)
    // Per-page checks run on every page
    const isHomepage = norm === homeNorm;
    const pageChecks: AuditCheckResult[] = [];

    if (isHomepage) {
      // Full check suite on homepage (including technical)
      pageChecks.push(
        ...runTechnicalChecks(page, fetched, robots, sitemapStatus),
      );
    }
    // These run on every page
    pageChecks.push(
      ...runContentChecks(page, fetched.html),
      ...runOnPageChecks(page, fetched.finalUrl),
      ...runSchemaChecks(page),
      ...runPerformanceChecks(page, fetched.html, fetched),
      ...runImageChecks(page),
      ...runAIReadinessChecks(page, fetched.html, robots, fetched.finalUrl),
    );

    // Prefix each checkId with a page index for uniqueness across pages
    const pageIdx = pageReports.length;
    const prefixedChecks = pageChecks.map((c) => ({
      ...c,
      checkId: `P${pageIdx}-${c.checkId}`,
      details: `[${link.text || pathLabel(link.url, baseOrigin)}] ${c.details}`,
    }));

    // Score this page
    const pageReport = scorePageReport(
      pageChecks, // Use originals for scoring (no prefix)
      link.url,
      link.text || pathLabel(link.url, baseOrigin),
      link.source as PageReport["source"],
      fetched
    );
    pageReports.push(pageReport);

    // Add prefixed checks to site-wide flat list
    allSiteChecks.push(...prefixedChecks);
  }

  // 8. Aggregate site-level scores
  const siteReport = aggregateSiteReport(
    pageReports,
    allSiteChecks,
    url
  );

  // 9. Build backward-compatible AuditReport
  const auditReport: AuditReport = {
    score: siteReport.score,
    grade: siteReport.grade,
    totalChecks: siteReport.totalChecks,
    passCount: siteReport.passCount,
    warningCount: siteReport.warningCount,
    failCount: siteReport.failCount,
    skippedCount: siteReport.skippedCount,
    manualCount: siteReport.manualCount,
    checks: siteReport.checks,
    summary: siteReport.summary,
    quickWins: siteReport.quickWinChecks,
    categoryScores: siteReport.categoryScores,
  };

  return { ...auditReport, siteReport };
}

// ─── Per-Page Scoring ────────────────────────────────────

function scorePageReport(
  checks: AuditCheckResult[],
  url: string,
  label: string,
  source: PageReport["source"],
  fetched: FetchedPage
): PageReport {
  let passCount = 0, warningCount = 0, failCount = 0, skippedCount = 0, manualCount = 0;
  for (const c of checks) {
    switch (c.result) {
      case "pass": passCount++; break;
      case "warning": warningCount++; break;
      case "fail": failCount++; break;
      case "skipped": skippedCount++; break;
      case "manual": manualCount++; break;
    }
  }

  const categoryScores: Record<string, number> = {};
  const categoryMaxScores: Record<string, number> = {};

  for (const c of checks) {
    if (c.result === "manual" || c.result === "skipped") continue;
    const weight = SEVERITY_MULTIPLIER[c.severity];
    categoryScores[c.category] = categoryScores[c.category] ?? 0;
    categoryMaxScores[c.category] = categoryMaxScores[c.category] ?? 0;
    if (c.result === "pass") {
      categoryScores[c.category] += weight;
    } else if (c.result === "warning") {
      categoryScores[c.category] += weight * 0.5;
    }
    categoryMaxScores[c.category] += weight;
  }

  const normalizedCategories: Record<string, number> = {};
  for (const cat of Object.keys(categoryScores)) {
    normalizedCategories[cat] =
      safeDiv(categoryScores[cat], categoryMaxScores[cat]) * 100;
  }

  let totalScore = 0, totalWeight = 0;
  for (const [cat, catScore] of Object.entries(normalizedCategories)) {
    const w = CATEGORY_WEIGHTS[cat] ?? 0.05;
    totalScore += catScore * w;
    totalWeight += w;
  }

  const score = totalWeight > 0 ? Math.round(safeDiv(totalScore, totalWeight)) : 0;
  const grade = gradeFromScore(score);

  return {
    url,
    label,
    source,
    score,
    grade,
    totalChecks: checks.length,
    passCount,
    warningCount,
    failCount,
    skippedCount,
    manualCount,
    checks,
    categoryScores: normalizedCategories,
    fetchStatus: fetched.status,
    responseTimeMs: fetched.responseTimeMs,
  };
}

// ─── Site-Level Aggregation ──────────────────────────────

function aggregateSiteReport(
  pages: PageReport[],
  allChecks: AuditCheckResult[],
  websiteUrl: string
): SeoSiteReport {
  const validPages = pages.filter((p) => !p.error && p.totalChecks > 0);

  // Weighted average site score (homepage counts 2x)
  let weightedSum = 0;
  let weightTotal = 0;
  for (const p of validPages) {
    const w = p.source === "homepage" ? 2 : 1;
    weightedSum += p.score * w;
    weightTotal += w;
  }
  const siteScore = weightTotal > 0 ? Math.round(weightedSum / weightTotal) : 0;
  const siteGrade = gradeFromScore(siteScore);

  // Aggregate counts
  let totalChecks = 0, passCount = 0, warningCount = 0, failCount = 0, skippedCount = 0, manualCount = 0;
  for (const p of pages) {
    totalChecks += p.totalChecks;
    passCount += p.passCount;
    warningCount += p.warningCount;
    failCount += p.failCount;
    skippedCount += p.skippedCount;
    manualCount += p.manualCount;
  }

  // Aggregate category scores (average across pages)
  const catSums: Record<string, number> = {};
  const catCounts: Record<string, number> = {};
  for (const p of validPages) {
    for (const [cat, score] of Object.entries(p.categoryScores)) {
      catSums[cat] = (catSums[cat] ?? 0) + score;
      catCounts[cat] = (catCounts[cat] ?? 0) + 1;
    }
  }
  const categoryScores: Record<string, number> = {};
  for (const cat of Object.keys(catSums)) {
    categoryScores[cat] = Math.round(catSums[cat] / catCounts[cat]);
  }

  // Find top opportunities: failing checks that appear on multiple pages
  const issueMap = new Map<
    string,
    {
      category: string;
      description: string;
      severity: Severity;
      pages: Set<string>;
      recommendation: string;
      isQuickWin: boolean;
      estimatedFixMinutes: number;
    }
  >();

  for (const p of validPages) {
    for (const c of p.checks) {
      if (c.result !== "fail" && c.result !== "warning") continue;
      // Use the original checkId (strip page prefix for grouping)
      const key = c.checkId;
      if (!issueMap.has(key)) {
        issueMap.set(key, {
          category: c.category,
          description: c.description,
          severity: c.severity,
          pages: new Set(),
          recommendation: c.recommendation,
          isQuickWin: c.isQuickWin,
          estimatedFixMinutes: c.estimatedFixMinutes,
        });
      }
      issueMap.get(key)!.pages.add(p.url);
    }
  }

  // Sort by impact: severity * affected pages
  const opportunities = [...issueMap.entries()]
    .map(([, v]) => ({
      category: v.category,
      description: v.description,
      severity: v.severity,
      affectedPages: [...v.pages],
      affectedPageCount: v.pages.size,
      recommendation: v.recommendation,
      isQuickWin: v.isQuickWin,
      estimatedFixMinutes: v.estimatedFixMinutes,
    }))
    .sort(
      (a, b) =>
        SEVERITY_MULTIPLIER[b.severity] * b.affectedPageCount -
        SEVERITY_MULTIPLIER[a.severity] * a.affectedPageCount
    );

  const topOpportunities = opportunities.slice(0, 15);
  const quickWins = opportunities
    .filter((o) => o.isQuickWin)
    .slice(0, 10);

  // Build action plan
  const actionPlan = buildActionPlan(
    topOpportunities,
    quickWins,
    categoryScores,
    pages.length,
    siteScore
  );

  // Quick win checks (flat, backward compat)
  const quickWinChecks = allChecks.filter((c) => c.isQuickWin);

  const summary = generateSiteSummary(
    websiteUrl,
    siteScore,
    siteGrade,
    pages.length,
    validPages.length,
    passCount,
    warningCount,
    failCount,
    manualCount,
    topOpportunities.length,
    quickWins.length,
    totalChecks
  );

  return {
    score: siteScore,
    grade: siteGrade,
    pagesCrawled: pages.length,
    totalChecks,
    passCount,
    warningCount,
    failCount,
    skippedCount,
    manualCount,
    categoryScores,
    topOpportunities,
    quickWins,
    actionPlan,
    pages,
    summary,
    checks: allChecks,
    quickWinChecks,
  };
}

// ─── Action Plan Builder ─────────────────────────────────

function buildActionPlan(
  topOpportunities: SiteOpportunity[],
  quickWins: SiteOpportunity[],
  categoryScores: Record<string, number>,
  totalPages: number,
  siteScore: number
): string[] {
  const plan: string[] = [];

  // Phase 1: Quick wins
  if (quickWins.length > 0) {
    plan.push(
      `PHASE 1 — QUICK WINS (${quickWins.length} items, implement first for immediate impact):`
    );
    for (const qw of quickWins.slice(0, 5)) {
      plan.push(
        `  • [${qw.severity.toUpperCase()}] ${qw.description} — affects ${qw.affectedPageCount}/${totalPages} pages. ${qw.recommendation} (~${qw.estimatedFixMinutes} min)`
      );
    }
  }

  // Phase 2: Critical/high severity issues
  const critical = topOpportunities.filter(
    (o) => o.severity === "critical" && !o.isQuickWin
  );
  if (critical.length > 0) {
    plan.push(
      `PHASE 2 — CRITICAL FIXES (${critical.length} items, address urgently):`
    );
    for (const c of critical.slice(0, 5)) {
      plan.push(
        `  • ${c.description} — affects ${c.affectedPageCount}/${totalPages} pages. ${c.recommendation}`
      );
    }
  }

  // Phase 3: Category improvements (weakest categories first)
  const weakCategories = Object.entries(categoryScores)
    .filter(([, score]) => score < 70)
    .sort(([, a], [, b]) => a - b);

  if (weakCategories.length > 0) {
    plan.push(
      `PHASE 3 — CATEGORY IMPROVEMENTS (focus on weakest areas):`
    );
    for (const [cat, score] of weakCategories.slice(0, 4)) {
      const catIssues = topOpportunities.filter((o) => o.category === cat);
      plan.push(
        `  • ${cat} (${Math.round(score)}/100): ${catIssues.length} opportunities — ${catIssues[0]?.recommendation ?? "Review and optimize"}`
      );
    }
  }

  // Phase 4: Ongoing monitoring
  plan.push(
    `PHASE 4 — ONGOING: Re-audit monthly. Current site score: ${siteScore}/100 across ${totalPages} pages.`
  );

  return plan;
}

// ─── Scoring (site-level backward compat) ────────────────

function scoreReport(checks: AuditCheckResult[]): AuditReport {
  let passCount = 0;
  let warningCount = 0;
  let failCount = 0;
  let skippedCount = 0;
  let manualCount = 0;

  for (const c of checks) {
    switch (c.result) {
      case "pass": passCount++; break;
      case "warning": warningCount++; break;
      case "fail": failCount++; break;
      case "skipped": skippedCount++; break;
      case "manual": manualCount++; break;
    }
  }

  const categoryScores: Record<string, number> = {};
  const categoryMaxScores: Record<string, number> = {};

  for (const c of checks) {
    if (c.result === "manual" || c.result === "skipped") continue;

    const weight = SEVERITY_MULTIPLIER[c.severity];
    categoryScores[c.category] = categoryScores[c.category] ?? 0;
    categoryMaxScores[c.category] = categoryMaxScores[c.category] ?? 0;

    if (c.result === "pass") {
      categoryScores[c.category] += weight;
    } else if (c.result === "warning") {
      categoryScores[c.category] += weight * 0.5;
    }

    categoryMaxScores[c.category] += weight;
  }

  const normalizedCategories: Record<string, number> = {};
  for (const cat of Object.keys(categoryScores)) {
    normalizedCategories[cat] =
      safeDiv(categoryScores[cat], categoryMaxScores[cat]) * 100;
  }

  let totalScore = 0;
  let totalWeight = 0;
  for (const [cat, catScore] of Object.entries(normalizedCategories)) {
    const w = CATEGORY_WEIGHTS[cat] ?? 0.05;
    totalScore += catScore * w;
    totalWeight += w;
  }

  const score =
    totalWeight > 0 ? Math.round(safeDiv(totalScore, totalWeight)) : 0;
  const grade = gradeFromScore(score);

  const quickWins = checks
    .filter((c) => c.isQuickWin)
    .sort(
      (a, b) =>
        SEVERITY_MULTIPLIER[b.severity] - SEVERITY_MULTIPLIER[a.severity]
    );

  const criticalIssues = checks.filter(
    (c) => c.result === "fail" && c.severity === "critical"
  );

  const summary = generateSeoSummary(
    score,
    grade,
    passCount,
    warningCount,
    failCount,
    manualCount,
    criticalIssues.length,
    quickWins.length,
    checks.length
  );

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

function generateSeoSummary(
  score: number,
  grade: Grade,
  pass: number,
  warn: number,
  fail: number,
  manual: number,
  critical: number,
  quickWins: number,
  totalChecks: number
): string {
  const gradeDescriptions: Record<Grade, string> = {
    A: "Excellent — minor optimizations only",
    B: "Good — some improvement opportunities exist",
    C: "Average — notable issues need attention",
    D: "Below Average — significant problems present",
    F: "Critical — urgent intervention required",
  };

  return `SterlingX SEO Health Score: ${score}/100 (Grade ${grade})

${gradeDescriptions[grade]}

Results: ${pass} passed, ${warn} warnings, ${fail} failed${critical > 0 ? ` (${critical} CRITICAL)` : ""}${manual > 0 ? `, ${manual} manual review` : ""}
Quick Wins Available: ${quickWins} high-impact fixes

This SEO audit covers ${totalChecks} checks across 7 categories: Technical SEO, Content Quality, On-Page SEO, Schema & Structured Data, Performance, Images, and AI Search Readiness. Methodology based on Google Quality Rater Guidelines (Sept 2025), Core Web Vitals (INP, LCP, CLS), and Generative Engine Optimization (GEO) best practices.`;
}

function generateSiteSummary(
  websiteUrl: string,
  score: number,
  grade: Grade,
  totalPages: number,
  validPages: number,
  pass: number,
  warn: number,
  fail: number,
  manual: number,
  topOpps: number,
  quickWins: number,
  totalChecks: number
): string {
  const gradeDescriptions: Record<Grade, string> = {
    A: "Excellent — minor optimizations only",
    B: "Good — some improvement opportunities exist",
    C: "Average — notable issues need attention",
    D: "Below Average — significant problems present",
    F: "Critical — urgent intervention required",
  };

  return `SterlingX SEO Site Audit: ${websiteUrl}
Site Health Score: ${score}/100 (Grade ${grade})

${gradeDescriptions[grade]}

Pages Crawled: ${totalPages} (${validPages} successfully analyzed)
Total Checks: ${totalChecks} across all pages
Results: ${pass} passed, ${warn} warnings, ${fail} failed${manual > 0 ? `, ${manual} manual review` : ""}
Top Opportunities: ${topOpps} site-wide issues identified
Quick Wins: ${quickWins} high-impact fixes available

This multi-page SEO audit crawls homepage, header/footer navigation pages, and internal links to provide a comprehensive site health assessment. Each page is scored across 7 categories: Technical SEO, Content Quality, On-Page SEO, Schema & Structured Data, Performance, Images, and AI Search Readiness.`;
}

function failedReport(message: string): AuditReport {
  return {
    score: 0,
    grade: "F",
    totalChecks: 0,
    passCount: 0,
    warningCount: 0,
    failCount: 0,
    skippedCount: 0,
    manualCount: 0,
    checks: [],
    summary: `SEO audit could not be completed. ${message}`,
    quickWins: [],
    categoryScores: {},
  };
}

function failedSiteReport(message: string): SeoSiteReport {
  return {
    score: 0,
    grade: "F",
    pagesCrawled: 0,
    totalChecks: 0,
    passCount: 0,
    warningCount: 0,
    failCount: 0,
    skippedCount: 0,
    manualCount: 0,
    categoryScores: {},
    topOpportunities: [],
    quickWins: [],
    actionPlan: [],
    pages: [],
    summary: `SEO audit could not be completed. ${message}`,
    checks: [],
    quickWinChecks: [],
  };
}
