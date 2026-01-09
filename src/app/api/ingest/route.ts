import { NextResponse } from 'next/server';
import { ingestNewsAPI } from '@/lib/ingestion/newsapi';
import { ingestFinnhub } from '@/lib/ingestion/finnhub';
import { ingestTiingo } from '@/lib/ingestion/tiingo';
import { ingestRSSFeeds } from '@/lib/ingestion/rss';
import { ingestAgenticNews } from '@/lib/ingestion/agent';
import { processAllUnprocessedNews } from '@/lib/relevance/filter';
import { createServerSupabaseClient } from '@/lib/supabase/server';

/**
 * Manual ingestion endpoint - allows triggering news ingestion from the dashboard
 * POST /api/ingest
 */
export async function POST() {
  const supabase = await createServerSupabaseClient();
  
  // Check if user is authenticated
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const startTime = Date.now();
  const results: Record<string, unknown> = {};
  const errors: string[] = [];

  try {
    // Run ingestion in parallel where possible
    console.log('Starting News ingestion...');
    const ingestionPromises = [
      ingestNewsAPI().catch(err => {
        console.error('NewsAPI error:', err);
        return { sourceName: 'NewsAPI', error: err.message };
      }),
      ingestFinnhub().catch(err => {
        console.error('Finnhub error:', err);
        return { sourceName: 'Finnhub', error: err.message };
      }),
      ingestTiingo().catch(err => {
        console.error('Tiingo error:', err);
        return { sourceName: 'Tiingo', error: err.message };
      }),
      ingestRSSFeeds().catch(err => {
        console.error('RSS error:', err);
        return [{ sourceName: 'RSS', error: err.message }];
      }),
      ingestAgenticNews().catch(err => {
        console.error('Agentic News error:', err);
        return { sourceName: 'Agentic News', error: err.message };
      })
    ];

    const [newsApiResult, finnhubResult, tiingoResult, rssResults, agenticResult] = await Promise.all(ingestionPromises);
    
    results.newsApi = newsApiResult;
    results.finnhub = finnhubResult;
    results.tiingo = tiingoResult;
    results.rss = rssResults;
    results.agentic = agenticResult;

    console.log('News ingestion complete. Processing relevance...');
    try {
      const relevanceResult = await processAllUnprocessedNews();
      results.relevance = relevanceResult;
      console.log(`Relevance: ${relevanceResult.processed} processed, ${relevanceResult.matches} matches`);
    } catch (error) {
      const msg = error instanceof Error ? error.message : 'Relevance error';
      errors.push(msg);
      console.error('Relevance error:', msg);
    }

    return NextResponse.json({
      success: true,
      duration_ms: Date.now() - startTime,
      results,
      errors: errors.length > 0 ? errors : undefined,
    });
  } catch (error) {
    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
        duration_ms: Date.now() - startTime,
      },
      { status: 500 }
    );
  }
}
