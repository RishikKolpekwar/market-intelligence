import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { getTimeSeries, getQuote } from '@/lib/financial-data/twelve-data';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * POST /api/sync/prices
 * Sync historical prices and current data for all tracked assets
 */
export async function POST(request: Request) {
  const authHeader = request.headers.get('authorization') || '';
  const token = authHeader.toLowerCase().startsWith('bearer ') ? authHeader.slice(7) : '';

  if (!token) {
    return NextResponse.json(
      { success: false, error: 'Missing Authorization Bearer token' },
      { status: 401 }
    );
  }

  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      global: { headers: { Authorization: `Bearer ${token}` } },
      auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
    }
  );

  const { data: userRes, error: userErr } = await supabase.auth.getUser(token);
  const user = userRes?.user;

  if (userErr || !user) {
    return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 });
  }

  try {
    // Get all unique assets for this user
    const { data: userAssets } = await supabase
      .from('user_assets')
      .select('asset_id, assets!inner(id, symbol)')
      .eq('user_id', user.id);

    if (!userAssets || userAssets.length === 0) {
      return NextResponse.json({
        success: true,
        message: 'No assets to sync',
        synced: 0,
      });
    }

    // Get unique symbols
    const uniqueAssets = Array.from(
      new Map(
        userAssets.map((ua: any) => [ua.assets.symbol, { id: ua.asset_id, symbol: ua.assets.symbol }])
      ).values()
    );

    let syncedCount = 0;
    const errors: string[] = [];

    for (const asset of uniqueAssets) {
      try {
        // Fetch current quote and 52-week data
        const quote = await getQuote(asset.symbol);

        // Update assets table with current price data
        await supabase
          .from('assets')
          .update({
            current_price: parseFloat(quote.close),
            previous_close: parseFloat(quote.previous_close),
            price_change_24h: parseFloat(quote.change),
            price_change_pct_24h: parseFloat(quote.percent_change),
            week_52_high: parseFloat(quote.fifty_two_week.high),
            week_52_low: parseFloat(quote.fifty_two_week.low),
            last_price_update: new Date().toISOString(),
          })
          .eq('id', asset.id);

        // Fetch historical time series (365 days for year calculation)
        const timeSeries = await getTimeSeries(asset.symbol, 365);

        // Store historical prices (last 365 days)
        if (timeSeries.values && timeSeries.values.length > 0) {
          const priceHistory = timeSeries.values.slice(0, 365).map((value) => ({
            asset_id: asset.id,
            price: parseFloat(value.close),
            price_date: value.datetime.split(' ')[0], // Extract date part
            source: 'twelve_data',
          }));

          // Upsert price history (on conflict update)
          await supabase.from('asset_price_history').upsert(priceHistory, {
            onConflict: 'asset_id,price_date',
            ignoreDuplicates: false,
          });
        }

        syncedCount++;

        // Rate limit: wait 200ms between requests (avoid hitting API limits)
        await new Promise((resolve) => setTimeout(resolve, 200));
      } catch (error) {
        console.error(`Error syncing ${asset.symbol}:`, error);
        errors.push(`${asset.symbol}: ${error instanceof Error ? error.message : 'Unknown error'}`);
      }
    }

    return NextResponse.json({
      success: true,
      message: `Synced ${syncedCount} assets`,
      synced: syncedCount,
      total: uniqueAssets.length,
      errors: errors.length > 0 ? errors : undefined,
    });
  } catch (error) {
    console.error('Error syncing prices:', error);
    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : 'Failed to sync prices',
      },
      { status: 500 }
    );
  }
}
