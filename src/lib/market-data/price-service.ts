/**
 * Price Update Service
 * Fetches and stores daily price snapshots for tracked assets
 */

import { createServerClient } from '@/lib/supabase/client';
import { getMultipleQuotes } from './symbol-lookup';

/**
 * Update prices for all active assets
 */
export async function updateAllAssetPrices(): Promise<{
  updated: number;
  failed: number;
  errors: string[];
}> {
  const supabase = createServerClient();
  const errors: string[] = [];
  let updated = 0;
  let failed = 0;

  // Get all active assets
  const { data: assets } = await supabase
    .from('assets')
    .select('id, symbol')
    .eq('is_active', true);

  if (!assets || assets.length === 0) {
    return { updated: 0, failed: 0, errors: [] };
  }

  // Fetch quotes in batches
  const symbols = assets.map(a => a.symbol);
  const quotes = await getMultipleQuotes(symbols);

  // Update each asset
  for (const asset of assets) {
    const quote = quotes.get(asset.symbol);
    
    if (!quote) {
      failed++;
      errors.push(`No quote data for ${asset.symbol}`);
      continue;
    }

    try {
      // Update asset with latest price
      await supabase
        .from('assets')
        .update({
          current_price: quote.currentPrice,
          previous_close: quote.previousClose,
          price_change_24h: quote.change,
          price_change_pct_24h: quote.changePercent,
          day_high: quote.dayHigh,
          day_low: quote.dayLow,
          week_52_high: quote.week52High,
          week_52_low: quote.week52Low,
          volume: quote.volume,
          market_cap: quote.marketCap,
          nav: quote.nav,
          nav_change: quote.navChange,
          last_price_update: new Date().toISOString(),
        })
        .eq('id', asset.id);

      // Store daily snapshot
      const today = new Date().toISOString().split('T')[0];
      await supabase
        .from('asset_price_history')
        .upsert({
          asset_id: asset.id,
          snapshot_date: today,
          open_price: quote.currentPrice, // Use current as open if not available
          high_price: quote.dayHigh,
          low_price: quote.dayLow,
          close_price: quote.currentPrice,
          volume: quote.volume,
          nav: quote.nav,
          change_amount: quote.change,
          change_percent: quote.changePercent,
        }, { onConflict: 'asset_id,snapshot_date' });

      updated++;
    } catch (error) {
      failed++;
      errors.push(`Failed to update ${asset.symbol}: ${error}`);
    }
  }

  return { updated, failed, errors };
}

/**
 * Update prices for a specific user's tracked assets
 */
export async function updateUserAssetPrices(userId: string): Promise<void> {
  const supabase = createServerClient();

  // Get user's tracked assets
  const { data: userAssets } = await supabase
    .from('user_assets')
    .select('assets!inner(id, symbol)')
    .eq('user_id', userId);

  if (!userAssets || userAssets.length === 0) return;

  const symbols = userAssets.map((ua: any) => ua.assets.symbol);
  const quotes = await getMultipleQuotes(symbols);

  for (const ua of userAssets) {
    const asset = ua.assets as any;
    const quote = quotes.get(asset.symbol);
    
    if (quote) {
      await supabase
        .from('assets')
        .update({
          current_price: quote.currentPrice,
          previous_close: quote.previousClose,
          price_change_24h: quote.change,
          price_change_pct_24h: quote.changePercent,
          day_high: quote.dayHigh,
          day_low: quote.dayLow,
          week_52_high: quote.week52High,
          week_52_low: quote.week52Low,
          volume: quote.volume,
          last_price_update: new Date().toISOString(),
        })
        .eq('id', asset.id);
    }
  }
}

/**
 * Get price history for an asset
 */
export async function getAssetPriceHistory(
  assetId: string,
  days: number = 30
): Promise<{
  date: string;
  close: number;
  change: number;
  changePercent: number;
}[]> {
  const supabase = createServerClient();
  
  const { data } = await supabase
    .from('asset_price_history')
    .select('snapshot_date, close_price, change_amount, change_percent')
    .eq('asset_id', assetId)
    .order('snapshot_date', { ascending: false })
    .limit(days);

  return (data || []).map(d => ({
    date: d.snapshot_date,
    close: d.close_price || 0,
    change: d.change_amount || 0,
    changePercent: d.change_percent || 0,
  }));
}
