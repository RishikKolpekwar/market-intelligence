import Parser from 'rss-parser';
import { NormalizedArticle, RSSItem, IngestionResult } from '@/types/ingestion';
import { normalizeRSSItem, validateArticle, generateContentHash } from './normalizer';
import { createServerClient } from '@/lib/supabase/client';

// RSS Parser instance with extended timeout
const parser = new Parser({
  customFields: {
    item: ['media:content', 'dc:creator', 'media:thumbnail'],
  },
  timeout: 10000,
});

// Pre-configured financial RSS feeds - EXPANDED list
export const FINANCIAL_RSS_FEEDS = [
  // Major Business News
  {
    name: 'MarketWatch Top Stories',
    url: 'https://feeds.marketwatch.com/marketwatch/topstories/',
    credibility: 7,
  },
  // MarketWatch Stocks removed - returns 403 Forbidden
  {
    name: 'MarketWatch Breaking',
    url: 'https://feeds.marketwatch.com/marketwatch/marketpulse/',
    credibility: 7,
  },
  {
    name: 'Yahoo Finance',
    url: 'https://finance.yahoo.com/news/rssindex',
    credibility: 7,
  },
  {
    name: 'CNBC Top News',
    url: 'https://www.cnbc.com/id/100003114/device/rss/rss.html',
    credibility: 8,
  },
  {
    name: 'CNBC World',
    url: 'https://www.cnbc.com/id/100727362/device/rss/rss.html',
    credibility: 8,
  },
  {
    name: 'CNBC Investing',
    url: 'https://www.cnbc.com/id/15839069/device/rss/rss.html',
    credibility: 8,
  },
  {
    name: 'CNBC Technology',
    url: 'https://www.cnbc.com/id/19854910/device/rss/rss.html',
    credibility: 8,
  },
  {
    name: 'Investing.com News',
    url: 'https://www.investing.com/rss/news.rss',
    credibility: 6,
  },
  {
    name: 'Investing.com Stock News',
    url: 'https://www.investing.com/rss/news_301.rss',
    credibility: 6,
  },
  {
    name: 'SeekingAlpha Market News',
    url: 'https://seekingalpha.com/market_currents.xml',
    credibility: 6,
  },
  // SeekingAlpha Top Ideas removed - returns 404 Not Found
  // Reuters
  {
    name: 'Reuters Business',
    url: 'https://news.google.com/rss/search?q=site:reuters.com+business&hl=en-US&gl=US&ceid=US:en',
    credibility: 9,
  },
  // Bloomberg via Google News
  {
    name: 'Bloomberg Markets',
    url: 'https://news.google.com/rss/search?q=site:bloomberg.com+markets&hl=en-US&gl=US&ceid=US:en',
    credibility: 9,
  },
  // WSJ via Google News
  {
    name: 'WSJ Markets',
    url: 'https://news.google.com/rss/search?q=site:wsj.com+markets&hl=en-US&gl=US&ceid=US:en',
    credibility: 9,
  },
  // Barrons
  {
    name: 'Barrons',
    url: 'https://news.google.com/rss/search?q=site:barrons.com&hl=en-US&gl=US&ceid=US:en',
    credibility: 8,
  },
  
  // ========== MUTUAL FUND & ETF SPECIFIC FEEDS ==========
  // Fund Family News via Google News
  {
    name: 'Fidelity Funds News',
    url: 'https://news.google.com/rss/search?q=Fidelity+funds+OR+Fidelity+mutual+fund+OR+Fidelity+investment&hl=en-US&gl=US&ceid=US:en',
    credibility: 7,
  },
  {
    name: 'Vanguard Funds News',
    url: 'https://news.google.com/rss/search?q=Vanguard+funds+OR+Vanguard+ETF+OR+Vanguard+index+fund&hl=en-US&gl=US&ceid=US:en',
    credibility: 7,
  },
  {
    name: 'T Rowe Price News',
    url: 'https://news.google.com/rss/search?q=%22T.+Rowe+Price%22+OR+%22T+Rowe+Price%22+funds&hl=en-US&gl=US&ceid=US:en',
    credibility: 7,
  },
  {
    name: 'Schwab Funds News',
    url: 'https://news.google.com/rss/search?q=Schwab+funds+OR+Schwab+ETF+OR+Charles+Schwab+fund&hl=en-US&gl=US&ceid=US:en',
    credibility: 7,
  },
  {
    name: 'BlackRock iShares News',
    url: 'https://news.google.com/rss/search?q=BlackRock+OR+iShares+ETF&hl=en-US&gl=US&ceid=US:en',
    credibility: 8,
  },
  // ETF-specific news
  {
    name: 'ETF News',
    url: 'https://news.google.com/rss/search?q=ETF+OR+%22exchange+traded+fund%22&hl=en-US&gl=US&ceid=US:en',
    credibility: 6,
  },
  {
    name: 'Morningstar News',
    url: 'https://news.google.com/rss/search?q=site:morningstar.com&hl=en-US&gl=US&ceid=US:en',
    credibility: 8,
  },
  // Index Fund news
  {
    name: 'Index Fund News',
    url: 'https://news.google.com/rss/search?q=%22index+fund%22+OR+%22S%26P+500+fund%22+OR+%22total+market+fund%22&hl=en-US&gl=US&ceid=US:en',
    credibility: 6,
  },
  
  // Financial Times via Google News
  {
    name: 'Financial Times',
    url: 'https://news.google.com/rss/search?q=site:ft.com+markets&hl=en-US&gl=US&ceid=US:en',
    credibility: 9,
  },
  // Motley Fool
  {
    name: 'Motley Fool',
    url: 'https://www.fool.com/feeds/index.aspx',
    credibility: 6,
  },
  // Benzinga
  {
    name: 'Benzinga',
    url: 'https://www.benzinga.com/feed',
    credibility: 6,
  },
  // TheStreet
  {
    name: 'TheStreet',
    url: 'https://news.google.com/rss/search?q=site:thestreet.com&hl=en-US&gl=US&ceid=US:en',
    credibility: 6,
  },
  // Investor Business Daily
  {
    name: 'IBD',
    url: 'https://news.google.com/rss/search?q=site:investors.com&hl=en-US&gl=US&ceid=US:en',
    credibility: 7,
  },
  // TechCrunch (for tech stocks)
  {
    name: 'TechCrunch',
    url: 'https://techcrunch.com/feed/',
    credibility: 7,
  },
  // The Verge (for tech stocks)
  {
    name: 'The Verge Tech',
    url: 'https://www.theverge.com/rss/index.xml',
    credibility: 7,
  },
  // Ars Technica
  {
    name: 'Ars Technica',
    url: 'https://feeds.arstechnica.com/arstechnica/index',
    credibility: 7,
  },
];

// Company name mappings for better Google News searches
const COMPANY_NAMES: Record<string, string> = {
  AAPL: 'Apple',
  MSFT: 'Microsoft',
  GOOGL: 'Google Alphabet',
  GOOG: 'Google Alphabet',
  AMZN: 'Amazon',
  META: 'Meta Facebook',
  TSLA: 'Tesla',
  NVDA: 'Nvidia',
  AMD: 'AMD Advanced Micro Devices',
  INTC: 'Intel',
  NFLX: 'Netflix',
  DIS: 'Disney',
  BA: 'Boeing',
  JPM: 'JPMorgan Chase',
  BAC: 'Bank of America',
  WMT: 'Walmart',
  PG: 'Procter Gamble',
  JNJ: 'Johnson Johnson',
  UNH: 'UnitedHealth',
  V: 'Visa',
  MA: 'Mastercard',
  HD: 'Home Depot',
  CVX: 'Chevron',
  XOM: 'Exxon Mobil',
  PFE: 'Pfizer',
  ABBV: 'AbbVie',
  KO: 'Coca Cola',
  PEP: 'PepsiCo Pepsi',
  MRK: 'Merck',
  COST: 'Costco',
  TMO: 'Thermo Fisher',
  AVGO: 'Broadcom',
  CSCO: 'Cisco',
  ACN: 'Accenture',
  ORCL: 'Oracle',
  CRM: 'Salesforce',
  ADBE: 'Adobe',
  IBM: 'IBM',
  QCOM: 'Qualcomm',
  TXN: 'Texas Instruments',
  PYPL: 'PayPal',
  SQ: 'Square Block',
  UBER: 'Uber',
  LYFT: 'Lyft',
  ABNB: 'Airbnb',
  COIN: 'Coinbase',
  PLTR: 'Palantir',
  SNOW: 'Snowflake',
  ZM: 'Zoom',
  SHOP: 'Shopify',
  ROKU: 'Roku',
  SPOT: 'Spotify',
  SQ: 'Block Square',
  RBLX: 'Roblox',
  RIVN: 'Rivian',
  LCID: 'Lucid Motors',
  F: 'Ford Motor',
  GM: 'General Motors',
  NIO: 'NIO',
  BABA: 'Alibaba',
  JD: 'JD.com',
  PDD: 'PDD Pinduoduo',
  BIDU: 'Baidu',
  NKE: 'Nike',
  SBUX: 'Starbucks',
  MCD: 'McDonalds',
  CMG: 'Chipotle',
};

/**
 * Generate a Google News RSS URL for a specific stock symbol
 */
function getGoogleNewsRSSForSymbol(symbol: string): string {
  const companyName = COMPANY_NAMES[symbol.toUpperCase()] || symbol;
  const query = encodeURIComponent(`${symbol} stock OR ${companyName}`);
  return `https://news.google.com/rss/search?q=${query}&hl=en-US&gl=US&ceid=US:en`;
}

/**
 * Generate a Yahoo Finance RSS URL for a specific stock symbol
 */
function getYahooFinanceRSSForSymbol(symbol: string): string {
  return `https://finance.yahoo.com/rss/headline?s=${symbol}`;
}

/**
 * Fetch and parse a single RSS feed
 */
export async function fetchRSSFeed(
  feedUrl: string,
  feedName: string
): Promise<NormalizedArticle[]> {
  try {
    const feed = await parser.parseURL(feedUrl);

    return (feed.items as RSSItem[])
      .map((item) => normalizeRSSItem(item, feedName))
      .map(validateArticle)
      .filter((a): a is NormalizedArticle => a !== null);
  } catch (error) {
    console.error(`Error fetching RSS feed ${feedName}:`, error);
    return [];
  }
}

/**
 * Fetch ticker-specific RSS feeds for a symbol
 */
export async function fetchTickerSpecificFeeds(
  symbol: string
): Promise<NormalizedArticle[]> {
  const allArticles: NormalizedArticle[] = [];
  
  // Try Google News RSS for the symbol
  try {
    const googleNewsUrl = getGoogleNewsRSSForSymbol(symbol);
    const articles = await fetchRSSFeed(googleNewsUrl, `Google News - ${symbol}`);
    
    // Tag articles with the symbol
    articles.forEach((a) => {
      if (!a.mentionedSymbols) a.mentionedSymbols = [];
      if (!a.mentionedSymbols.includes(symbol)) {
        a.mentionedSymbols.push(symbol);
      }
    });
    
    allArticles.push(...articles);
    console.log(`Google News RSS: ${articles.length} articles for ${symbol}`);
  } catch (error) {
    console.error(`Error fetching Google News for ${symbol}:`, error);
  }
  
  // Try Yahoo Finance RSS for the symbol
  try {
    const yahooUrl = getYahooFinanceRSSForSymbol(symbol);
    const articles = await fetchRSSFeed(yahooUrl, `Yahoo Finance - ${symbol}`);
    
    // Tag articles with the symbol
    articles.forEach((a) => {
      if (!a.mentionedSymbols) a.mentionedSymbols = [];
      if (!a.mentionedSymbols.includes(symbol)) {
        a.mentionedSymbols.push(symbol);
      }
    });
    
    allArticles.push(...articles);
    console.log(`Yahoo Finance RSS: ${articles.length} articles for ${symbol}`);
  } catch (error) {
    console.error(`Error fetching Yahoo Finance for ${symbol}:`, error);
  }
  
  return allArticles;
}

/**
 * Fetch all configured RSS feeds
 */
export async function fetchAllRSSFeeds(): Promise<
  { feedName: string; articles: NormalizedArticle[] }[]
> {
  const results = await Promise.allSettled(
    FINANCIAL_RSS_FEEDS.map(async (feed) => ({
      feedName: feed.name,
      articles: await fetchRSSFeed(feed.url, feed.name),
    }))
  );

  return results
    .filter(
      (r): r is PromiseFulfilledResult<{ feedName: string; articles: NormalizedArticle[] }> =>
        r.status === 'fulfilled'
    )
    .map((r) => r.value);
}

/**
 * Ingest articles from all RSS feeds into the database
 * Now includes ticker-specific feeds for tracked assets
 */
export async function ingestRSSFeeds(): Promise<IngestionResult[]> {
  const supabase = createServerClient();
  const results: IngestionResult[] = [];

  // First, ingest all general feeds
  for (const feedConfig of FINANCIAL_RSS_FEEDS) {
    const startTime = Date.now();
    const errors: string[] = [];

    let itemsFetched = 0;
    let itemsNew = 0;
    let itemsDuplicate = 0;
    let itemsFailed = 0;

    try {
      // Get or create source
      const { data: existingSource } = await supabase
        .from('news_sources')
        .select('id')
        .eq('name', feedConfig.name)
        .single();

      let sourceId = existingSource?.id;

      if (!sourceId) {
        const { data: newSource } = await supabase
          .from('news_sources')
          .insert({
            name: feedConfig.name,
            source_type: 'rss',
            base_url: feedConfig.url,
            credibility_score: feedConfig.credibility,
          })
          .select('id')
          .single();
        sourceId = newSource?.id;
      }

      // Fetch articles
      const articles = await fetchRSSFeed(feedConfig.url, feedConfig.name);
      itemsFetched = articles.length;

      if (articles.length === 0) {
        results.push({
          sourceName: feedConfig.name,
          itemsFetched: 0,
          itemsNew: 0,
          itemsDuplicate: 0,
          itemsFailed: 0,
          errors: ['No articles fetched'],
          durationMs: Date.now() - startTime,
        });
        continue;
      }

      // Get existing hashes
      const hashes = articles.map((a) => generateContentHash(a.title, a.url));
      const { data: existingItems } = await supabase
        .from('news_items')
        .select('content_hash')
        .in('content_hash', hashes);

      const existingHashes = new Set(
        (existingItems || []).map((i: { content_hash: string }) => i.content_hash)
      );

      // Insert new articles
      for (const article of articles) {
        const hash = generateContentHash(article.title, article.url);

        if (existingHashes.has(hash)) {
          itemsDuplicate++;
          continue;
        }

        const { error } = await supabase.from('news_items').insert({
          source_id: sourceId,
          source_name: article.sourceName,
          external_id: article.externalId,
          title: article.title,
          summary: article.summary,
          content: article.content,
          url: article.url,
          author: article.author,
          published_at: article.publishedAt.toISOString(),
          tags: article.tags || [],
          mentioned_symbols: article.mentionedSymbols || [],
          mentioned_entities: article.mentionedEntities || [],
          content_hash: hash,
        });

        if (error) {
          if (error.code === '23505') {
            itemsDuplicate++;
          } else {
            itemsFailed++;
            errors.push(`Insert error: ${error.message}`);
          }
        } else {
          itemsNew++;
        }
      }

      // Update source last fetch time
      if (sourceId) {
        await supabase
          .from('news_sources')
          .update({ last_fetch_at: new Date().toISOString() })
          .eq('id', sourceId);
      }
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      errors.push(errorMessage);
    }

    results.push({
      sourceName: feedConfig.name,
      itemsFetched,
      itemsNew,
      itemsDuplicate,
      itemsFailed,
      errors: errors.length > 0 ? errors : undefined,
      durationMs: Date.now() - startTime,
    });
  }

  // Now fetch ticker-specific feeds for tracked assets
  try {
    const { data: trackedAssets } = await supabase
      .from('user_assets')
      .select('assets!inner(symbol)')
      .limit(100);

    const uniqueSymbols = [
      ...new Set(
        (trackedAssets || [])
          .map((ua: any) => ua.assets?.symbol)
          .filter((s: string | undefined): s is string => !!s && !s.startsWith('^'))
      ),
    ];

    console.log('Fetching ticker-specific RSS for symbols:', uniqueSymbols);

    // Fetch ticker feeds in small batches to avoid hitting rate limits too hard
    const batchSize = 5;
    for (let i = 0; i < uniqueSymbols.length; i += batchSize) {
      const batchSymbols = uniqueSymbols.slice(i, i + batchSize);
      
      const batchPromises = batchSymbols.map(async (symbol) => {
        const symbolStartTime = Date.now();
        const symbolErrors: string[] = [];
        let sFetched = 0;
        let sNew = 0;
        let sDuplicate = 0;
        let sFailed = 0;

        try {
          const articles = await fetchTickerSpecificFeeds(symbol);
          sFetched = articles.length;

          if (articles.length > 0) {
            // Get existing hashes
            const hashes = articles.map((a) => generateContentHash(a.title, a.url));
            const { data: existingItems } = await supabase
              .from('news_items')
              .select('content_hash')
              .in('content_hash', hashes.slice(0, 500));

            const existingHashes = new Set(
              (existingItems || []).map((i: { content_hash: string }) => i.content_hash)
            );

            // Insert new articles
            for (const article of articles) {
              const hash = generateContentHash(article.title, article.url);

              if (existingHashes.has(hash)) {
                sDuplicate++;
                continue;
              }

              const { error } = await supabase.from('news_items').insert({
                source_name: article.sourceName,
                external_id: article.externalId,
                title: article.title,
                summary: article.summary,
                content: article.content,
                url: article.url,
                author: article.author,
                published_at: article.publishedAt.toISOString(),
                tags: article.tags || [],
                mentioned_symbols: article.mentionedSymbols || [],
                mentioned_entities: article.mentionedEntities || [],
                content_hash: hash,
              });

              if (error) {
                if (error.code === '23505') {
                  sDuplicate++;
                } else {
                  sFailed++;
                  symbolErrors.push(`Insert error: ${error.message}`);
                }
              } else {
                sNew++;
                existingHashes.add(hash);
              }
            }
          }
        } catch (error) {
          symbolErrors.push(error instanceof Error ? error.message : 'Unknown error');
        }

        return {
          sourceName: `Ticker RSS - ${symbol}`,
          itemsFetched: sFetched,
          itemsNew: sNew,
          itemsDuplicate: sDuplicate,
          itemsFailed: sFailed,
          errors: symbolErrors.length > 0 ? symbolErrors : undefined,
          durationMs: Date.now() - symbolStartTime,
        };
      });

      const batchResults = await Promise.all(batchPromises);
      results.push(...batchResults);
      
      // Small delay between batches
      if (i + batchSize < uniqueSymbols.length) {
        await new Promise((resolve) => setTimeout(resolve, 500));
      }
    }
  } catch (error) {
    console.error('Error fetching ticker-specific feeds:', error);
  }

  return results;
}
