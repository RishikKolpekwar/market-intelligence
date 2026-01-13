/**
 * Normalized News Article Type
 * Common schema for articles from all sources
 */
export interface NormalizedArticle {
  // Source identification
  sourceId?: string;
  sourceName: string;
  externalId?: string;

  // Content
  title: string;
  summary?: string;
  content?: string;
  url: string;
  imageUrl?: string;
  author?: string;

  // Timing
  publishedAt: Date;

  // Categorization
  category?: string;
  tags?: string[];

  // Extracted entities
  mentionedSymbols?: string[];
  mentionedEntities?: string[];
}

/**
 * Raw article from NewsAPI
 */
export interface NewsAPIArticle {
  source: {
    id: string | null;
    name: string;
  };
  author: string | null;
  title: string;
  description: string | null;
  url: string;
  urlToImage: string | null;
  publishedAt: string;
  content: string | null;
}

/**
 * Raw article from Finnhub
 */
export interface FinnhubArticle {
  category: string;
  datetime: number;
  headline: string;
  id: number;
  image: string;
  related: string;
  source: string;
  summary: string;
  url: string;
}

/**
 * RSS Feed Item (from rss-parser)
 */
export interface RSSItem {
  title?: string;
  link?: string;
  pubDate?: string;
  content?: string;
  contentSnippet?: string;
  guid?: string;
  categories?: string[];
  creator?: string;
  isoDate?: string;
}

/**
 * Raw article from Tiingo
 */
export interface TiingoArticle {
  id: number;
  title: string;
  url: string;
  description: string;
  publishedDate: string;
  crawlDate: string;
  source: string;
  tickers: string[];
  tags: string[];
}

/**
 * Asset with relevance context for briefing
 */
export interface AssetWithNews {
  assetId: string;
  symbol: string;
  name: string;
  assetType: 'stock' | 'etf' | 'crypto' | 'index';
  currentPrice?: number;
  previousClose?: number;
  priceChange24h?: number;
  priceChangePct24h?: number;
  week52High?: number;
  week52Low?: number;
  importanceLevel: 'low' | 'normal' | 'high' | 'critical';
  newsItems: RelevantNewsItem[];
  // Portfolio metrics
  portfolioPercentage?: number;
  portfolioAllocations?: Array<{
    portfolioId: string;
    portfolioName: string;
    percentage: number;
  }>;
  // Historical price changes
  priceChangeMonth?: number;
  priceChangePctMonth?: number;
  priceChangeYear?: number;
  priceChangePctYear?: number;
  // Fundamental metrics
  evEbitda?: number | null;
  nextEarningsDate?: string | null;
}

/**
 * News item with relevance score
 */
export interface RelevantNewsItem {
  id: string;
  title: string;
  summary?: string;
  url: string;
  sourceName: string;
  publishedAt: Date;
  relevanceScore: number;
  matchType: 'symbol_mention' | 'keyword_match' | 'llm_inferred' | 'manual';
  matchedTerms: string[];
  sentiment?: 'positive' | 'negative' | 'neutral' | 'mixed';
}

/**
 * User briefing data for LLM generation
 */
export interface BriefingInput {
  userId: string;
  userEmail: string;
  userName?: string;
  briefingDate: Date;
  timezone: string;
  assets: AssetWithNews[];
  marketOverview?: {
    sp500Change?: number;
    nasdaqChange?: number;
    dowChange?: number;
  };
}

/**
 * Generated briefing output
 */
export interface GeneratedBriefing {
  marketOverview: string;
  assetSummaries: {
    assetId: string;
    symbol: string;
    name?: string;
    summary: string;
    newsCount: number;
    newsLinks?: {
      title: string;
      url: string;
      source: string;
      publishedAt: string;
    }[];
    // Price data
    currentPrice?: number;
    priceChange?: number;
    priceChangePercent?: number;
    week52High?: number;
    week52Low?: number;
    // Historical price changes
    priceChangeMonth?: number;
    priceChangePctMonth?: number;
    priceChangeYear?: number;
    priceChangePctYear?: number;
    // Portfolio metrics
    portfolioPercentage?: number;
    portfolioAllocations?: Array<{
      portfolioName: string;
      percentage: number;
    }>;
    // Fundamental metrics
    evEbitda?: number | null;
    nextEarningsDate?: string | null;
  }[];
  notableHeadlines: {
    title: string;
    url: string;
    source: string;
    why_it_matters?: string;
    // Legacy fields for backwards compatibility
    reason?: string;
    publishedAt?: string;
    snippet?: string;
  }[];
  fullBriefingText: string;
  fullBriefingHtml: string;
  llmModel: string;
  tokensUsed: number;
  generationTimeMs: number;
}

/**
 * Ingestion result from a single source
 */
export interface IngestionResult {
  sourceName: string;
  itemsFetched: number;
  itemsNew: number;
  itemsDuplicate: number;
  itemsFailed: number;
  errors?: string[];
  durationMs: number;
}

/**
 * Relevance match result
 */
export interface RelevanceMatch {
  assetId: string;
  matchType: 'symbol_mention' | 'keyword_match' | 'llm_inferred';
  relevanceScore: number;
  matchedTerms: string[];
}
