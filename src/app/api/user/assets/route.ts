import { NextRequest, NextResponse } from 'next/server';
import { createServerClient } from '@/lib/supabase/client';
import { upsertAssetWithQuote } from '@/lib/market-data/symbol-lookup';

// Helper to get Supabase client with access token from header
function getSupabaseWithAuth(request: NextRequest) {
  const authHeader = request.headers.get('authorization');
  let accessToken: string | undefined;
  
  if (authHeader && authHeader.startsWith('Bearer ')) {
    accessToken = authHeader.replace('Bearer ', '');
  }
  
  return createServerClient({ accessToken });
}

/**
 * POST /api/user/assets
 * Add a new asset to user's portfolio
 */
export async function POST(request: NextRequest): Promise<NextResponse> {
  const supabase = getSupabaseWithAuth(request);

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  // Parse and validate request body
  let body;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
  }

  const { symbol, portfolio_id, portfolio_percentage, importance_level } = body;

  if (!symbol || typeof symbol !== 'string') {
    return NextResponse.json({ error: 'Symbol is required' }, { status: 400 });
  }

  if (portfolio_percentage !== undefined && (typeof portfolio_percentage !== 'number' || portfolio_percentage < 0 || portfolio_percentage > 100)) {
    return NextResponse.json({ error: 'Portfolio percentage must be between 0 and 100' }, { status: 400 });
  }

  try {
    // Upsert the asset (create or update in assets table)
    const asset = await upsertAssetWithQuote(symbol.toUpperCase());
    
    if (!asset) {
      return NextResponse.json({ error: 'Failed to create or find asset' }, { status: 500 });
    }

    // Check if user already has this asset in this portfolio
    const existingQuery = supabase
      .from('user_assets')
      .select('id')
      .eq('user_id', user.id)
      .eq('asset_id', asset.id);
    
    if (portfolio_id) {
      existingQuery.eq('portfolio_id', portfolio_id);
    } else {
      existingQuery.is('portfolio_id', null);
    }

    const { data: existing } = await existingQuery.single();

    if (existing) {
      return NextResponse.json({ error: 'Asset already exists in this portfolio' }, { status: 400 });
    }

    // Create the user_asset entry
    const { data: userAsset, error: insertError } = await (supabase
      .from('user_assets') as any)
      .insert({
        user_id: user.id,
        asset_id: asset.id,
        portfolio_id: portfolio_id || null,
        portfolio_percentage: portfolio_percentage !== undefined ? portfolio_percentage : null,
        importance_level: importance_level || 'normal',
      })
      .select(`
        id,
        portfolio_percentage,
        importance_level,
        assets!inner (
          id,
          symbol,
          name
        )
      `)
      .single();

    if (insertError) {
      console.error('Error creating user_asset:', insertError);
      return NextResponse.json({ error: insertError.message }, { status: 500 });
    }

    return NextResponse.json({ success: true, userAsset });
  } catch (error: any) {
    console.error('Unexpected error adding asset:', error);
    return NextResponse.json({ error: error.message || 'An unexpected error occurred' }, { status: 500 });
  }
}