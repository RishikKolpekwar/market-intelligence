import { NormalizedArticle, IngestionResult, TiingoArticle } from '@/types/ingestion';
import { normalizeTiingoArticle, validateArticle, generateContentHash } from './normalizer';
import { createServerClient } from '@/lib/supabase/client';

const TIINGO_API_KEY = process.env.TIINGO_API_KEY;
const TIINGO_BASE_URL = 'https://api.tiingo.com/tiingo/news';

/**
 * Fetch news from Tiingo
 */
export async function fetchTiingoNews(tickers?: string[]): Promise<NormalizedArticle[]> {
  if (!TIINGO_API_KEY) {
    throw new Error('TIINGO_API_KEY not configured');
  }

  const url = new URL(TIINGO_BASE_URL);
  url.searchParams.append('token', TIINGO_API_KEY);
  if (tickers && tickers.length > 0) {
    url.searchParams.append('tickers', tickers.join(','));
  }
  url.searchParams.append('limit', '100');

  const response = await fetch(url.toString(), {
    headers: {
      'Content-Type': 'application/json',
    },
  });

  if (!response.ok) {
    throw new Error(`Tiingo error: ${response.status} ${response.statusText}`);
  }

  const articles: TiingoArticle[] = await response.json();

  return articles
    .map(normalizeTiingoArticle)
    .map(validateArticle)
    .filter((a): a is NormalizedArticle => a !== null);
}

/**
 * Ingest articles from Tiingo into the database
 */
export async function ingestTiingo(): Promise<IngestionResult> {
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
      .eq('name', 'Tiingo')
      .single();

    let sourceId = source?.id;
    if (!sourceId) {
      const { data: newSource } = await supabase
        .from('news_sources')
        .insert({
          name: 'Tiingo',
          source_type: 'api',
          base_url: 'https://api.tiingo.com/tiingo/news',
          credibility_score: 8,
        })
        .select('id')
        .single();
      sourceId = newSource?.id;
    }

    // Get unique tickers from tracked assets
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

    // Fetch news for tracked symbols
    const articles = await fetchTiingoNews(uniqueSymbols.length > 0 ? uniqueSymbols : undefined);
    itemsFetched = articles.length;

    // Get existing hashes to check for duplicates
    const hashes = articles.map((a) => generateContentHash(a.title, a.url));
    const { data: existingItems } = await supabase
      .from('news_items')
      .select('content_hash')
      .in('content_hash', hashes.slice(0, 500));

    const existingHashes = new Set(existingItems?.map((i) => i.content_hash) || []);

    // Insert new articles
    for (const article of articles) {
      const hash = generateContentHash(article.title, article.url);

      if (existingHashes.has(hash)) {
        itemsDuplicate++;
        continue;
      }

      const { error } = await supabase.from('news_items').insert({
        source_id: sourceId,
        source_name: 'Tiingo',
        external_id: article.externalId,
        title: article.title,
        summary: article.summary,
        content: article.content,
        url: article.url,
        published_at: article.publishedAt.toISOString(),
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
        existingHashes.add(hash);
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
    errors.push(error instanceof Error ? error.message : 'Unknown error');
  }

  return {
    sourceName: 'Tiingo',
    itemsFetched,
    itemsNew,
    itemsDuplicate,
    itemsFailed,
    errors: errors.length > 0 ? errors : undefined,
    durationMs: Date.now() - startTime,
  };
}
