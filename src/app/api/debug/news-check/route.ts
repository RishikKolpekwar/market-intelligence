import { NextRequest, NextResponse } from 'next/server';
import { createServerSupabaseClient } from '@/lib/supabase/server';
import { getRelevantNewsForUser } from '@/lib/relevance/filter';

/**
 * Debug endpoint to check news availability
 * GET /api/debug/news-check?portfolio_id=xxx
 */
export async function GET(request: NextRequest) {
  const supabase = await createServerSupabaseClient();

  const { data: { user } } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const { searchParams } = new URL(request.url);
  const portfolioId = searchParams.get('portfolio_id');

  try {
    // Check user assets
    let assetsQuery = supabase
      .from('user_assets')
      .select(`
        id,
        portfolio_id,
        assets!inner (
          id,
          symbol,
          name
        )
      `)
      .eq('user_id', user.id);

    if (portfolioId) {
      assetsQuery = assetsQuery.eq('portfolio_id', portfolioId);
    }

    const { data: userAssets, error: assetsError } = await assetsQuery;

    if (assetsError) {
      return NextResponse.json({ error: assetsError.message }, { status: 500 });
    }

    // Get news for last 2 weeks
    const newsLast2w = await getRelevantNewsForUser(user.id, 336, 30, portfolioId || undefined);

    // Get news for last 7 days
    const newsLast7d = await getRelevantNewsForUser(user.id, 168, 30, portfolioId || undefined);

    // Get total news count per asset
    const newsCountsPerAsset = [];
    for (const ua of userAssets || []) {
      const assetId = (ua as any).assets?.id;
      if (!assetId) continue;

      const { count, error } = await supabase
        .from('news_asset_relevance')
        .select('id', { count: 'exact', head: true })
        .eq('asset_id', assetId);

      newsCountsPerAsset.push({
        symbol: (ua as any).assets?.symbol,
        name: (ua as any).assets?.name,
        totalArticles: count || 0,
      });
    }

    return NextResponse.json({
      user: {
        id: user.id,
        email: user.email,
      },
      portfolio: portfolioId || 'all',
      assets: {
        total: userAssets?.length || 0,
        list: userAssets?.map((ua: any) => ({
          symbol: ua.assets?.symbol,
          name: ua.assets?.name,
        })),
      },
      news: {
        last2w: {
          assets: newsLast2w.length,
          totalArticles: newsLast2w.reduce((sum, a) => sum + a.news.length, 0),
          breakdown: newsLast2w.map(a => ({
            symbol: a.assetSymbol,
            articles: a.news.length,
          })),
        },
        last7d: {
          assets: newsLast7d.length,
          totalArticles: newsLast7d.reduce((sum, a) => sum + a.news.length, 0),
        },
        perAsset: newsCountsPerAsset,
      },
    });
  } catch (error) {
    console.error('Debug error:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    );
  }
}
