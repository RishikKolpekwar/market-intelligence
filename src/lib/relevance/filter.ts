import { createServerClient } from '@/lib/supabase/client';
import { RelevanceMatch } from '@/types/ingestion';
import { Asset, NewsItem } from '@/types/database';

/**
 * Relevance Filtering Engine
 *
 * Matches news articles to assets using multiple strategies:
 * 1. Direct symbol mention ($AAPL, AAPL)
 * 2. Keyword matching (company names, products)
 * 3. LLM-assisted inference (for ambiguous cases)
 */

/**
 * Find all relevant assets for a news item using rule-based matching
 */
export function findRelevantAssets(
  newsItem: Pick<NewsItem, 'title' | 'summary' | 'mentioned_symbols' | 'mentioned_entities'>,
  assets: Pick<Asset, 'id' | 'symbol' | 'name' | 'keywords'>[]
): RelevanceMatch[] {
  const matches: RelevanceMatch[] = [];
  const textToSearch = `${newsItem.title} ${newsItem.summary || ''}`.toLowerCase();

  for (const asset of assets) {
    const matchedTerms: string[] = [];
    let highestScore = 0;
    let matchType: RelevanceMatch['matchType'] = 'keyword_match';

    // Strategy 1: Direct symbol mention (highest confidence)
    if (newsItem.mentioned_symbols?.includes(asset.symbol)) {
      matchedTerms.push(asset.symbol);
      highestScore = Math.max(highestScore, 0.95);
      matchType = 'symbol_mention';
    }

    // Check for $SYMBOL pattern in text
    const dollarPattern = new RegExp(`\\$${asset.symbol}\\b`, 'i');
    if (dollarPattern.test(textToSearch)) {
      matchedTerms.push(`$${asset.symbol}`);
      highestScore = Math.max(highestScore, 0.95);
      matchType = 'symbol_mention';
    }

    // Check for bare symbol (with word boundaries)
    const bareSymbolPattern = new RegExp(`\\b${asset.symbol}\\b`, 'i');
    if (bareSymbolPattern.test(textToSearch) && asset.symbol.length >= 2) {
      // Lower confidence for bare symbols (could be acronyms)
      if (!matchedTerms.includes(asset.symbol)) {
        matchedTerms.push(asset.symbol);
        highestScore = Math.max(highestScore, 0.7);
        if (matchType !== 'symbol_mention') matchType = 'symbol_mention';
      }
    }

    // Strategy 2: Company name matching
    const cleanAssetName = asset.name.replace(/\s+(Inc\.|Corp\.|Corporation|Ltd\.|LLC|Co\.)$/i, '').trim();
    const cleanAssetNameLower = cleanAssetName.toLowerCase();
    const companyNameLower = asset.name.toLowerCase();
    
    if (textToSearch.includes(cleanAssetNameLower) || textToSearch.includes(companyNameLower)) {
      matchedTerms.push(cleanAssetName);
      highestScore = Math.max(highestScore, 0.85);
    }

    // Check mentioned entities
    if (newsItem.mentioned_entities?.some((e) => {
      const entityLower = e.toLowerCase();
      return entityLower === cleanAssetNameLower || entityLower === companyNameLower || cleanAssetNameLower.includes(entityLower) || entityLower.includes(cleanAssetNameLower);
    })) {
      if (!matchedTerms.includes(cleanAssetName)) {
        matchedTerms.push(cleanAssetName);
        highestScore = Math.max(highestScore, 0.85);
      }
    }

    // Strategy 3: Keyword matching
    if (asset.keywords && asset.keywords.length > 0) {
      for (const keyword of asset.keywords) {
        const keywordLower = keyword.toLowerCase();
        if (textToSearch.includes(keywordLower)) {
          matchedTerms.push(keyword);
          // Keywords have varying relevance
          const keywordScore = calculateKeywordScore(keyword, textToSearch);
          highestScore = Math.max(highestScore, keywordScore);
        }
      }
    }

    // Only add if we found matches
    if (matchedTerms.length > 0 && highestScore > 0.3) {
      matches.push({
        assetId: asset.id,
        matchType,
        relevanceScore: Math.min(highestScore, 1.0),
        matchedTerms: [...new Set(matchedTerms)], // Dedupe
      });
    }
  }

  // Sort by relevance score
  return matches.sort((a, b) => b.relevanceScore - a.relevanceScore);
}

/**
 * Calculate keyword relevance score based on specificity
 */
function calculateKeywordScore(keyword: string, text: string): number {
  const baseScore = 0.5;

  // Longer, more specific keywords are more relevant
  const lengthBonus = Math.min(keyword.length / 20, 0.2);

  // Check if keyword appears in title (first ~100 chars)
  const inTitle = text.substring(0, 100).toLowerCase().includes(keyword.toLowerCase());
  const titleBonus = inTitle ? 0.15 : 0;

  // Check frequency
  const regex = new RegExp(keyword.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'gi');
  const matches = text.match(regex) || [];
  const frequencyBonus = Math.min(matches.length * 0.05, 0.15);

  return Math.min(baseScore + lengthBonus + titleBonus + frequencyBonus, 0.8);
}

/**
 * Process relevance for a batch of news items
 */
export async function processNewsRelevance(
  newsItemIds: string[],
  assetIds?: string[]
): Promise<{ processed: number; matches: number; errors: number }> {
  const supabase = createServerClient();
  let processed = 0;
  let totalMatches = 0;
  let errors = 0;

  // Get assets to match against
  let assetsQuery = supabase.from('assets').select('id, symbol, name, keywords').eq('is_active', true);

  if (assetIds && assetIds.length > 0) {
    assetsQuery = assetsQuery.in('id', assetIds);
  }

  const { data: assets, error: assetsError } = await assetsQuery;

  if (assetsError || !assets) {
    console.error('Error fetching assets:', assetsError);
    return { processed: 0, matches: 0, errors: 1 };
  }

  // Process news items in batches
  const batchSize = 50;
  for (let i = 0; i < newsItemIds.length; i += batchSize) {
    const batchIds = newsItemIds.slice(i, i + batchSize);

    const { data: newsItems, error: newsError } = await supabase
      .from('news_items')
      .select('id, title, summary, mentioned_symbols, mentioned_entities')
      .in('id', batchIds);

    if (newsError || !newsItems) {
      console.error('Error fetching news items:', newsError);
      errors++;
      continue;
    }

    for (const newsItem of newsItems) {
      const matches = findRelevantAssets(newsItem, assets);

      if (matches.length > 0) {
        // Insert relevance mappings
        const relevanceInserts = matches.map((match) => ({
          news_item_id: newsItem.id,
          asset_id: match.assetId,
          match_type: match.matchType,
          relevance_score: match.relevanceScore,
          matched_terms: match.matchedTerms,
        }));

        const { error: insertError } = await supabase
          .from('news_asset_relevance')
          .upsert(relevanceInserts, {
            onConflict: 'news_item_id,asset_id',
          });

        if (insertError) {
          console.error('Error inserting relevance:', insertError);
          errors++;
        } else {
          totalMatches += matches.length;
        }
      }

      // Mark news item as processed
      await supabase.from('news_items').update({ is_processed: true }).eq('id', newsItem.id);

      processed++;
    }
  }

  return { processed, matches: totalMatches, errors };
}

/**
 * Process all unprocessed news items
 */
export async function processAllUnprocessedNews(): Promise<{
  processed: number;
  matches: number;
  errors: number;
}> {
  const supabase = createServerClient();

  // Get unprocessed news items from the last 48 hours
  const cutoffDate = new Date();
  cutoffDate.setHours(cutoffDate.getHours() - 48);

  const { data: unprocessedItems, error } = await supabase
    .from('news_items')
    .select('id')
    .eq('is_processed', false)
    .gte('published_at', cutoffDate.toISOString())
    .limit(500);

  if (error || !unprocessedItems) {
    console.error('Error fetching unprocessed news:', error);
    return { processed: 0, matches: 0, errors: 1 };
  }

  if (unprocessedItems.length === 0) {
    return { processed: 0, matches: 0, errors: 0 };
  }

  const newsItemIds = unprocessedItems.map((item) => item.id);
  return processNewsRelevance(newsItemIds);
}

/**
 * Get relevant news for a user's tracked assets
 */
export async function getRelevantNewsForUser(
  userId: string,
  hoursBack: number = 24,
  limit: number = 50
): Promise<
  {
    assetId: string;
    assetSymbol: string;
    assetName: string;
    news: {
      id: string;
      title: string;
      summary: string | null;
      url: string;
      sourceName: string;
      publishedAt: string;
      relevanceScore: number;
      matchType: string;
    }[];
  }[]
> {
  const supabase = createServerClient();

  const cutoffDate = new Date();
  cutoffDate.setHours(cutoffDate.getHours() - hoursBack);

  // Get user's tracked assets
  const { data: userAssets, error: userAssetsError } = await supabase
    .from('user_assets')
    .select(
      `
      asset_id,
      importance_level,
      assets!inner (
        id,
        symbol,
        name
      )
    `
    )
    .eq('user_id', userId);

  if (userAssetsError || !userAssets) {
    console.error('Error fetching user assets:', userAssetsError);
    return [];
  }

  const results: {
    assetId: string;
    assetSymbol: string;
    assetName: string;
    news: {
      id: string;
      title: string;
      summary: string | null;
      url: string;
      sourceName: string;
      publishedAt: string;
      relevanceScore: number;
      matchType: string;
    }[];
  }[] = [];

  // Get relevant news for each asset
  for (const ua of userAssets) {
    const asset = ua.assets as unknown as { id: string; symbol: string; name: string };

    const { data: relevantNews, error: newsError } = await supabase
      .from('news_asset_relevance')
      .select(
        `
        relevance_score,
        match_type,
        news_items!inner (
          id,
          title,
          summary,
          url,
          source_name,
          published_at
        )
      `
      )
      .eq('asset_id', asset.id)
      .gte('news_items.published_at', cutoffDate.toISOString())
      .order('relevance_score', { ascending: false })
      .limit(limit);

    if (newsError) {
      console.error(`Error fetching news for asset ${asset.symbol}:`, newsError);
      continue;
    }

    if (relevantNews && relevantNews.length > 0) {
      results.push({
        assetId: asset.id,
        assetSymbol: asset.symbol,
        assetName: asset.name,
        news: relevantNews.map((r) => {
          const newsItem = r.news_items as unknown as {
            id: string;
            title: string;
            summary: string | null;
            url: string;
            source_name: string;
            published_at: string;
          };
          return {
            id: newsItem.id,
            title: newsItem.title,
            summary: newsItem.summary,
            url: newsItem.url,
            sourceName: newsItem.source_name,
            publishedAt: newsItem.published_at,
            relevanceScore: r.relevance_score,
            matchType: r.match_type,
          };
        }),
      });
    }
  }

  // Sort by number of news items (most active assets first)
  return results.sort((a, b) => b.news.length - a.news.length);
}
