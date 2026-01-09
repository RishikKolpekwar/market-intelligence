import { NextResponse } from 'next/server';
import { getRelevantNewsForUser } from '@/lib/relevance/filter';
import { generateDailyBriefing, generateEmptyBriefing } from '@/lib/llm/briefing-generator';
import { createServerSupabaseClient } from '@/lib/supabase/server';
import { BriefingInput, AssetWithNews } from '@/types/ingestion';

/**
 * POST /api/briefing/generate - Manually generate a briefing for the current user
 */
export async function POST() {
  const supabase = await createServerSupabaseClient();
  
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const startTime = Date.now();
  const today = new Date();

  try {
    // Get user profile
    const { data: userProfile } = await supabase
      .from('users')
      .select('email, full_name, timezone')
      .eq('id', user.id)
      .single();

    // Get relevant news for this user's tracked assets
    const relevantNews = await getRelevantNewsForUser(user.id, 48, 30); // Last 48 hours

    // Build briefing input
    const assets: AssetWithNews[] = relevantNews.map((item) => ({
      assetId: item.assetId,
      symbol: item.assetSymbol,
      name: item.assetName,
      assetType: 'stock',
      importanceLevel: 'normal',
      newsItems: item.news.map((n) => ({
        id: n.id,
        title: n.title,
        summary: n.summary || undefined,
        url: n.url,
        sourceName: n.sourceName,
        publishedAt: new Date(n.publishedAt),
        relevanceScore: n.relevanceScore,
        matchType: n.matchType as 'symbol_mention' | 'keyword_match' | 'llm_inferred' | 'manual',
        matchedTerms: [],
      })),
    }));

    const briefingInput: BriefingInput = {
      userId: user.id,
      userEmail: userProfile?.email || user.email || '',
      userName: userProfile?.full_name || undefined,
      briefingDate: today,
      timezone: userProfile?.timezone || 'UTC',
      assets,
    };

    let briefing;
    const totalNewsCount = assets.reduce((sum, a) => sum + a.newsItems.length, 0);

    if (totalNewsCount === 0) {
      briefing = generateEmptyBriefing(briefingInput);
    } else {
      briefing = await generateDailyBriefing(briefingInput);
    }

    // Save the briefing to database
    const { error: saveError } = await supabase.from('daily_briefings').upsert(
      {
        user_id: user.id,
        briefing_date: today.toISOString().split('T')[0],
        market_overview: briefing.marketOverview,
        asset_summaries: briefing.assetSummaries,
        notable_headlines: briefing.notableHeadlines,
        full_briefing_html: briefing.fullBriefingHtml,
        full_briefing_text: briefing.fullBriefingText,
        total_news_items: totalNewsCount,
        assets_covered: assets.length,
        llm_model: 'llmModel' in briefing ? briefing.llmModel : undefined,
        llm_tokens_used: 'tokensUsed' in briefing ? briefing.tokensUsed : undefined,
        generation_time_ms: Date.now() - startTime,
      },
      {
        onConflict: 'user_id,briefing_date',
      }
    );

    if (saveError) {
      console.error('Error saving briefing:', saveError);
    }

    return NextResponse.json({
      success: true,
      briefing: {
        date: today.toISOString().split('T')[0],
        marketOverview: briefing.marketOverview,
        assetSummaries: briefing.assetSummaries,
        notableHeadlines: briefing.notableHeadlines,
        totalNewsItems: totalNewsCount,
        assetsCovered: assets.length,
      },
      generationTimeMs: Date.now() - startTime,
    });
  } catch (error) {
    console.error('Error generating briefing:', error);
    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : 'Failed to generate briefing',
      },
      { status: 500 }
    );
  }
}
