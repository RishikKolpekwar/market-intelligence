import { createServerClient } from '@/lib/supabase/client';
import { RelevanceMatch } from '@/types/ingestion';
import { Asset, NewsItem } from '@/types/database';

/**
 * Relevance Filtering Engine
 *
 * Matches news articles to assets using multiple strategies:
 * 1. Direct symbol mention ($AAPL, AAPL)
 * 2. Company/Fund name matching (full and partial)
 * 3. Fund family matching (e.g., "Fidelity" matches "Fidelity Contrafund")
 * 4. Keyword matching
 * 5. Fund-specific matching for mutual funds/ETFs
 */

// Map fund ticker prefixes to their families for matching
const FUND_FAMILY_PATTERNS: Record<string, string[]> = {
  // Fidelity funds (typically start with F)
  'FC': ['fidelity', 'fidelity contrafund'],
  'FD': ['fidelity'],
  'FS': ['fidelity', 'fidelity select'],
  'FI': ['fidelity'],
  'FX': ['fidelity'],
  // T. Rowe Price (typically start with PR or TR)
  'PR': ['t. rowe price', 't rowe price', 'rowe price'],
  'TR': ['t. rowe price', 't rowe price'],
  // Vanguard (typically start with V)
  'VF': ['vanguard'],
  'VI': ['vanguard', 'vanguard index'],
  'VT': ['vanguard', 'vanguard total'],
  'VO': ['vanguard'],
  'VG': ['vanguard'],
  // Schwab
  'SW': ['schwab', 'charles schwab'],
  'SC': ['schwab'],
  // BlackRock/iShares
  'BL': ['blackrock', 'ishares'],
  'IS': ['ishares', 'blackrock'],
  // American Funds
  'AM': ['american funds', 'capital group'],
  // PIMCO
  'PI': ['pimco'],
  'PM': ['pimco'],
};

/**
 * Extract searchable terms from asset name
 * e.g., "Fidelity Contrafund" -> ["Fidelity Contrafund", "Fidelity", "Contrafund"]
 */
function extractNameTerms(name: string): string[] {
  const terms: string[] = [name];
  
  // Clean common suffixes
  const cleanName = name.replace(/\s+(Inc\.|Corp\.|Corporation|Ltd\.|LLC|Co\.|Fund|Index|ETF)$/i, '').trim();
  if (cleanName !== name) {
    terms.push(cleanName);
  }
  
  // Split into individual words (at least 4 chars to be meaningful)
  const words = cleanName.split(/\s+/).filter(w => w.length >= 4);
  terms.push(...words);
  
  // Known fund families
  const fundFamilies = ['Fidelity', 'Vanguard', 'BlackRock', 'Schwab', 'PIMCO', 'T. Rowe Price', 'JPMorgan', 'Franklin', 'Templeton'];
  for (const family of fundFamilies) {
    if (name.toLowerCase().includes(family.toLowerCase())) {
      terms.push(family);
    }
  }
  
  return [...new Set(terms)]; // Dedupe
}

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
      if (!matchedTerms.includes(asset.symbol)) {
        matchedTerms.push(asset.symbol);
        highestScore = Math.max(highestScore, 0.7);
        if (matchType !== 'symbol_mention') matchType = 'symbol_mention';
      }
    }

    // Strategy 2: Company/Fund name matching (ENHANCED)
    const nameTerms = extractNameTerms(asset.name);
    for (const term of nameTerms) {
      const termLower = term.toLowerCase();
      if (termLower.length >= 4 && textToSearch.includes(termLower)) {
        matchedTerms.push(term);
        // Full name matches get higher score than partial
        const score = term === asset.name ? 0.90 : (term.length >= 8 ? 0.80 : 0.70);
        highestScore = Math.max(highestScore, score);
      }
    }

    // Check mentioned entities
    if (newsItem.mentioned_entities?.some((e) => {
      const entityLower = e.toLowerCase();
      return nameTerms.some(term => {
        const termLower = term.toLowerCase();
        return entityLower === termLower || entityLower.includes(termLower) || termLower.includes(entityLower);
      });
    })) {
      matchedTerms.push(asset.name);
      highestScore = Math.max(highestScore, 0.85);
    }

    // Strategy 3: Keyword matching
    if (asset.keywords && asset.keywords.length > 0) {
      for (const keyword of asset.keywords) {
        const keywordLower = keyword.toLowerCase();
        if (keywordLower.length >= 3 && textToSearch.includes(keywordLower)) {
          matchedTerms.push(keyword);
          const keywordScore = calculateKeywordScore(keyword, textToSearch);
          highestScore = Math.max(highestScore, keywordScore);
        }
      }
    }

    // Strategy 4: Fund family matching for mutual funds/ETFs
    // Check if this asset's symbol prefix matches a known fund family
    const symbolPrefix = asset.symbol.slice(0, 2).toUpperCase();
    const fundFamilyTerms = FUND_FAMILY_PATTERNS[symbolPrefix];
    if (fundFamilyTerms) {
      for (const familyTerm of fundFamilyTerms) {
        if (textToSearch.includes(familyTerm.toLowerCase())) {
          matchedTerms.push(`Fund family: ${familyTerm}`);
          highestScore = Math.max(highestScore, 0.65); // Lower score for family-only match
          if (matchType === 'keyword_match') matchType = 'keyword_match';
        }
      }
    }

    // Strategy 5: ETF/Index fund general matching
    // If asset looks like an ETF (3-4 letter symbol), match general ETF news
    if (asset.symbol.length <= 4 && !asset.symbol.endsWith('X')) {
      const etfTerms = ['etf', 'exchange traded fund', 'index fund'];
      for (const term of etfTerms) {
        if (textToSearch.includes(term)) {
          // Only match if the article is about ETFs in general AND mentions related keywords
          const relatedTerms = ['market', 'investment', 'portfolio', 'fund', 'index'];
          const hasRelated = relatedTerms.some(r => textToSearch.includes(r));
          if (hasRelated) {
            matchedTerms.push(`ETF news: ${term}`);
            highestScore = Math.max(highestScore, 0.45); // Lower score for general ETF news
          }
        }
      }
    }

    // LOWER threshold for matches (be more inclusive)
    if (matchedTerms.length > 0 && highestScore > 0.25) {
      matches.push({
        assetId: asset.id,
        matchType,
        relevanceScore: Math.min(highestScore, 1.0),
        matchedTerms: [...new Set(matchedTerms)],
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

    const { data: newsItems, error: newsError } = await (supabase
      .from('news_items') as any)
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

        const { error: insertError } = await (supabase
          .from('news_asset_relevance') as any)
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
      await (supabase.from('news_items') as any).update({ is_processed: true }).eq('id', (newsItem as any).id);

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

  const { data: unprocessedItems, error } = await (supabase as any)
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

  const newsItemIds = unprocessedItems.map((item: any) => item.id);
  return processNewsRelevance(newsItemIds);
}

/**
 * Get relevant news for a user's tracked assets
 */
export async function getRelevantNewsForUser(
  userId: string,
  hoursBack: number = 24,
  limit: number = 50,
  portfolioId?: string,
  supabaseClient?: any
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
      matchedTerms?: string[];
    }[];
  }[]
> {
  // Use provided client or create default server client
  const supabase = supabaseClient || createServerClient();

  const cutoffDate = new Date();
  cutoffDate.setHours(cutoffDate.getHours() - hoursBack);

  // Get user's tracked assets (optionally filtered by portfolio)
  let assetsQuery = supabase
    .from('user_assets')
    .select(
      `
      asset_id,
      importance_level,
      portfolio_id,
      assets!inner (
        id,
        symbol,
        name
      )
    `
    )
    .eq('user_id', userId);

  // Apply portfolio filter if provided
  if (portfolioId) {
    assetsQuery = assetsQuery.eq('portfolio_id', portfolioId);
  }

  const { data: userAssets, error: userAssetsError } = await assetsQuery;

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
        matched_terms,
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
        news: relevantNews.map((r: any) => {
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
            matchedTerms: r.matched_terms || [],
          };
        }),
      });
    }
  }

  // Sort by number of news items (most active assets first)
  return results.sort((a, b) => b.news.length - a.news.length);
}
