import { NextRequest, NextResponse } from 'next/server';
import { createServerClient } from '@/lib/supabase/client';
import { z } from 'zod';
import { upsertAssetWithQuote } from '@/lib/market-data/symbol-lookup';

// Helper to get Supabase client with access token from header
function getSupabaseWithAuth(request: NextRequest) {
  const authHeader = request.headers.get('authorization');
  console.log('Authorization header (API):', authHeader); // Debug log
  let accessToken = null;
  if (authHeader && authHeader.startsWith('Bearer ')) {
    accessToken = authHeader.replace('Bearer ', '');
  }
  return createServerClient({ accessToken });
}

// Support both asset_id (for existing assets) and symbol (for auto-detection)
const addAssetSchema = z.object({
  asset_id: z.string().uuid().optional(),
  symbol: z.string().min(1).max(10).optional(),
  importance_level: z.enum(['low', 'normal', 'high', 'critical']).default('normal'),
  shares_held: z.number().optional(),
  average_cost: z.number().optional(),
  portfolio_id: z.string().uuid().optional(),
  portfolio_percentage: z.number().min(0).max(100), // REQUIRED: allocation percentage
}).refine(data => data.asset_id || data.symbol, {
  message: 'Either asset_id or symbol must be provided',
});

/**
 * GET /api/user/assets
 * Get current user's tracked assets
 */
export async function GET(request: NextRequest) {
  const supabase = getSupabaseWithAuth(request);

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const { data: userAssets, error } = await supabase
    .from('user_assets')
    .select(
      `
      id,
      importance_level,
      shares_held,
      average_cost,
      notes,
      created_at,
      assets!inner (
        id,
        symbol,
        name,
        asset_type,
        exchange,
        sector,
        current_price,
        previous_close,
        price_change_24h,
        price_change_pct_24h,
        day_high,
        day_low,
        week_52_high,
        week_52_low,
        volume,
        market_cap,
        last_price_update
      )
    `
    )
    .eq('user_id', user.id)
    .order('created_at', { ascending: false });

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ assets: userAssets });
}

/**
 * POST /api/user/assets
 * Add an asset to user's watchlist
 */
export async function POST(request: NextRequest) {
  const supabase = getSupabaseWithAuth(request);

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const body = await request.json();
  const parsed = addAssetSchema.safeParse(body);

  if (!parsed.success) {
    return NextResponse.json(
      { error: 'Invalid request body', details: parsed.error.format() },
      { status: 400 }
    );
  }

  const { asset_id, symbol, importance_level, shares_held, average_cost, portfolio_id, portfolio_percentage } = parsed.data;

  let finalAssetId = asset_id;

  // If symbol is provided, auto-detect type and create/get asset
  if (symbol && !asset_id) {
    const asset = await upsertAssetWithQuote(symbol);
    
    if (!asset) {
      return NextResponse.json(
        { error: `Could not find or create asset for symbol: ${symbol}` },
        { status: 400 }
      );
    }
    
    finalAssetId = asset.id;
  } else if (asset_id) {
    // Verify asset exists
    const { data: asset, error: assetError } = await supabase
      .from('assets')
      .select('id')
      .eq('id', asset_id)
      .single();

    if (assetError || !asset) {
      return NextResponse.json({ error: 'Asset not found' }, { status: 404 });
    }
  }

  if (!finalAssetId) {
    return NextResponse.json({ error: 'Could not determine asset' }, { status: 400 });
  }

  // Add to user's watchlist
  const { data: userAsset, error: insertError } = await supabase
    .from('user_assets')
    .upsert(
      {
        user_id: user.id,
        asset_id: finalAssetId,
        importance_level,
        shares_held,
        average_cost,
        portfolio_id: portfolio_id || null,
        portfolio_percentage,
      },
      {
        onConflict: 'user_id,asset_id,portfolio_id',
      }
    )
    .select(`
      id,
      importance_level,
      shares_held,
      average_cost,
      assets!inner (
        id,
        symbol,
        name,
        asset_type,
        current_price,
        price_change_24h,
        price_change_pct_24h,
        week_52_high,
        week_52_low
      )
    `)
    .single();

  if (insertError) {
    return NextResponse.json({ error: insertError.message }, { status: 500 });
  }

  // AUTO-SYNC: Trigger financial data sync and news ingestion for the new asset
  const assetSymbol = (userAsset as any)?.assets?.symbol;
  if (assetSymbol) {
    console.log(`[AddAsset] Triggering background sync for ${assetSymbol}...`);
    
    // Get auth token to pass to sync endpoints
    const authHeader = request.headers.get('authorization') || '';
    
    // Fire-and-forget: Sync financial data
    fetch(`${process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3002'}/api/sync/all`, {
      method: 'POST',
      headers: { 
        'Authorization': authHeader,
        'Content-Type': 'application/json'
      },
    }).then(res => {
      if (res.ok) console.log(`[AddAsset] Financial sync triggered for ${assetSymbol}`);
      else console.error(`[AddAsset] Financial sync failed for ${assetSymbol}`);
    }).catch(err => console.error(`[AddAsset] Sync error:`, err));

    // Fire-and-forget: Ingest news for this symbol
    fetch(`${process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3002'}/api/ingest`, {
      method: 'POST',
      headers: { 
        'Authorization': authHeader,
        'Content-Type': 'application/json'
      },
    }).then(res => {
      if (res.ok) console.log(`[AddAsset] News ingestion triggered for ${assetSymbol}`);
      else console.error(`[AddAsset] News ingestion failed for ${assetSymbol}`);
    }).catch(err => console.error(`[AddAsset] Ingest error:`, err));
  }

  return NextResponse.json({ success: true, userAsset });
}

/**
 * DELETE /api/user/assets
 * Remove an asset from user's watchlist
 */
export async function DELETE(request: NextRequest) {
  const supabase = getSupabaseWithAuth(request);

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const { searchParams } = new URL(request.url);
  const assetId = searchParams.get('asset_id');

  if (!assetId) {
    return NextResponse.json({ error: 'asset_id is required' }, { status: 400 });
  }

  const { error } = await supabase
    .from('user_assets')
    .delete()
    .eq('user_id', user.id)
    .eq('asset_id', assetId);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ success: true });
}
