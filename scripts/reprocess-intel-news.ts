/**
 * Script to reprocess Intel news articles
 * This will find Intel-related articles and properly match them to the Intel asset
 */

import { createClient } from '@supabase/supabase-js';
import { findRelevantAssets } from '../src/lib/relevance/filter';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;

const supabase = createClient(supabaseUrl, supabaseKey);

async function reprocessIntelNews() {
  console.log('🔍 Finding Intel asset...');

  // Get Intel asset
  const { data: intelAsset, error: assetError } = await supabase
    .from('assets')
    .select('id, symbol, name, keywords')
    .eq('symbol', 'INTC')
    .single();

  if (assetError || !intelAsset) {
    console.error('❌ Could not find Intel asset:', assetError);
    return;
  }

  console.log(`✓ Found Intel: ${intelAsset.name} (${intelAsset.symbol})`);

  // Find all news articles mentioning Intel
  const { data: newsItems, error: newsError } = await supabase
    .from('news_items')
    .select('id, title, summary, mentioned_symbols, mentioned_entities')
    .or(`title.ilike.%Intel%,summary.ilike.%Intel%,title.ilike.%INTC%,summary.ilike.%INTC%`)
    .order('published_at', { ascending: false })
    .limit(100);

  if (newsError) {
    console.error('❌ Error fetching news:', newsError);
    return;
  }

  console.log(`\n📰 Found ${newsItems?.length || 0} Intel-related articles`);

  if (!newsItems || newsItems.length === 0) {
    console.log('No articles found to process');
    return;
  }

  let matched = 0;
  let skipped = 0;

  for (const newsItem of newsItems) {
    // Use the relevance matching engine
    const matches = findRelevantAssets(newsItem, [intelAsset]);

    if (matches.length > 0) {
      const match = matches[0]; // Should be Intel

      // Upsert to news_asset_relevance
      const { error: upsertError } = await supabase
        .from('news_asset_relevance')
        .upsert({
          news_item_id: newsItem.id,
          asset_id: match.assetId,
          match_type: match.matchType,
          relevance_score: match.relevanceScore,
          matched_terms: match.matchedTerms,
        }, {
          onConflict: 'news_item_id,asset_id',
        });

      if (upsertError) {
        console.error(`  ❌ Error matching article: ${newsItem.title.substring(0, 50)}...`, upsertError);
      } else {
        matched++;
        console.log(`  ✓ Matched: "${newsItem.title.substring(0, 60)}..." (score: ${match.relevanceScore.toFixed(2)})`);
      }
    } else {
      skipped++;
    }
  }

  console.log(`\n✅ Processing complete!`);
  console.log(`   Matched: ${matched} articles`);
  console.log(`   Skipped: ${skipped} articles (low relevance)`);
}

reprocessIntelNews()
  .then(() => {
    console.log('\n🎉 Done!');
    process.exit(0);
  })
  .catch((err) => {
    console.error('❌ Error:', err);
    process.exit(1);
  });
