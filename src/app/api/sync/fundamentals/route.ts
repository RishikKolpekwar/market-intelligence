import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { getEvEbitda, getNextEarningsDate } from '@/lib/financial-data/fmp';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * POST /api/sync/fundamentals
 * Sync EV/EBITDA and earnings dates for all tracked assets
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
      .select('id, asset_id, assets!inner(id, symbol)')
      .eq('user_id', user.id);

    if (!userAssets || userAssets.length === 0) {
      return NextResponse.json({
        success: true,
        message: 'No assets to sync',
        synced: 0,
      });
    }

    let syncedCount = 0;
    const errors: string[] = [];

    for (const userAsset of userAssets) {
      try {
        const symbol = (userAsset as any).assets.symbol;

        // Fetch EV/EBITDA
        const evEbitda = await getEvEbitda(symbol);

        // Fetch next earnings date
        const nextEarningsDate = await getNextEarningsDate(symbol);

        // Update user_assets with fundamentals
        await supabase
          .from('user_assets')
          .update({
            ev_ebitda: evEbitda,
            next_earnings_date: nextEarningsDate,
            updated_at: new Date().toISOString(),
          })
          .eq('id', userAsset.id);

        syncedCount++;

        // Rate limit: wait 300ms between requests (FMP has stricter limits)
        await new Promise((resolve) => setTimeout(resolve, 300));
      } catch (error) {
        console.error(`Error syncing fundamentals for asset:`, error);
        errors.push(`${(userAsset as any).assets.symbol}: ${error instanceof Error ? error.message : 'Unknown error'}`);
      }
    }

    return NextResponse.json({
      success: true,
      message: `Synced ${syncedCount} assets`,
      synced: syncedCount,
      total: userAssets.length,
      errors: errors.length > 0 ? errors : undefined,
    });
  } catch (error) {
    console.error('Error syncing fundamentals:', error);
    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : 'Failed to sync fundamentals',
      },
      { status: 500 }
    );
  }
}
