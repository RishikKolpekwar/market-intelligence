import { NormalizedArticle, NewsAPIArticle, IngestionResult } from '@/types/ingestion';
import { normalizeNewsAPIArticle, validateArticle, generateContentHash } from './normalizer';
import { createServerClient } from '@/lib/supabase/client';

const NEWS_API_KEY = process.env.NEWS_API_KEY;
const NEWS_API_BASE_URL = 'https://newsapi.org/v2';

interface NewsAPIResponse {
  status: string;
  totalResults: number;
  articles: NewsAPIArticle[];
}

/**
 * Fetch business news from NewsAPI
 */
export async function fetchNewsAPIArticles(
  query?: string,
  pageSize: number = 50
): Promise<NormalizedArticle[]> {
  if (!NEWS_API_KEY) {
    throw new Error('NEWS_API_KEY not configured');
  }

  const params = new URLSearchParams({
    apiKey: NEWS_API_KEY,
    language: 'en',
    pageSize: pageSize.toString(),
    sortBy: 'publishedAt',
  });

  // Use top headlines for business news
  const endpoint = query
    ? `${NEWS_API_BASE_URL}/everything?${params}&q=${encodeURIComponent(query)}`
    : `${NEWS_API_BASE_URL}/top-headlines?${params}&category=business&country=us`;

  const response = await fetch(endpoint, {
    headers: {
      'User-Agent': 'MarketIntelligence/1.0',
    },
    next: { revalidate: 0 }, // No caching for fresh data
  });

  if (!response.ok) {
    throw new Error(`NewsAPI error: ${response.status} ${response.statusText}`);
  }

  const data: NewsAPIResponse = await response.json();

  if (data.status !== 'ok') {
    throw new Error(`NewsAPI returned error status`);
  }

  return data.articles
    .map(normalizeNewsAPIArticle)
    .map(validateArticle)
    .filter((a): a is NormalizedArticle => a !== null);
}

/**
 * Fetch news from NewsAPI using the "everything" endpoint for broader coverage
 */
export async function fetchNewsAPIEverything(
  query: string,
  pageSize: number = 100
): Promise<NormalizedArticle[]> {
  if (!NEWS_API_KEY) {
    throw new Error('NEWS_API_KEY not configured');
  }

  const yesterday = new Date();
  yesterday.setDate(yesterday.getDate() - 1);

  const params = new URLSearchParams({
    apiKey: NEWS_API_KEY,
    language: 'en',
    pageSize: pageSize.toString(),
    sortBy: 'publishedAt',
    from: yesterday.toISOString().split('T')[0],
    q: query,
  });

  const endpoint = `${NEWS_API_BASE_URL}/everything?${params}`;

  const response = await fetch(endpoint, {
    headers: {
      'User-Agent': 'MarketIntelligence/1.0',
    },
    next: { revalidate: 0 },
  });

  if (!response.ok) {
    throw new Error(`NewsAPI error: ${response.status} ${response.statusText}`);
  }

  const data: NewsAPIResponse = await response.json();

  if (data.status !== 'ok') {
    throw new Error(`NewsAPI returned error status`);
  }

  return data.articles
    .map(normalizeNewsAPIArticle)
    .map(validateArticle)
    .filter((a): a is NormalizedArticle => a !== null);
}

/**
 * Ingest articles from NewsAPI into the database
 * Now fetches both top headlines AND company-specific news
 */
export async function ingestNewsAPI(query?: string): Promise<IngestionResult> {
  const startTime = Date.now();
  const supabase = createServerClient();
  const errors: string[] = [];

  let itemsFetched = 0;
  let itemsNew = 0;
  let itemsDuplicate = 0;
  let itemsFailed = 0;

  try {
    // Get source ID
    const { data: source } = await supabase
      .from('news_sources')
      .select('id')
      .eq('name', 'NewsAPI')
      .single();

    // Fetch top headlines
    const topHeadlines = await fetchNewsAPIArticles(query);
    console.log('NewsAPI top headlines:', topHeadlines.length);

    // Get tracked assets with their keywords for more targeted searches
    const { data: trackedAssets } = await supabase
      .from('user_assets')
      .select('assets!inner(symbol, name, keywords)')
      .limit(50);

    // Build search queries from tracked assets
    const companyArticles: NormalizedArticle[] = [];
    const searchedQueries = new Set<string>();

    for (const ua of trackedAssets || []) {
      const asset = ua.assets as unknown as { symbol: string; name: string; keywords: string[] };
      if (!asset || asset.symbol.startsWith('^')) continue;

      // Search by company name (more reliable than symbol for NewsAPI)
      const cleanName = asset.name.replace(/\s+(Inc\.|Corp\.|Corporation|Ltd\.|LLC|Co\.)$/i, '').trim();
      
      if (searchedQueries.has(cleanName.toLowerCase())) continue;
      searchedQueries.add(cleanName.toLowerCase());

      try {
        // Search by company/fund name first
        const articles = await fetchNewsAPIEverything(cleanName, 20);
        
        // Also search by ticker symbol if it's 3-4 chars (likely a valid stock symbol)
        let symbolArticles: NormalizedArticle[] = [];
        if (asset.symbol.length >= 3 && asset.symbol.length <= 5) {
          try {
            symbolArticles = await fetchNewsAPIEverything(asset.symbol, 10);
            await new Promise((resolve) => setTimeout(resolve, 150));
          } catch (e) { /* ignore symbol search errors */ }
        }
        
        const combinedArticles = [...articles, ...symbolArticles];
        
        // Tag articles with the symbol and entity
        combinedArticles.forEach((a) => {
          if (!a.mentionedSymbols) a.mentionedSymbols = [];
          if (!a.mentionedSymbols.includes(asset.symbol)) {
            a.mentionedSymbols.push(asset.symbol);
          }
          if (!a.mentionedEntities) a.mentionedEntities = [];
          if (!a.mentionedEntities.includes(cleanName)) {
            a.mentionedEntities.push(cleanName);
          }
          if (asset.name !== cleanName && !a.mentionedEntities.includes(asset.name)) {
            a.mentionedEntities.push(asset.name);
          }
        });
        companyArticles.push(...combinedArticles);
        console.log(`NewsAPI: ${combinedArticles.length} articles for "${cleanName}" (${asset.symbol})`);
        // Respect rate limits (NewsAPI free tier is limited)
        await new Promise((resolve) => setTimeout(resolve, 200));
      } catch (err) {
        // NewsAPI free tier has limited requests, don't fail entire ingestion
        console.warn(`NewsAPI search for "${cleanName}" failed:`, err);
      }
    }

    // Combine all articles
    const allArticles = [...topHeadlines, ...companyArticles];
    console.log('NewsAPI total articles:', allArticles.length);
    itemsFetched = allArticles.length;

    // Get existing hashes to check for duplicates
    const hashes = allArticles.map((a) => generateContentHash(a.title, a.url));
    const { data: existingItems } = await supabase
      .from('news_items')
      .select('content_hash')
      .in('content_hash', hashes.slice(0, 500));

    const existingHashes = new Set(existingItems?.map((i) => i.content_hash) || []);

    // Insert new articles
    for (const article of allArticles) {
      const hash = generateContentHash(article.title, article.url);

      if (existingHashes.has(hash)) {
        itemsDuplicate++;
        continue;
      }

      const { error } = await supabase.from('news_items').insert({
        source_id: source?.id,
        source_name: article.sourceName,
        external_id: article.externalId,
        title: article.title,
        summary: article.summary,
        content: article.content,
        url: article.url,
        image_url: article.imageUrl,
        author: article.author,
        published_at: article.publishedAt.toISOString(),
        tags: article.tags || [],
        mentioned_symbols: article.mentionedSymbols || [],
        mentioned_entities: article.mentionedEntities || [],
        content_hash: hash,
      });

      if (error) {
        // Ignore duplicate key errors (race condition)
        if (error.code === '23505') {
          itemsDuplicate++;
        } else {
          itemsFailed++;
          errors.push(`Insert error: ${error.message}`);
        }
      } else {
        itemsNew++;
        existingHashes.add(hash);
      }
    }

    // Update source last fetch time
    if (source?.id) {
      await supabase
        .from('news_sources')
        .update({ last_fetch_at: new Date().toISOString() })
        .eq('id', source.id);
    }
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    errors.push(errorMessage);
  }

  return {
    sourceName: 'NewsAPI',
    itemsFetched,
    itemsNew,
    itemsDuplicate,
    itemsFailed,
    errors: errors.length > 0 ? errors : undefined,
    durationMs: Date.now() - startTime,
  };
}
