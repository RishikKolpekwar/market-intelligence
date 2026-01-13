import { NormalizedArticle, FinnhubArticle, IngestionResult } from '@/types/ingestion';
import { normalizeFinnhubArticle, validateArticle, generateContentHash } from './normalizer';
import { createServerClient } from '@/lib/supabase/client';

const FINNHUB_API_KEY = process.env.FINNHUB_API_KEY;
const FINNHUB_BASE_URL = 'https://finnhub.io/api/v1';

/**
 * Fetch market news from Finnhub
 */
export async function fetchFinnhubNews(
  category: 'general' | 'forex' | 'crypto' | 'merger' = 'general'
): Promise<NormalizedArticle[]> {
  if (!FINNHUB_API_KEY) {
    throw new Error('FINNHUB_API_KEY not configured');
  }

  const url = `${FINNHUB_BASE_URL}/news?category=${category}&token=${FINNHUB_API_KEY}`;

  const response = await fetch(url, {
    headers: {
      'User-Agent': 'MarketIntelligence/1.0',
    },
  });

  if (!response.ok) {
    throw new Error(`Finnhub error: ${response.status} ${response.statusText}`);
  }

  const articles: FinnhubArticle[] = await response.json();

  return articles
    .map(normalizeFinnhubArticle)
    .map(validateArticle)
    .filter((a): a is NormalizedArticle => a !== null);
}

/**
 * Fetch company-specific news from Finnhub
 */
export async function fetchFinnhubCompanyNews(
  symbol: string,
  fromDate: Date,
  toDate: Date
): Promise<NormalizedArticle[]> {
  if (!FINNHUB_API_KEY) {
    throw new Error('FINNHUB_API_KEY not configured');
  }

  const from = fromDate.toISOString().split('T')[0];
  const to = toDate.toISOString().split('T')[0];

  const url = `${FINNHUB_BASE_URL}/company-news?symbol=${symbol}&from=${from}&to=${to}&token=${FINNHUB_API_KEY}`;

  const response = await fetch(url, {
    headers: {
      'User-Agent': 'MarketIntelligence/1.0',
    },
  });

  if (!response.ok) {
    throw new Error(`Finnhub company news error: ${response.status}`);
  }

  const articles: FinnhubArticle[] = await response.json();

  return articles
    .map(normalizeFinnhubArticle)
    .map(validateArticle)
    .filter((a): a is NormalizedArticle => a !== null);
}

/**
 * Ingest articles from Finnhub into the database
 * Now fetches both general news AND company-specific news for tracked assets
 */
export async function ingestFinnhub(): Promise<IngestionResult> {
  const startTime = Date.now();
  const supabase = createServerClient();
  const errors: string[] = [];

  let itemsFetched = 0;
  let itemsNew = 0;
  let itemsDuplicate = 0;
  let itemsFailed = 0;

  try {
    // Get source ID
    const { data: source } = await (supabase
      .from('news_sources') as any)
      .select('id')
      .eq('name', 'Finnhub')
      .single();

    // Fetch general market news
    const generalArticles = await fetchFinnhubNews('general');
    console.log('Finnhub general news:', generalArticles.length, 'articles');

    // Get all unique symbols that users are tracking
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

    console.log('Fetching company news for symbols:', uniqueSymbols);

    // Fetch company-specific news for each tracked symbol in parallel batches
    const companyArticles: NormalizedArticle[] = [];
    const today = new Date();
    const weekAgo = new Date(today.getTime() - 7 * 24 * 60 * 60 * 1000);

    const batchSize = 10;
    for (let i = 0; i < uniqueSymbols.length; i += batchSize) {
      const batch = uniqueSymbols.slice(i, i + batchSize);
      const batchPromises = batch.map(async (symbol) => {
        try {
          const articles = await fetchFinnhubCompanyNews(symbol, weekAgo, today);
          // Tag articles with the symbol they're about
          articles.forEach((a) => {
            if (!a.mentionedSymbols) a.mentionedSymbols = [];
            if (!a.mentionedSymbols.includes(symbol)) {
              a.mentionedSymbols.push(symbol);
            }
          });
          return articles;
        } catch (err) {
          console.error(`Error fetching news for ${symbol}:`, err);
          return [];
        }
      });
      
      const batchResults = await Promise.all(batchPromises);
      batchResults.forEach(articles => companyArticles.push(...articles));
      
      if (i + batchSize < uniqueSymbols.length) {
        await new Promise((resolve) => setTimeout(resolve, 500));
      }
    }

    // Combine all articles
    const allArticles = [...generalArticles, ...companyArticles];
    console.log('Finnhub total articles:', allArticles.length);
    itemsFetched = allArticles.length;

    // Get existing hashes
    const hashes = allArticles.map((a) => generateContentHash(a.title, a.url));
    const { data: existingItems } = await supabase
      .from('news_items')
      .select('content_hash')
      .in('content_hash', hashes.slice(0, 500)); // Supabase has limits on IN clause

    const existingHashes = new Set(
      (existingItems || []).map((i: { content_hash: string }) => i.content_hash)
    );

    // Insert new articles
    for (const article of allArticles) {
      const hash = generateContentHash(article.title, article.url);

      if (existingHashes.has(hash)) {
        itemsDuplicate++;
        continue;
      }

      const { error } = await (supabase.from('news_items') as any).insert({
        source_id: (source as any)?.id,
        source_name: article.sourceName,
        external_id: article.externalId,
        title: article.title,
        summary: article.summary,
        url: article.url,
        image_url: article.imageUrl,
        published_at: article.publishedAt.toISOString(),
        category: article.category,
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
        existingHashes.add(hash); // Prevent duplicates within batch
      }
    }

    // Update source last fetch time
    if ((source as any)?.id) {
      await (supabase
        .from('news_sources') as any)
        .update({ last_fetch_at: new Date().toISOString() })
        .eq('id', (source as any).id);
    }
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    errors.push(errorMessage);
  }

  return {
    sourceName: 'Finnhub',
    itemsFetched,
    itemsNew,
    itemsDuplicate,
    itemsFailed,
    errors: errors.length > 0 ? errors : undefined,
    durationMs: Date.now() - startTime,
  };
}
