import { NextRequest, NextResponse } from 'next/server';
import { ingestNewsAPI } from '@/lib/ingestion/newsapi';
import { ingestFinnhub } from '@/lib/ingestion/finnhub';
import { ingestRSSFeeds } from '@/lib/ingestion/rss';
import { processAllUnprocessedNews } from '@/lib/relevance/filter';
import { createServerClient } from '@/lib/supabase/client';

/**
 * Cron job for ingesting news from all sources
 * Schedule: Every 2 hours during market hours (6 AM - 10 PM EST)
 * Vercel cron: 0 6,8,10,12,14,16,18,20,22 * * *
 */

export const maxDuration = 60; // 60 seconds max runtime

export async function GET(request: NextRequest) {
  // Verify cron secret for security
  const authHeader = request.headers.get('authorization');
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const supabase = createServerClient();
  const startTime = Date.now();
  const results: Record<string, unknown> = {};
  const errors: string[] = [];

  // Create ingestion log entry
  const { data: logEntry } = await supabase
    .from('ingestion_log')
    .insert({
      source_name: 'all_sources',
      run_type: 'scheduled',
      status: 'started',
    })
    .select('id')
    .single();

  try {
    // 1. Ingest from NewsAPI
    console.log('Starting NewsAPI ingestion...');
    try {
      const newsApiResult = await ingestNewsAPI();
      results.newsApi = newsApiResult;
      console.log(`NewsAPI: ${newsApiResult.itemsNew} new items`);
      if (newsApiResult.items && Array.isArray(newsApiResult.items)) {
        console.log('NewsAPI sample items:', newsApiResult.items.slice(0, 3));
      }
    } catch (error) {
      const msg = error instanceof Error ? error.message : 'NewsAPI error';
      errors.push(msg);
      console.error('NewsAPI error:', error);
    }

    // 2. Ingest from Finnhub
    console.log('Starting Finnhub ingestion...');
    try {
      const finnhubResult = await ingestFinnhub();
      results.finnhub = finnhubResult;
      console.log(`Finnhub: ${finnhubResult.itemsNew} new items`);
      if (finnhubResult.items && Array.isArray(finnhubResult.items)) {
        console.log('Finnhub sample items:', finnhubResult.items.slice(0, 3));
      }
    } catch (error) {
      const msg = error instanceof Error ? error.message : 'Finnhub error';
      errors.push(msg);
      console.error('Finnhub error:', error);
    }

    // 3. Ingest from RSS feeds
    console.log('Starting RSS ingestion...');
    try {
      const rssResults = await ingestRSSFeeds();
      results.rss = rssResults;
      const totalRssNew = rssResults.reduce((sum, r) => sum + r.itemsNew, 0);
      console.log(`RSS: ${totalRssNew} new items from ${rssResults.length} feeds`);
    } catch (error) {
      const msg = error instanceof Error ? error.message : 'RSS error';
      errors.push(msg);
      console.error('RSS error:', msg);
    }

    // 4. Process relevance for new items
    console.log('Processing relevance...');
    try {
      const relevanceResult = await processAllUnprocessedNews();
      results.relevance = relevanceResult;
      console.log(`Relevance: ${relevanceResult.processed} processed, ${relevanceResult.matches} matches`);
    } catch (error) {
      const msg = error instanceof Error ? error.message : 'Relevance error';
      errors.push(msg);
      console.error('Relevance error:', msg);
    }

    // Update ingestion log
    await supabase
      .from('ingestion_log')
      .update({
        status: errors.length > 0 ? 'completed' : 'completed',
        completed_at: new Date().toISOString(),
        duration_ms: Date.now() - startTime,
        error_message: errors.length > 0 ? errors.join('; ') : null,
        error_details: errors.length > 0 ? { errors } : null,
      })
      .eq('id', logEntry?.id);

    return NextResponse.json({
      success: true,
      duration_ms: Date.now() - startTime,
      results,
      errors: errors.length > 0 ? errors : undefined,
    });
  } catch (error) {
    // Update log with failure
    await supabase
      .from('ingestion_log')
      .update({
        status: 'failed',
        completed_at: new Date().toISOString(),
        duration_ms: Date.now() - startTime,
        error_message: error instanceof Error ? error.message : 'Unknown error',
      })
      .eq('id', logEntry?.id);

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
