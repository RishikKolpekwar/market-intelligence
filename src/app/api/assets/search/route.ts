import { NextRequest, NextResponse } from 'next/server';
import { createServerClient } from '@/lib/supabase/client';

/**
 * GET /api/assets/search?q=AAPL
 * Search for assets by symbol or name
 */
export async function GET(request: NextRequest) {
  const searchParams = request.nextUrl.searchParams;
  const query = searchParams.get('q');

  if (!query || query.length < 1) {
    return NextResponse.json({ assets: [] });
  }

  const supabase = createServerClient();

  const { data: assets, error } = await supabase
    .from('assets')
    .select('id, symbol, name, asset_type, exchange, sector')
    .eq('is_active', true)
    .or(`symbol.ilike.%${query}%,name.ilike.%${query}%`)
    .limit(20);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ assets });
}
