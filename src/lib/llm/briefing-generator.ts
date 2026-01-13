import { BriefingInput, GeneratedBriefing } from "@/types/ingestion";
import { callGroq } from "./groq";
import { getRecentMacroNews } from "@/lib/ingestion/macro-news";

interface MacroNewsItem {
  title: string;
  summary?: string;
  url: string;
  sourceName: string;
  category: string;
  publishedAt: Date;
  relevanceScore: number;
  whyItMatters?: string;
}

/**
 * Timezone handling
 * - Cron/Vercel often runs in UTC; you want the "business day" in your timezone.
 * - Set BRIEFING_TIMEZONE in .env.local to your timezone (e.g., America/New_York for EST).
 */
const BRIEFING_TZ = process.env.BRIEFING_TIMEZONE || "America/New_York";

function getTzParts(date: Date, timeZone: string) {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hourCycle: "h23",
  }).formatToParts(date);

  const map: Record<string, string> = {};
  for (const p of parts) {
    if (p.type !== "literal") map[p.type] = p.value;
  }
  return {
    year: Number(map.year),
    month: Number(map.month),
    day: Number(map.day),
    hour: Number(map.hour),
    minute: Number(map.minute),
    second: Number(map.second),
  };
}

/**
 * Returns a Date that represents the same *calendar day* in the target timezone,
 * anchored to midnight UTC for stable comparisons/formatting.
 *
 * Example: If it's Jan 11 in America/Chicago, this returns a Date whose UTC date is Jan 11.
 */
function normalizeToTzCalendarDay(date: Date, timeZone: string): Date {
  const p = getTzParts(date, timeZone);
  // Anchor at 00:00:00 UTC of that calendar day
  return new Date(Date.UTC(p.year, p.month - 1, p.day, 0, 0, 0, 0));
}

function formatLongDateInTz(date: Date, timeZone: string): string {
  return new Intl.DateTimeFormat("en-US", {
    timeZone,
    weekday: "long",
    year: "numeric",
    month: "long",
    day: "numeric",
  }).format(date);
}

export function formatBriefingSlugMMDDYYYY(date: Date, timeZone = BRIEFING_TZ): string {
  const p = getTzParts(date, timeZone);
  const mm = String(p.month).padStart(2, "0");
  const dd = String(p.day).padStart(2, "0");
  const yyyy = String(p.year);
  return `${mm}-${dd}-${yyyy}`;
}

// -------- source governance --------

const PRIMARY_SOURCES = new Set<string>([
  "Bloomberg",
  "Reuters",
  "Financial Times",
  "The Wall Street Journal",
  "Wall Street Journal",
  "WSJ",
  "The Economist",
  "Barron's",
  "Barrons",
  "CNBC",
  "CNBC Technology",
  "MarketWatch",
]);

// REDUCED: Prevent prompt bloat (was 5/5, now 3/2)
const MAX_PRIMARY_PER_ASSET = 3;
const MAX_CONTEXTUAL_PER_ASSET = 2;
const MAX_TOTAL_ARTICLES = 25; // Further reduced from 40 to ensure reliable prompt size

// -------- helpers --------

function normalizeTitle(t: string): string {
  return (t || "")
    .toLowerCase()
    .replace(/&amp;/g, "&")
    .replace(/[^a-z0-9\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function dedupeNews<T extends { title: string }>(items: T[]): T[] {
  const seen = new Set<string>();
  const out: T[] = [];
  for (const it of items) {
    const key = normalizeTitle(it.title);
    if (!key) continue;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(it);
  }
  return out;
}

// REDUCED: Snippet length (was 420/220, now 280/140)
function clamp(s?: string, max = 280): string | undefined {
  if (!s) return undefined;
  const t = String(s).trim();
  if (!t) return undefined;
  return t.length > max ? t.slice(0, max) + "…" : t;
}

function calculateArticleLimits(sortedAssets: any[]) {
  const totalArticlesAvailable = sortedAssets.reduce(
    (sum, a) => sum + (a.newsItems?.length || 0),
    0
  );

  if (totalArticlesAvailable <= MAX_TOTAL_ARTICLES) {
    // Under limit - use full per-asset limits
    return {
      primaryLimit: MAX_PRIMARY_PER_ASSET,
      contextualLimit: MAX_CONTEXTUAL_PER_ASSET,
    };
  }

  // Over limit - reduce proportionally
  const articlesPerAsset = Math.floor(MAX_TOTAL_ARTICLES / sortedAssets.length);
  const minPerAsset = Math.max(2, articlesPerAsset); // At least 2 per asset

  // Split between primary (60%) and contextual (40%)
  const primaryLimit = Math.max(1, Math.floor(minPerAsset * 0.6));
  const contextualLimit = Math.max(1, minPerAsset - primaryLimit);

  console.log(
    `[Briefing] Reducing articles: ${totalArticlesAvailable} → ${MAX_TOTAL_ARTICLES}. ` +
    `Per-asset: ${primaryLimit} primary + ${contextualLimit} contextual`
  );

  return { primaryLimit, contextualLimit };
}

function splitPrimaryContextual(
  newsItems: any[],
  primaryLimit = MAX_PRIMARY_PER_ASSET,
  contextualLimit = MAX_CONTEXTUAL_PER_ASSET
) {
  const deduped = dedupeNews(newsItems);

  const primary = deduped.filter((n) => PRIMARY_SOURCES.has(n.sourceName));
  const contextual = deduped.filter((n) => !PRIMARY_SOURCES.has(n.sourceName));

  const sortByScoreThenRecency = (a: any, b: any) => {
    const scoreDiff = (b.relevanceScore ?? 0) - (a.relevanceScore ?? 0);
    if (Math.abs(scoreDiff) > 0.05) return scoreDiff;
    return new Date(b.publishedAt).getTime() - new Date(a.publishedAt).getTime();
  };

  primary.sort(sortByScoreThenRecency);
  contextual.sort(sortByScoreThenRecency);

  return {
    primary: primary.slice(0, primaryLimit),
    contextual: contextual.slice(0, contextualLimit),
  };
}

/**
 * ROBUST JSON EXTRACTOR
 * Handles: markdown fences, extra prose, partial JSON, nested braces
 */
function extractJson<T>(text: string): T | null {
  if (!text) return null;

  // 1. Remove markdown code fences
  let cleaned = text
    .trim()
    .replace(/^```json\s*/i, "")
    .replace(/^```\s*/i, "")
    .replace(/```$/i, "")
    .trim();

  // 2. Try direct parse first (fast path)
  try {
    return JSON.parse(cleaned) as T;
  } catch {
    // Continue to extraction
  }

  // 3. Extract first top-level JSON object from text (handles extra prose)
  const jsonObjectMatch = cleaned.match(/\{[\s\S]*\}/);
  if (jsonObjectMatch) {
    try {
      return JSON.parse(jsonObjectMatch[0]) as T;
    } catch {
      // Continue to array extraction
    }
  }

  // 4. Try array extraction (in case model wrapped in array)
  const jsonArrayMatch = cleaned.match(/\[[\s\S]*\]/);
  if (jsonArrayMatch) {
    try {
      const parsed = JSON.parse(jsonArrayMatch[0]);
      if (Array.isArray(parsed) && parsed.length > 0) {
        return parsed[0] as T;
      }
    } catch {
      // Give up
    }
  }

  return null;
}

function wordCount(s: string): number {
  return (s || "").trim().split(/\s+/).filter(Boolean).length;
}

// -------- prompts --------

// SYSTEM PROMPT: Explicit output schema to prevent input echoing
const SYSTEM = `You are a professional financial news analyst writing neutral daily briefings for investors.

Your task: For each asset and its news articles, write a brief "why_it_matters" explanation (1-2 sentences) based on the article snippet.

OUTPUT SCHEMA (EXACT JSON STRUCTURE REQUIRED):
{
  "marketOverview": "string (2-3 sentences about overall market trends)",
  "assetSummaries": [
    {
      "symbol": "string (asset ticker symbol)",
      "articles": [
        {
          "title": "string (article title)",
          "source": "string (source name)",
          "why_it_matters": "string (1-2 sentences explaining why this article matters to investors, grounded in the snippet)"
        }
      ]
    }
  ],
  "notableHeadlines": [
    {
      "title": "string",
      "url": "string",
      "source": "string",
      "why_it_matters": "string (1 sentence, grounded in snippet/category)",
      "publishedAt": "string (optional)",
      "snippet": "string (optional)"
    }
  ]
}

CRITICAL RULES:
- Output MUST contain ONLY these 3 top-level keys: marketOverview, assetSummaries, notableHeadlines
- DO NOT include: briefingDate, timezone, marketContext, assets, macroHeadlines, instructions, or any other input fields
- Be factual and neutral. No investment advice, no buy/sell, no price targets
- Ground explanations in the article snippet provided
- Return ONLY valid JSON. NO markdown fences. Start with { and end with }`;

type LlmJson = {
  marketOverview: string;
  assetSummaries: Array<{
    symbol: string;
    articles: Array<{
      title: string;
      source: string;
      why_it_matters: string;
    }>;
  }>;
  notableHeadlines: Array<{
    title: string;
    url: string;
    source: string;
    why_it_matters: string;
    publishedAt?: string;
    snippet?: string;
  }>;
};

export async function generateDailyBriefing(
  input: BriefingInput,
  _usePremiumModel: boolean = false,
  newsWindowDays: number = 1
): Promise<GeneratedBriefing> {
  const startTime = Date.now();

  /**
   * Normalize the briefing date to a stable calendar day in BRIEFING_TZ.
   * This fixes "Jan 10 vs Jan 11".
   */
  const normalizedBriefingDay = normalizeToTzCalendarDay(input.briefingDate, BRIEFING_TZ);

  // Filtering window: [day - newsWindowDays, day end] in normalized-day space
  const cutoff = new Date(normalizedBriefingDay);
  cutoff.setUTCDate(cutoff.getUTCDate() - newsWindowDays);

  const endOfWindow = new Date(normalizedBriefingDay);
  endOfWindow.setUTCHours(23, 59, 59, 999);

  const filteredAssets = input.assets.map((asset) => ({
    ...asset,
    newsItems: dedupeNews(asset.newsItems).filter((n: any) => {
      if (!n?.publishedAt) return false;
      const published = new Date(n.publishedAt);
      // Compare using actual timestamps; window boundaries are stable now.
      return published >= cutoff && published <= endOfWindow;
    }),
  }));

  const filteredInput: BriefingInput = { ...input, briefingDate: normalizedBriefingDay, assets: filteredAssets };

  let macroNews: MacroNewsItem[] = [];
  try {
    macroNews = await getRecentMacroNews(newsWindowDays * 24, 12);
    console.log(`[Briefing] Fetched ${macroNews.length} macro news items`);
  } catch (err) {
    console.error("[Briefing] Error fetching macro news:", err);
  }

  const sortedAssets = [...filteredInput.assets].sort(
    (a: any, b: any) => (b.portfolioPercentage || 0) - (a.portfolioPercentage || 0)
  );

  // MAIN ATTEMPT: Full prompt
  try {
    return await attemptGroqBriefing(
      sortedAssets,
      macroNews,
      normalizedBriefingDay,
      filteredInput,
      newsWindowDays,
      startTime
    );
  } catch (mainError) {
    console.error("[Briefing] Main attempt failed:", mainError);

    // REPAIR ATTEMPT: Reduce input size (fewer assets or trim snippets further)
    console.log("[Briefing] Trying repair attempt with reduced input...");
    try {
      // Strategy: Take top 5 assets by portfolio % only
      const reducedAssets = sortedAssets.slice(0, 5);
      return await attemptGroqBriefing(
        reducedAssets,
        macroNews.slice(0, 3), // Also reduce macro news
        normalizedBriefingDay,
        { ...filteredInput, assets: reducedAssets },
        newsWindowDays,
        startTime
      );
    } catch (repairError) {
      console.error("[Briefing] Repair attempt also failed:", repairError);
      // Fall back to basic briefing
    return {
        ...generateBasicBriefing(filteredInput, newsWindowDays, macroNews),
        llmModel: "fallback",
      tokensUsed: 0,
      generationTimeMs: Date.now() - startTime,
    };
    }
  }
}

/**
 * Core Groq briefing generation logic (extracted for retry)
 */
async function attemptGroqBriefing(
  sortedAssets: any[],
  macroNews: MacroNewsItem[],
  normalizedBriefingDay: Date,
  filteredInput: BriefingInput,
  newsWindowDays: number,
  startTime: number
): Promise<GeneratedBriefing> {
  // Calculate dynamic limits based on total articles across all assets
  const { primaryLimit, contextualLimit } = calculateArticleLimits(sortedAssets);

  const assetsForModel = sortedAssets.map((asset: any) => {
    const { primary, contextual } = splitPrimaryContextual(
      asset.newsItems,
      primaryLimit,
      contextualLimit
    );

    return {
      symbol: asset.symbol,
      name: asset.name ?? null,
      portfolioPercentage: asset.portfolioPercentage ?? 0,

      currentPrice: asset.currentPrice ?? null,
      priceChangePct24h: asset.priceChangePct24h ?? null,
      priceChangePctMonth: asset.priceChangePctMonth ?? null,
      priceChangePctYear: asset.priceChangePctYear ?? null,
      evEbitda: asset.evEbitda ?? null,
      nextEarningsDate: asset.nextEarningsDate ?? null,

      primary: primary.map((n: any) => ({
        title: n.title,
        source: n.sourceName,
        publishedAt: new Date(n.publishedAt).toISOString(),
        snippet: clamp(n.summary, 180), // Further reduced from 280 to 180
        url: n.url ?? null,
      })),
      contextual: contextual.map((n: any) => ({
        title: n.title,
        source: n.sourceName,
        publishedAt: new Date(n.publishedAt).toISOString(),
        snippet: clamp(n.summary, 90), // Further reduced from 140 to 90
        url: n.url ?? null,
      })),
    };
  });

  const macroTop = [...macroNews]
    .sort((a, b) => (b.relevanceScore ?? 0) - (a.relevanceScore ?? 0))
    .slice(0, 5)
    .map((m) => ({
      title: m.title,
      url: m.url,
      source: m.sourceName,
      category: m.category,
      publishedAt: new Date(m.publishedAt).toISOString(),
      whyItMatters: m.whyItMatters ?? "",
      snippet: clamp(m.summary, 120), // Further reduced from 180 to 120
    }));

  const dateStr = formatLongDateInTz(normalizedBriefingDay, BRIEFING_TZ);

  const marketCtx = filteredInput.marketOverview
    ? {
        sp500Change: filteredInput.marketOverview.sp500Change,
        nasdaqChange: filteredInput.marketOverview.nasdaqChange,
        dowChange: filteredInput.marketOverview.dowChange,
      }
    : null;

  // Build readable text prompt instead of JSON.stringify to prevent input echoing
  const assetDescriptions = assetsForModel.map((asset, idx) => {
    const primaryArticles = asset.primary.map((art: any, i: number) =>
      `      ${i + 1}. [${art.source}] ${art.title}\n         Snippet: ${art.snippet || "N/A"}\n         Published: ${art.publishedAt}`
    ).join("\n");

    const contextualArticles = asset.contextual.map((art: any, i: number) =>
      `      ${i + 1}. [${art.source}] ${art.title}\n         Snippet: ${art.snippet || "N/A"}\n         Published: ${art.publishedAt}`
    ).join("\n");

    return `
ASSET ${idx + 1}: ${asset.symbol} - ${asset.name || "N/A"}
  Portfolio Weight: ${asset.portfolioPercentage?.toFixed(1) || 0}%
  Current Price: $${asset.currentPrice?.toFixed(2) || "N/A"}
  24h Change: ${asset.priceChangePct24h?.toFixed(2) || 0}%
  ${asset.nextEarningsDate ? `Next Earnings: ${asset.nextEarningsDate}` : ""}

  PRIMARY COVERAGE (${asset.primary.length} articles):
${primaryArticles || "    None"}

  BROADER COVERAGE (${asset.contextual.length} articles):
${contextualArticles || "    None"}
`;
  }).join("\n---\n");

  const macroDescription = macroTop.length > 0
    ? macroTop.map((m: any, idx: number) => `
${idx + 1}. [${m.source}] ${m.title}
   Category: ${m.category}
   Snippet: ${m.snippet || "N/A"}
   Published: ${m.publishedAt}
   URL: ${m.url}
`).join("\n")
    : "None";

  const USER = `BRIEFING DATE: ${dateStr} (${BRIEFING_TZ})

MARKET CONTEXT:
${marketCtx && marketCtx.sp500Change !== undefined && marketCtx.nasdaqChange !== undefined && marketCtx.dowChange !== undefined
  ? `  S&P 500: ${marketCtx.sp500Change >= 0 ? '+' : ''}${marketCtx.sp500Change.toFixed(2)}%
  NASDAQ: ${marketCtx.nasdaqChange >= 0 ? '+' : ''}${marketCtx.nasdaqChange.toFixed(2)}%
  Dow: ${marketCtx.dowChange >= 0 ? '+' : ''}${marketCtx.dowChange.toFixed(2)}%`
  : "  Market data unavailable"}

---
ASSETS TO ANALYZE (sorted by portfolio weight):
${assetDescriptions}

---
NOTABLE MACRO HEADLINES:
${macroDescription}

---
INSTRUCTIONS:
1. For EACH asset, analyze the articles provided and write a "why_it_matters" for each article
2. Write a 2-3 sentence marketOverview based on market context and overall themes
3. Include the top 5 macro headlines in notableHeadlines with why_it_matters
4. Output ONLY the JSON structure defined in the system prompt
5. DO NOT echo back the input data - transform it into the output schema`;

  const { text, modelUsed } = await callGroq(SYSTEM, USER, {
    jsonMode: true,
    temperature: 0.2,
    maxTokens: 3200, // Let LLM decide length
  });

  // DEBUG LOGGING
  console.log("[LLM raw head]", text.slice(0, 600));
  console.log("[LLM raw tail]", text.slice(-300));
  console.log("[LLM length]", text.length);

  const parsed = extractJson<LlmJson>(text);

  if (!parsed) {
    throw new Error(
      `Groq/Llama returned unparseable response. Length: ${text.length}. Head: ${text.slice(0, 200)}`
    );
  }

  // Validate structure
  if (!parsed.assetSummaries || !Array.isArray(parsed.assetSummaries)) {
    console.error("[LLM] Parsed JSON keys:", Object.keys(parsed));
    console.error("[LLM] Parsed JSON:", JSON.stringify(parsed, null, 2).slice(0, 500));
    throw new Error(
      `Groq/Llama returned JSON missing assetSummaries. Keys: ${Object.keys(parsed).join(", ")}`
    );
  }

  if (parsed.assetSummaries.length === 0) {
    throw new Error("Groq/Llama returned empty assetSummaries array.");
  }

  // Build asset summaries by concatenating all "why_it_matters" for each asset
  const assetSummaries = sortedAssets.map((asset: any) => {
    const llm = parsed.assetSummaries.find(
      (x) => x.symbol?.toUpperCase() === asset.symbol.toUpperCase()
    );

    // Concatenate all why_it_matters from articles
    let summary = "";
    if (llm?.articles && llm.articles.length > 0) {
      summary = llm.articles
        .map((article, idx) => {
          const prefix = idx === 0 ? "" : " ";
          return `${prefix}${article.source}: ${article.why_it_matters}`;
        })
        .join(" ");
    }

    // Fallback if no LLM summary
    if (!summary) {
      summary = buildFallbackAssetSummary(asset);
    }

    return {
    assetId: asset.assetId,
    symbol: asset.symbol,
    name: asset.name,
      summary: summary,
    newsCount: asset.newsItems.length,
      newsLinks: asset.newsItems.slice(0, 5).map((n: any) => ({
        title: n.title,
        url: n.url,
        source: n.sourceName,
        publishedAt: new Date(n.publishedAt).toISOString(),
      })),
    currentPrice: asset.currentPrice,
    priceChange: asset.priceChange24h,
    priceChangePercent: asset.priceChangePct24h,
    week52High: asset.week52High,
    week52Low: asset.week52Low,
      priceChangeMonth: asset.priceChangeMonth,
      priceChangePctMonth: asset.priceChangePctMonth,
      priceChangeYear: asset.priceChangeYear,
      priceChangePctYear: asset.priceChangePctYear,
      portfolioPercentage: asset.portfolioPercentage,
      portfolioAllocations: asset.portfolioAllocations?.map((a: any) => ({
        portfolioName: a.portfolioName,
        percentage: a.percentage,
      })),
      evEbitda: asset.evEbitda,
      nextEarningsDate: asset.nextEarningsDate,
    };
  });

  const notableHeadlines =
    parsed.notableHeadlines?.slice(0, 5).map((h) => ({
      title: h.title,
      url: h.url,
      source: h.source,
      why_it_matters: h.why_it_matters,
      publishedAt: h.publishedAt,
      snippet: h.snippet,
    })) ?? [];

  return {
    marketOverview: (parsed.marketOverview || "").trim() || "Market overview unavailable.",
    assetSummaries,
    notableHeadlines,
    // Keep text as JSON for debugging
    fullBriefingText: JSON.stringify(parsed, null, 2),
    fullBriefingHtml: "", // email uses React template from structured props
    llmModel: modelUsed,
    tokensUsed: 0,
    generationTimeMs: Date.now() - startTime,
  };
}

function buildFallbackAssetSummary(asset: any): string {
  const { primary, contextual } = splitPrimaryContextual(asset.newsItems || []);

  // Build PRIMARY COVERAGE section
  let primarySection = "PRIMARY COVERAGE: ";
  if (primary.length === 0) {
    primarySection += "Primary sources were limited in this window. ";
  } else {
    const primaryTitles = primary.slice(0, 3).map((x: any) => x.title);
    primarySection += `Coverage from authoritative sources includes ${primary.length} article${primary.length > 1 ? 's' : ''} discussing ${asset.symbol}. `;

    if (primaryTitles.length > 0) {
      primarySection += `Key topics include: ${primaryTitles.join("; ")}. `;
    }

    // Add price context if available
    if (asset.priceChangePct24h != null && asset.currentPrice != null) {
      const direction = asset.priceChangePct24h >= 0 ? "up" : "down";
      primarySection += `The stock is trading ${direction} ${Math.abs(asset.priceChangePct24h).toFixed(2)}% at $${Number(asset.currentPrice).toFixed(2)}. `;
    }

    if (asset.nextEarningsDate) {
      primarySection += `Next earnings are scheduled for ${asset.nextEarningsDate}. `;
    }
  }

  // Build BROADER COVERAGE section
  let broaderSection = "\n\nBROADER COVERAGE: ";
  if (contextual.length === 0) {
    broaderSection += "Limited additional coverage in this window.";
    } else {
    broaderSection += `Broader market coverage includes ${contextual.length} additional article${contextual.length > 1 ? 's' : ''} from various sources. `;

    const contextTitles = contextual.slice(0, 2).map((x: any) => x.title);
    if (contextTitles.length > 0) {
      broaderSection += `These sources discuss: ${contextTitles.join("; ")}.`;
    }
  }

  return primarySection + broaderSection;
}

/**
 * Fallback generator (non-LLM). Keeps emails/UI non-empty and contextual.
 */
export function generateBasicBriefing(
  input: BriefingInput,
  newsWindowDays: number = 1,
  macroNews: MacroNewsItem[] = []
): Omit<GeneratedBriefing, "llmModel" | "tokensUsed" | "generationTimeMs"> {
  const dateStr = formatLongDateInTz(input.briefingDate, BRIEFING_TZ);

  let marketOverviewText = `Market overview for ${dateStr}. `;
  if (input.marketOverview) {
    const bits: string[] = [];
    if (input.marketOverview.sp500Change !== undefined) bits.push(`S&P 500 ${input.marketOverview.sp500Change >= 0 ? "+" : ""}${input.marketOverview.sp500Change.toFixed(2)}%`);
    if (input.marketOverview.nasdaqChange !== undefined) bits.push(`NASDAQ ${input.marketOverview.nasdaqChange >= 0 ? "+" : ""}${input.marketOverview.nasdaqChange.toFixed(2)}%`);
    if (input.marketOverview.dowChange !== undefined) bits.push(`Dow ${input.marketOverview.dowChange >= 0 ? "+" : ""}${input.marketOverview.dowChange.toFixed(2)}%`);
    if (bits.length) marketOverviewText += bits.join(", ") + ".";
  }

  const sortedAssets = [...input.assets].sort(
    (a: any, b: any) => (b.portfolioPercentage || 0) - (a.portfolioPercentage || 0)
  );

  const assetSummaries = sortedAssets.map((asset: any) => ({
      assetId: asset.assetId,
      symbol: asset.symbol,
      name: asset.name,
    summary: buildFallbackAssetSummary(asset),
    newsCount: (asset.newsItems || []).length,
    newsLinks: (asset.newsItems || []).slice(0, 5).map((n: any) => ({
      title: n.title,
      url: n.url,
      source: n.sourceName,
      publishedAt: new Date(n.publishedAt).toISOString(),
    })),
      currentPrice: asset.currentPrice,
      priceChange: asset.priceChange24h,
      priceChangePercent: asset.priceChangePct24h,
      week52High: asset.week52High,
      week52Low: asset.week52Low,
    priceChangeMonth: asset.priceChangeMonth,
    priceChangePctMonth: asset.priceChangePctMonth,
    priceChangeYear: asset.priceChangeYear,
    priceChangePctYear: asset.priceChangePctYear,
    portfolioPercentage: asset.portfolioPercentage,
    portfolioAllocations: asset.portfolioAllocations?.map((a: any) => ({
      portfolioName: a.portfolioName,
      percentage: a.percentage,
    })),
    evEbitda: asset.evEbitda,
    nextEarningsDate: asset.nextEarningsDate,
  }));

  const notableHeadlines =
    macroNews.length > 0
      ? macroNews.slice(0, 5).map((news) => ({
        title: news.title,
        url: news.url,
        source: news.sourceName,
          why_it_matters: news.whyItMatters || news.category || "Market story",
          publishedAt: new Date(news.publishedAt).toISOString(),
          snippet: clamp(news.summary, 160),
        }))
      : [];

  return {
    marketOverview: marketOverviewText,
    assetSummaries,
    notableHeadlines,
    fullBriefingText: `Fallback briefing for ${dateStr}`,
    fullBriefingHtml: "",
  };
}

/**
 * A true empty briefing (used if you really have zero assets or no data).
 * Some routes import this; keep it stable and exported.
 */
export function generateEmptyBriefing(
  input: BriefingInput
): Omit<GeneratedBriefing, "llmModel" | "tokensUsed" | "generationTimeMs"> {
  const normalizedBriefingDay = normalizeToTzCalendarDay(input.briefingDate, BRIEFING_TZ);
  const dateStr = formatLongDateInTz(normalizedBriefingDay, BRIEFING_TZ);

  return {
    marketOverview: `No significant market news to report for ${dateStr}.`,
    assetSummaries: (input.assets || []).map((a: any) => ({
      assetId: a.assetId,
      symbol: a.symbol,
      name: a.name,
      summary: "No notable headlines were found in the selected window.",
      newsCount: 0,
      newsLinks: [],
    })),
    notableHeadlines: [],
    fullBriefingText: `Empty briefing for ${dateStr}`,
    fullBriefingHtml: "",
  };
}
