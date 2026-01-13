import { NormalizedArticle, IngestionResult } from '@/types/ingestion';
import { generateContentHash } from './normalizer';
import { createServerClient } from '@/lib/supabase/client';
import { callGemini } from '../llm/gemini';

/**
 * Perform a deep research on a stock using Gemini's search capabilities
 */
async function researchStockWithAI(symbol: string, name: string): Promise<any[]> {
  const prompt = `
    You are a professional equity analyst. Perform a deep research for ${name} (${symbol}) for the last 48 hours.
    
    Identify the 3-5 most critical developments (e.g., product rumors, major partnerships, earnings expectations, regulatory news).
    
    For each development, you MUST provide:
    1. A clear "headline"
    2. A "context" paragraph explaining why this matters for the stock price or the company's future
    3. The specific "url" of the source news article
    4. The "published_date" (ISO format)
    
    Return ONLY a JSON array of objects with these keys: "headline", "context", "url", "published_date".
  `;

  try {
    // Use Gemini with Search Tool for high-quality, up-to-date research
    const { text } = await callGemini(prompt, { useSearch: true, jsonMode: true });
    return JSON.parse(text);
  } catch (error) {
    console.error(`Gemini research failed for ${symbol}:`, error);
    return [];
  }
}

/**
 * Agentic News Discovery Ingestion
 * Now uses Gemini's internal search + contextualization
 */
export async function ingestAgenticNews(): Promise<IngestionResult> {
  const startTime = Date.now();
  const supabase = createServerClient();
  const errors: string[] = [];

  let itemsFetched = 0;
  let itemsNew = 0;
  let itemsDuplicate = 0;
  let itemsFailed = 0;

  try {
    // Get tracked assets
    const { data: trackedAssets } = await (supabase
      .from('user_assets') as any)
      .select('asset_id, assets!inner(symbol, name)')
      .limit(10); 

    if (!trackedAssets || trackedAssets.length === 0) {
      return {
        sourceName: 'AI Researcher',
        itemsFetched: 0,
        itemsNew: 0,
        itemsDuplicate: 0,
        itemsFailed: 0,
        durationMs: Date.now() - startTime,
      };
    }

    for (const ua of trackedAssets) {
      const asset = ua.assets as any;
      const symbol = asset.symbol;
      const name = asset.name;
      if (!symbol) continue;

      console.log(`AI Agent performing deep research for ${symbol}...`);
      
      // 1. Research and Contextualize in one step using Gemini's search
      const keyDevelopments = await researchStockWithAI(symbol, name);
      itemsFetched += keyDevelopments.length;

      // 2. Save each development as a news item with AI Context
      for (const dev of keyDevelopments) {
        const hash = generateContentHash(dev.headline, dev.url);

        // Save as a news item
        const { data: newsItem, error: newsError } = await (supabase.from('news_items') as any).upsert({
          source_name: 'AI Analyst',
          title: dev.headline,
          summary: dev.context,
          url: dev.url,
          published_at: dev.published_date || new Date().toISOString(),
          mentioned_symbols: [symbol],
          content_hash: hash,
        }, { onConflict: 'content_hash' }).select('id').single();

        if (newsItem) {
          // Link it with the AI context in the relevance table
          await (supabase.from('news_asset_relevance') as any).upsert({
            news_item_id: (newsItem as any).id,
            asset_id: (ua as any).asset_id,
            match_type: 'llm_inferred',
            relevance_score: 0.99, // Highly relevant since AI picked it
            relevance_summary: dev.context,
            matched_terms: [symbol]
          }, { onConflict: 'news_item_id,asset_id' });
          
          itemsNew++;
        }
      }
    }
  } catch (error) {
    errors.push(error instanceof Error ? error.message : 'Unknown error');
  }

  return {
    sourceName: 'AI Researcher',
    itemsFetched,
    itemsNew,
    itemsDuplicate,
    itemsFailed,
    errors: errors.length > 0 ? errors : undefined,
    durationMs: Date.now() - startTime,
  };
}
